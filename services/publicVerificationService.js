const Batch = require("../models/Batch");
const BatchUnit = require("../models/BatchUnit");
const Supplier = require("../models/Supplier");
const PurchaseOrder = require("../models/PurchaseOrder");
const MovementAnchor = require("../models/MovementAnchor");
const batchService = require("./batchService");
const blockchainVerificationService = require("./blockchainVerificationService");
const { toPublicVerificationDto } = require("./publicVerificationDto");
const {
  TOKEN_PATTERN,
  createVerificationToken,
  createVerificationUrl,
  getPublicBaseUrl,
  getUnusualActivityThreshold,
  hasUnusualActivity,
  activityCountOf,
} = require("../utils/publicVerification");

// Only the provenance dates are read from purchase orders; prices, terms and
// notes never leave the database through the public endpoint.
const PUBLIC_PURCHASE_ORDER_FIELDS = "receivedAt items.harvestedOn";

const PUBLIC_SUPPLIER_FIELDS =
  "country province district village publicDisplay publicName publicProducerId publicIdentificationConsent publicLocationPrecision";

// Fields returned when the admin only needs to print labels or a CSV.
const LABEL_FIELDS =
  "batchId unitNumber qrCode verificationToken quantity status assignedShop timestamp verificationCount verificationCountAtSale";

const MAX_PAGE_SIZE = 200;
const MAX_LABEL_PAGE_SIZE = 10000;

class PublicVerificationService {
  constructor({
    BatchModel = Batch,
    UnitModel = BatchUnit,
    SupplierModel = Supplier,
    PurchaseOrderModel = PurchaseOrder,
    AnchorModel = MovementAnchor,
    batchHashService = batchService,
    blockchainService = blockchainVerificationService,
    env = process.env,
  } = {}) {
    this.BatchModel = BatchModel;
    this.UnitModel = UnitModel;
    this.SupplierModel = SupplierModel;
    this.PurchaseOrderModel = PurchaseOrderModel;
    this.AnchorModel = AnchorModel;
    this.batchHashService = batchHashService;
    this.blockchainService = blockchainService;
    this.env = env;
    // Recomputing a batch fingerprint reads every unit in the batch. The
    // fingerprinted unit fields never change after creation, so a customer
    // scan reuses a recent result instead of reading 10,000 units each time.
    this.hashCacheMs = Number(env.PUBLIC_HASH_CACHE_MS) || 10 * 60 * 1000;
    this.hashCache = new Map();
  }

  getPublicBaseUrl() {
    return getPublicBaseUrl(this.env);
  }

  safePublicBaseUrl() {
    try {
      return this.getPublicBaseUrl();
    } catch {
      return null;
    }
  }

  createToken() {
    return createVerificationToken();
  }

  getVerificationUrl(token) {
    return createVerificationUrl(token, this.getPublicBaseUrl());
  }

  // ---------------- Admin: units ----------------

  serializeAdminUnit(unit, publicBaseUrl = null) {
    const data = unit.toObject ? unit.toObject() : { ...unit };
    const verificationUrl =
      data.verificationToken && publicBaseUrl
        ? createVerificationUrl(data.verificationToken, publicBaseUrl)
        : null;
    return {
      ...data,
      verificationUrl,
      // qrCode is part of the anchored batch hash, so it is never rewritten.
      // When it differs from the current link (legacy /trace URL or another
      // host such as localhost), labels printed from it will not verify.
      qrCodeOutdated: Boolean(
        verificationUrl && data.qrCode && data.qrCode !== verificationUrl,
      ),
      unusualActivity: hasUnusualActivity(activityCountOf(data), this.env),
    };
  }

  /** Gives tokens to units created before per-unit tokens existed. */
  async issueMissingTokens(units) {
    const missing = units.filter((unit) => !unit.verificationToken);
    if (!missing.length) return units;
    const now = new Date();
    for (const unit of missing) {
      unit.verificationToken = this.createToken();
      unit.qrGeneratedAt = now;
    }
    await this.UnitModel.bulkWrite(
      missing.map((unit) => ({
        updateOne: {
          filter: { _id: unit._id, verificationToken: { $exists: false } },
          update: {
            $set: {
              verificationToken: unit.verificationToken,
              qrGeneratedAt: now,
            },
          },
        },
      })),
    );
    return units;
  }

  /** Units an admin should look at: no link, outdated label, or odd activity. */
  attentionFilter() {
    const base = this.safePublicBaseUrl();
    if (!base) return {}; // no unit has a usable link yet
    const threshold = getUnusualActivityThreshold(this.env);
    return {
      $or: [
        { verificationToken: { $exists: false } },
        {
          $expr: {
            $ne: [
              "$qrCode",
              { $concat: [base, "/verify/", { $ifNull: ["$verificationToken", ""] }] },
            ],
          },
        },
        {
          $expr: {
            $gt: [
              {
                $subtract: [
                  { $ifNull: ["$verificationCount", 0] },
                  { $ifNull: ["$verificationCountAtSale", 0] },
                ],
              },
              threshold,
            ],
          },
        },
      ],
    };
  }

  /**
   * One page of a batch's units. `filter` is all | attention | scanned |
   * unscanned; `q` matches the start of the unit number. `fields: "labels"`
   * returns light rows (no history) for QR export and CSV, up to 10,000.
   */
  async listAdminUnits(batchId, { page = 1, limit = 50, filter = "all", q = "", fields } = {}) {
    const labelsOnly = fields === "labels";
    const pageSize = Math.min(
      Math.max(Number(limit) || 50, 1),
      labelsOnly ? MAX_LABEL_PAGE_SIZE : MAX_PAGE_SIZE,
    );
    const pageNumber = Math.max(Number(page) || 1, 1);

    const query = { batchId: String(batchId).trim() };
    if (filter === "attention") Object.assign(query, this.attentionFilter());
    if (filter === "scanned") query.verificationCount = { $gt: 0 };
    if (filter === "unscanned") {
      query.$and = [
        { $or: [{ verificationCount: 0 }, { verificationCount: { $exists: false } }] },
      ];
    }
    const digits = String(q || "").replace(/\D/g, "");
    if (digits) {
      query.$expr = {
        $regexMatch: { input: { $toString: "$unitNumber" }, regex: `^${digits}` },
      };
    }

    let cursor = this.UnitModel.find(query)
      .sort({ unitNumber: 1 })
      .skip((pageNumber - 1) * pageSize)
      .limit(pageSize);
    if (labelsOnly) cursor = cursor.select(LABEL_FIELDS);
    const [units, total] = await Promise.all([
      cursor.lean(),
      this.UnitModel.countDocuments(query),
    ]);

    await this.issueMissingTokens(units);
    const publicBaseUrl = this.safePublicBaseUrl();
    const data = units.map((unit) => this.serializeAdminUnit(unit, publicBaseUrl));

    let movementAnchors = {};
    if (!labelsOnly) {
      const roots = Array.from(
        new Set(
          units.flatMap((unit) =>
            (unit.history || []).map((movement) => movement.anchor?.root).filter(Boolean),
          ),
        ),
      );
      if (roots.length) {
        const anchors = await this.AnchorModel.find({ root: { $in: roots } })
          .select("-leaves")
          .lean();
        movementAnchors = Object.fromEntries(anchors.map((anchor) => [anchor.root, anchor]));
      }
    }

    return { units: data, total, page: pageNumber, limit: pageSize, movementAnchors };
  }

  // ---------------- Admin: batches ----------------

  /** Per-batch unit counts computed in the database (no units are loaded). */
  async getUnitSummaries(batchIds) {
    if (!batchIds.length) return new Map();
    const match = { batchId: { $in: batchIds } };
    const [byStatus, attention, scanned] = await Promise.all([
      this.UnitModel.aggregate([
        { $match: match },
        { $group: { _id: { batchId: "$batchId", status: "$status" }, count: { $sum: 1 } } },
      ]),
      this.UnitModel.aggregate([
        { $match: { ...match, ...this.attentionFilter() } },
        { $group: { _id: "$batchId", count: { $sum: 1 } } },
      ]),
      this.UnitModel.aggregate([
        { $match: { ...match, verificationCount: { $gt: 0 } } },
        { $group: { _id: "$batchId", count: { $sum: 1 } } },
      ]),
    ]);
    const summaries = new Map(
      batchIds.map((batchId) => [
        batchId,
        { total: 0, byStatus: {}, needsAttention: 0, scanned: 0 },
      ]),
    );
    for (const row of byStatus) {
      const summary = summaries.get(row._id.batchId);
      summary.byStatus[row._id.status] = row.count;
      summary.total += row.count;
    }
    for (const row of attention) summaries.get(row._id).needsAttention = row.count;
    for (const row of scanned) summaries.get(row._id).scanned = row.count;
    return summaries;
  }

  /** Batch list for admin pages: summaries only, cheap at any size. */
  async listAdminBatches() {
    const batches = await this.BatchModel.find().sort({ createdAt: -1 }).lean();
    const summaries = await this.getUnitSummaries(batches.map((batch) => batch.batchId));
    return batches.map((batch) => ({
      ...batch,
      unitSummary: summaries.get(batch.batchId),
    }));
  }

  /** The blockchain page's list. Same as the batch list. */
  getAdminBlockchainDashboard() {
    return this.listAdminBatches();
  }

  /** Full integrity check for one batch, loaded when an admin selects it. */
  async getAdminBatchVerification(batchId) {
    const batch = await this.BatchModel.findOne({ batchId: String(batchId).trim() }).lean();
    if (!batch) return null;
    const calculatedHash = await this.batchHashService.calculateStoredHash(batch);
    this.hashCache.set(batch.batchId, { hash: calculatedHash, at: Date.now() });
    const blockchain = await this.blockchainService.verifyBatch(batch, calculatedHash);
    const [summaries, anchorCounts] = await Promise.all([
      this.getUnitSummaries([batch.batchId]),
      this.UnitModel.aggregate([
        { $match: { batchId: batch.batchId } },
        { $unwind: "$history" },
        { $group: { _id: { $ifNull: ["$history.anchor.status", "untracked"] }, count: { $sum: 1 } } },
      ]),
    ]);
    return {
      ...batch,
      unitSummary: summaries.get(batch.batchId),
      integrity: { databaseMatchesHash: calculatedHash === batch.dataHash },
      verificationStatus: blockchain.status,
      blockchain,
      blockchainVerification: blockchain,
      movementAnchorCounts: Object.fromEntries(
        anchorCounts.map((row) => [row._id, row.count]),
      ),
    };
  }

  // ---------------- Public ----------------

  async cachedBatchHash(batch) {
    const cached = this.hashCache.get(batch.batchId);
    if (cached && Date.now() - cached.at < this.hashCacheMs) return cached.hash;
    const hash = await this.batchHashService.calculateStoredHash(batch);
    if (this.hashCache.size >= 500) {
      this.hashCache.delete(this.hashCache.keys().next().value);
    }
    this.hashCache.set(batch.batchId, { hash, at: Date.now() });
    return hash;
  }

  async getPublicVerification(token) {
    if (typeof token !== "string" || !TOKEN_PATTERN.test(token)) return null;

    // One atomic update on this unit's own document: count the check and
    // read the unit back. No other unit is loaded.
    const scannedAt = new Date();
    const unit = await this.UnitModel.findOneAndUpdate(
      { verificationToken: token },
      {
        $inc: { verificationCount: 1 },
        $set: { lastVerifiedAt: scannedAt },
        $min: { firstVerifiedAt: scannedAt },
      },
      { returnDocument: "after" },
    ).lean();
    if (!unit) return null;

    const batch = await this.BatchModel.findById(unit.batch).lean();
    if (!batch) return null;

    const supplierIds = Array.from(
      new Set(
        (batch.sourceMaterials || [])
          .map((source) => String(source.supplierId || ""))
          .filter(Boolean),
      ),
    );
    const purchaseOrderIds = Array.from(
      new Set(
        (batch.sourceMaterials || [])
          .map((source) => String(source.purchaseOrderId || ""))
          .filter(Boolean),
      ),
    );
    const [suppliers, purchaseOrders] = await Promise.all([
      this.SupplierModel.find({ _id: { $in: supplierIds } })
        .select(PUBLIC_SUPPLIER_FIELDS)
        .lean(),
      purchaseOrderIds.length
        ? this.PurchaseOrderModel.find({ _id: { $in: purchaseOrderIds } })
            .select(PUBLIC_PURCHASE_ORDER_FIELDS)
            .lean()
        : [],
    ]);
    const supplierRecords = new Map(
      suppliers.map((supplier) => [String(supplier._id), supplier]),
    );
    const purchaseOrderRecords = new Map(
      purchaseOrders.map((order) => [String(order._id), order]),
    );

    const calculatedHash = await this.cachedBatchHash(batch);
    const blockchain = await this.blockchainService.verifyBatch(batch, calculatedHash);

    const movementSteps =
      typeof this.blockchainService.verifyMovements === "function"
        ? await this.blockchainService.verifyMovements(batch.batchId, unit)
        : new Map();

    return toPublicVerificationDto({
      batch,
      unit,
      movementSteps,
      supplierRecords,
      purchaseOrderRecords,
      blockchain,
      env: this.env,
    });
  }
}

module.exports = new PublicVerificationService();
module.exports.PublicVerificationService = PublicVerificationService;
module.exports.TOKEN_PATTERN = TOKEN_PATTERN;
