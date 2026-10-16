const mongoose = require("mongoose");
const Batch = require("../models/Batch");
const BatchUnit = require("../models/BatchUnit");
const { UNIT_STATUSES } = require("../models/movementSchema");
const PurchaseOrder = require("../models/PurchaseOrder");
const Retailer = require("../models/Retailer");
const batchBlockchain = require("../utils/batchBlockchain");
const blockchainVerificationService = require("./blockchainVerificationService");
const {
  createVerificationToken,
  createVerificationUrl,
  getPublicBaseUrl,
  getVerificationTokenFromValue,
} = require("../utils/publicVerification");

const { hashData, movementHashOf } = require("../utils/traceHash");
const movementAnchorService = require("./movementAnchorService");

// Orders can be drawn on once goods start arriving.
const SOURCE_ORDER_STATUSES = ["accepted", "completed"];

/**
 * Quantity of a PO line that has physically arrived. Orders completed before
 * delivery tracking have no receivedQuantity and count as fully received.
 */
const receivedQuantityOf = (purchaseOrder, item) => {
  if (item.receivedQuantity !== undefined && item.receivedQuantity !== null) {
    return Number(item.receivedQuantity);
  }
  return purchaseOrder.orderStatus === "completed" ? Number(item.quantity || 0) : 0;
};

const isCinnamonSource = (item) =>
  item.materialCategory === "cinnamon" ||
  /cinnamon/i.test(item.productName || "");

/**
 * The exact object whose hash is the batch fingerprint. Units are passed in
 * (they live in their own collection) and always sorted by unit number, which
 * is the order they were created in, so fingerprints made before units moved
 * out of the batch document still match.
 */
const getCanonicalBatchData = (batch, units = batch.units || []) => ({
  batchId: batch.batchId,
  productName: batch.productName,
  producedOn: new Date(batch.producedOn).toISOString(),
  totalUnits: batch.totalUnits,
  quantityPerUnit: batch.quantityPerUnit,
  quantityUnit: batch.quantityUnit,
  notes: batch.notes,
  ...(batch.processingLossPercent
    ? { processingLossPercent: batch.processingLossPercent }
    : {}),
  ...(batch.sourceMaterials?.length
    ? {
        sourceMaterials: batch.sourceMaterials.map((source) => ({
          purchaseOrderId: String(source.purchaseOrderId),
          purchaseOrderItemIndex: source.purchaseOrderItemIndex,
          supplierId: String(source.supplierId),
          supplierName: source.supplierName,
          productName: source.productName,
          quantity: source.quantity,
          unit: source.unit,
        })),
      }
    : {}),
  units: [...units]
    .sort((left, right) => left.unitNumber - right.unitNumber)
    .map((unit) => ({
      unitNumber: unit.unitNumber,
      qrCode: unit.qrCode,
      quantity: unit.quantity,
    })),
});

const massToGrams = (quantity, unit) => {
  const factors = {
    g: 1,
    gram: 1,
    grams: 1,
    kg: 1000,
    kilogram: 1000,
    kilograms: 1000,
    mg: 0.001,
    milligram: 0.001,
    milligrams: 0.001,
    oz: 28.349523125,
    ounce: 28.349523125,
    ounces: 28.349523125,
    lb: 453.59237,
    lbs: 453.59237,
    pound: 453.59237,
    pounds: 453.59237,
  };
  const factor =
    factors[
      String(unit || "")
        .trim()
        .toLowerCase()
    ];
  if (!factor) {
    const error = new Error(
      `Unsupported cinnamon quantity unit: ${unit || "(empty)"}.`,
    );
    error.statusCode = 400;
    throw error;
  }
  return Number(quantity) * factor;
};

const MASS_TOLERANCE_GRAMS = 0.01;
const MAX_PROCESSING_LOSS_PERCENT = 50;

const requiredInputGrams = (outputGrams, lossPercent = 0) =>
  outputGrams / (1 - Number(lossPercent || 0) / 100);

// Stages staff can record by scanning a unit after it has been packed.
const SCAN_STAGES = Object.freeze(["Stored", "Assigned", "Delivered", "Sold"]);
// Stages that happen at a retailer and may reference a Retailer record.
const RETAIL_STAGES = Object.freeze(["Assigned", "Delivered", "Sold"]);
const STAGE_RANK = Object.freeze({
  Queued: 0,
  Packed: 1,
  Stored: 2,
  Assigned: 3,
  Delivered: 4,
  Sold: 5,
});

const MAX_BULK_UNITS = 500;

const assertScanStage = (stage) => {
  if (!SCAN_STAGES.includes(stage)) {
    const error = new Error(`Stage must be one of: ${SCAN_STAGES.join(", ")}.`);
    error.statusCode = 400;
    throw error;
  }
};

const formatGrams = (grams) =>
  grams >= 1000
    ? `${Number((grams / 1000).toFixed(3))} kg`
    : `${Number(grams.toFixed(3))} g`;


const getTraceIdentity = (value) => {
  const rawValue = String(value || "").trim();
  if (!rawValue) return null;

  try {
    const parsedUrl = new URL(rawValue);
    const pathParts = parsedUrl.pathname.split("/").filter(Boolean);
    const traceIndex = pathParts.indexOf("trace");
    if (traceIndex >= 0 && pathParts[traceIndex + 1]) {
      return {
        batchId: decodeURIComponent(pathParts[traceIndex + 1]),
        unitNumber: Number(pathParts[traceIndex + 2]) || undefined,
      };
    }
  } catch (_error) {
    // Raw batch-unit codes are also accepted by the scan endpoint.
  }

  const match = rawValue.match(/^(.*)[-/](\d+)$/);
  return match ? { batchId: match[1], unitNumber: Number(match[2]) } : null;
};

class BatchService {
  calculateHash(batch, units) {
    return hashData(getCanonicalBatchData(batch, units));
  }

  /** Only the unit fields that are part of the batch fingerprint. */
  loadCanonicalUnits(batchId) {
    return BatchUnit.find({ batchId })
      .select("unitNumber qrCode quantity")
      .sort({ unitNumber: 1 })
      .lean();
  }

  async calculateStoredHash(batch) {
    return this.calculateHash(batch, await this.loadCanonicalUnits(batch.batchId));
  }

  async listAvailablePurchaseSources() {
    const purchaseOrders = await PurchaseOrder.find({
      orderStatus: { $in: SOURCE_ORDER_STATUSES },
    })
      .populate("supplierId", "supplierName")
      .sort({ createdAt: -1 })
      .lean();

    return purchaseOrders.flatMap((purchaseOrder) => {
      const supplierId =
        purchaseOrder.supplierId?._id || purchaseOrder.supplierId;
      const supplierName =
        purchaseOrder.supplierId?.supplierName || purchaseOrder.supplierName;
      if (!supplierId || !supplierName) return [];

      return (purchaseOrder.items || purchaseOrder.products || []).flatMap(
        (item, itemIndex) => {
          if (!isCinnamonSource(item)) return [];
          const allocatedQuantity = Number(item.allocatedQuantity || 0);
          const receivedQuantity = receivedQuantityOf(purchaseOrder, item);
          const availableQuantity = receivedQuantity - allocatedQuantity;
          if (availableQuantity <= 0) return [];

          return [
            {
              purchaseOrderId: String(purchaseOrder._id),
              purchaseOrderItemIndex: itemIndex,
              purchaseOrderStatus: purchaseOrder.orderStatus,
              supplierId: String(supplierId),
              supplierName,
              productName: item.productName,
              materialCategory: item.materialCategory || "cinnamon",
              grade: item.grade || "",
              purchasedQuantity: Number(item.quantity),
              receivedQuantity,
              allocatedQuantity,
              availableQuantity,
              unit: item.unit || "kg",
            },
          ];
        },
      );
    });
  }

  async createBatch(payload, createdBy) {
    const publicBaseUrl = getPublicBaseUrl();
    const batchId = String(payload.batchId || "").trim();
    const productName = String(payload.productName || "").trim();
    const totalUnits = Number(payload.totalUnits);
    const quantityPerUnit = Number(payload.quantityPerUnit);

    if (!/^[a-zA-Z0-9_-]+$/.test(batchId)) {
      const error = new Error(
        "Batch ID may only contain letters, numbers, hyphens, and underscores.",
      );
      error.statusCode = 400;
      throw error;
    }
    if (
      !productName ||
      !Number.isInteger(totalUnits) ||
      totalUnits < 1 ||
      totalUnits > 10000
    ) {
      const error = new Error(
        "A product and a whole number of units between 1 and 10000 are required.",
      );
      error.statusCode = 400;
      throw error;
    }
    if (!Number.isFinite(quantityPerUnit) || quantityPerUnit <= 0) {
      const error = new Error("Quantity per unit must be greater than zero.");
      error.statusCode = 400;
      throw error;
    }

    const sourceAllocations = Array.isArray(payload.sourceAllocations)
      ? payload.sourceAllocations
      : [];
    if (sourceAllocations.length === 0) {
      const error = new Error(
        "Select at least one cinnamon line from a completed purchase order.",
      );
      error.statusCode = 400;
      throw error;
    }

    const allocationKeys = new Set();
    const preparedSources = [];
    for (const allocation of sourceAllocations) {
      const purchaseOrderId = String(allocation.purchaseOrderId || "");
      const itemIndex = Number(allocation.purchaseOrderItemIndex);
      const quantity = Number(allocation.quantity);
      const sourceKey = `${purchaseOrderId}:${itemIndex}`;
      if (
        !mongoose.Types.ObjectId.isValid(purchaseOrderId) ||
        !Number.isInteger(itemIndex) ||
        itemIndex < 0 ||
        !Number.isFinite(quantity) ||
        quantity <= 0 ||
        allocationKeys.has(sourceKey)
      ) {
        const error = new Error(
          "Each cinnamon source must be a valid, unique purchase-order line with a positive quantity.",
        );
        error.statusCode = 400;
        throw error;
      }
      allocationKeys.add(sourceKey);

      const purchaseOrder = await PurchaseOrder.findById(
        purchaseOrderId,
      ).populate("supplierId", "supplierName");
      const item = purchaseOrder?.items?.[itemIndex];
      if (
        !purchaseOrder ||
        !SOURCE_ORDER_STATUSES.includes(purchaseOrder.orderStatus) ||
        !item ||
        !isCinnamonSource(item)
      ) {
        const error = new Error(
          "Batch sources must be received cinnamon lines from accepted or completed purchase orders.",
        );
        error.statusCode = 400;
        throw error;
      }

      const allocatedQuantity = Number(item.allocatedQuantity || 0);
      const availableQuantity =
        receivedQuantityOf(purchaseOrder, item) - allocatedQuantity;
      if (quantity > availableQuantity + 1e-9) {
        const error = new Error(
          `${item.productName} from PO ${
            purchaseOrder._id
          } has only ${availableQuantity} ${item.unit || "kg"} available.`,
        );
        error.statusCode = 409;
        throw error;
      }

      const supplierId =
        purchaseOrder.supplierId?._id || purchaseOrder.supplierId;
      const supplierName =
        purchaseOrder.supplierName || purchaseOrder.supplierId?.supplierName;
      if (!supplierId || !supplierName) {
        const error = new Error(
          `Purchase order ${purchaseOrder._id} has no supplier record.`,
        );
        error.statusCode = 400;
        throw error;
      }

      preparedSources.push({
        purchaseOrder,
        itemIndex,
        quantity,
        previousAllocatedQuantity: allocatedQuantity,
        sourceMaterial: {
          purchaseOrderId: purchaseOrder._id,
          purchaseOrderItemIndex: itemIndex,
          supplierId,
          supplierName,
          productName: item.productName,
          grade: item.grade || "",
          quantity,
          unit: item.unit || "kg",
        },
      });
    }

    const processingLossPercent = Number(payload.processingLossPercent || 0);
    if (
      !Number.isFinite(processingLossPercent) ||
      processingLossPercent < 0 ||
      processingLossPercent > MAX_PROCESSING_LOSS_PERCENT
    ) {
      const error = new Error(
        `Processing loss must be between 0 and ${MAX_PROCESSING_LOSS_PERCENT}%.`,
      );
      error.statusCode = 400;
      throw error;
    }
    const outputGrams = massToGrams(
      totalUnits * quantityPerUnit,
      payload.quantityUnit || "g",
    );
    // Cinnamon needed = packed output plus what grading/trimming removes.
    const producedGrams = requiredInputGrams(outputGrams, processingLossPercent);
    const sourcedGrams = preparedSources.reduce(
      (total, source) =>
        total + massToGrams(source.quantity, source.sourceMaterial.unit),
      0,
    );
    if (sourcedGrams + 1e-6 < producedGrams) {
      const error = new Error(
        "Selected cinnamon purchase quantities do not cover the batch output quantity.",
      );
      error.statusCode = 400;
      throw error;
    }
    // Reserve only what the batch consumes; any excess would be hidden from
    // later batches even though it is still in stock.
    if (sourcedGrams - producedGrams > MASS_TOLERANCE_GRAMS) {
      const error = new Error(
        `Allocated cinnamon (${formatGrams(sourcedGrams)}) exceeds what this batch uses (${formatGrams(producedGrams)}${
          processingLossPercent ? ` including ${processingLossPercent}% processing loss` : ""
        }). Allocate exactly that amount so the remainder stays available.`,
      );
      error.statusCode = 400;
      throw error;
    }

    const producedOn = payload.producedOn
      ? new Date(payload.producedOn)
      : new Date();
    if (Number.isNaN(producedOn.getTime())) {
      const error = new Error("Production date is invalid.");
      error.statusCode = 400;
      throw error;
    }

    const createdAt = new Date();
    const units = Array.from({ length: totalUnits }, (_, index) => {
      const unitNumber = index + 1;
      const verificationToken = createVerificationToken();
      const qrCode = createVerificationUrl(verificationToken, publicBaseUrl);
      const initialMovement = {
        status: "Queued",
        assignedShop: "Unassigned",
        timestamp: createdAt,
        notes: "Unit created with batch.",
      };
      initialMovement.dataHash = movementHashOf(
        batchId,
        unitNumber,
        initialMovement,
      );
      initialMovement.anchor = { status: "queued" };
      return {
        unitNumber,
        qrCode,
        verificationToken,
        qrGeneratedAt: createdAt,
        verificationCount: 0,
        quantity: quantityPerUnit,
        status: "Queued",
        assignedShop: "Unassigned",
        timestamp: createdAt,
        history: [initialMovement],
      };
    });

    const batchData = {
      batchId,
      productName,
      producedOn,
      totalUnits,
      quantityPerUnit,
      quantityUnit: String(payload.quantityUnit || "g").trim(),
      notes: String(payload.notes || "").trim(),
      processingLossPercent,
      sourceMaterials: preparedSources.map((source) => source.sourceMaterial),
      createdBy: String(createdBy || "unknown"),
    };

    const batch = new Batch(batchData);
    batch.dataHash = hashData(getCanonicalBatchData(batch, units));
    batch.blockchainRef = {
      status: batchBlockchain.isConfigured() ? "pending" : "not_configured",
    };

    const reservedSources = [];
    let batchSaved = false;
    try {
      for (const source of preparedSources) {
        const allocatedPath = `items.${source.itemIndex}.allocatedQuantity`;
        const allocationsPath = `items.${source.itemIndex}.allocations`;
        const filter = {
          _id: source.purchaseOrder._id,
          orderStatus: { $in: SOURCE_ORDER_STATUSES },
          [`items.${source.itemIndex}.productName`]:
            source.sourceMaterial.productName,
          [`items.${source.itemIndex}.quantity`]: Number(
            source.purchaseOrder.items[source.itemIndex].quantity,
          ),
          [`items.${source.itemIndex}.unit`]: source.sourceMaterial.unit,
        };
        if (source.previousAllocatedQuantity === 0) {
          filter.$or = [
            { [allocatedPath]: 0 },
            { [allocatedPath]: { $exists: false } },
          ];
        } else {
          filter[allocatedPath] = source.previousAllocatedQuantity;
        }

        const reservation = await PurchaseOrder.updateOne(filter, {
          $inc: { [allocatedPath]: source.quantity },
          $push: {
            [allocationsPath]: {
              batchId,
              quantity: source.quantity,
            },
          },
        });
        if (reservation.modifiedCount !== 1) {
          const error = new Error(
            "Purchase stock changed while creating the batch. Refresh available cinnamon and retry.",
          );
          error.statusCode = 409;
          throw error;
        }
        reservedSources.push(source);
      }

      await batch.save();
      batchSaved = true;
      await BatchUnit.insertMany(
        units.map((unit) => ({ ...unit, batch: batch._id, batchId })),
        { ordered: true },
      );
    } catch (error) {
      if (batchSaved) {
        await BatchUnit.deleteMany({ batchId });
        await Batch.deleteOne({ _id: batch._id });
      }
      await Promise.all(
        reservedSources.map((source) => {
          const allocatedPath = `items.${source.itemIndex}.allocatedQuantity`;
          const allocationsPath = `items.${source.itemIndex}.allocations`;
          return PurchaseOrder.updateOne(
            { _id: source.purchaseOrder._id },
            {
              $inc: { [allocatedPath]: -source.quantity },
              $pull: { [allocationsPath]: { batchId } },
            },
          );
        }),
      );
      throw error;
    }

    // The batch hash and its units' first entries are anchored by the
    // background job, so creating a batch never waits for a block.
    movementAnchorService.requestRun();
    return batch;
  }

  async listBatches() {
    return Batch.find().sort({ createdAt: -1 }).lean();
  }

  async getTrace(batchId, unitNumber) {
    const batch = await Batch.findOne({
      batchId: String(batchId).trim(),
    }).select("-createdBy");
    if (!batch) return null;

    const trace = batch.toObject();
    const unitFilter = { batchId: batch.batchId };
    if (unitNumber !== undefined) unitFilter.unitNumber = Number(unitNumber);
    trace.units = await BatchUnit.find(unitFilter).sort({ unitNumber: 1 }).lean();
    const calculatedHash = await this.calculateStoredHash(trace);
    trace.integrity = {
      databaseMatchesHash: calculatedHash === batch.dataHash,
      blockchainMatchesHash: null,
    };
    const blockchain = await blockchainVerificationService.verifyBatch(
      batch,
      calculatedHash,
    );
    trace.verificationStatus = blockchain.status;
    trace.blockchainVerification = blockchain;
    trace.integrity.blockchainMatchesHash = blockchain.verified;
    trace.units.forEach((unit) => {
      unit.history.forEach((movement) => {
        if (!movement.dataHash) return;
        movement.dataMatchesHash =
          movementHashOf(batch.batchId, unit.unitNumber, movement) ===
          movement.dataHash;
      });
    });

    if (unitNumber !== undefined) {
      const unit = trace.units.find(
        (item) => item.unitNumber === Number(unitNumber),
      );
      if (!unit) return null;
      return { ...trace, selectedUnit: unit };
    }

    return trace;
  }

  /**
   * Finds the unit behind a QR link, token, or typed code (B-1003-7, B-1003/7).
   * `loaded` reuses one document per unit, so a unit listed twice in one
   * request is updated once instead of overwriting itself.
   */
  async findUnitByCode(qrCode, loaded = new Map()) {
    const remember = (unit) => {
      if (!unit) return null;
      const key = String(unit._id);
      if (!loaded.has(key)) loaded.set(key, unit);
      return loaded.get(key);
    };

    const verificationToken = getVerificationTokenFromValue(qrCode);
    if (verificationToken) {
      const unit = remember(await BatchUnit.findOne({ verificationToken }));
      return unit ? { unit } : null;
    }

    const identity = getTraceIdentity(qrCode);
    if (!identity) {
      const error = new Error(
        "QR code is not a recognized batch unit link or unit code.",
      );
      error.statusCode = 400;
      throw error;
    }

    const unit = remember(
      await BatchUnit.findOne({
        batchId: identity.batchId,
        unitNumber: identity.unitNumber,
      }),
    );
    if (!unit) {
      if (!(await Batch.exists({ batchId: identity.batchId }))) return null;
      const error = new Error("QR code does not match a unit in this batch.");
      error.statusCode = 400;
      throw error;
    }
    const value = String(qrCode).trim();
    const typedCodes = [
      `${unit.batchId}-${unit.unitNumber}`,
      `${unit.batchId}/${unit.unitNumber}`,
    ];
    if (unit.qrCode !== value && !typedCodes.includes(value)) {
      const error = new Error("QR code does not match a unit in this batch.");
      error.statusCode = 400;
      throw error;
    }
    return { unit };
  }

  /** Light lookup for the scan screen's preview. Never throws. */
  async resolveUnitCode(code) {
    try {
      const found = await this.findUnitByCode(code);
      if (!found) return null;
      const { unit } = found;
      return {
        batchId: unit.batchId,
        unitNumber: unit.unitNumber,
        status: unit.status,
        assignedShop: unit.assignedShop,
      };
    } catch (_error) {
      return null;
    }
  }

  async scanUnit(qrCode, assignedShop, notes, stage = "Assigned", retailerId) {
    assertScanStage(stage);
    const location = await this.resolveLocation(stage, assignedShop, retailerId);
    const found = await this.findUnitByCode(qrCode);
    if (!found) return null;
    return this.recordUnitMovement(found.unit, location, notes, stage);
  }

  /**
   * Where a stage happened. A registered retailer supplies a consistent name
   * and its town; otherwise the typed location is used as-is.
   */
  async resolveLocation(stage, assignedShop, retailerId) {
    if (retailerId && RETAIL_STAGES.includes(stage)) {
      const retailer = mongoose.Types.ObjectId.isValid(String(retailerId))
        ? await Retailer.findById(retailerId)
            .select("companyName shippingAddresses verification")
            .lean()
        : null;
      if (!retailer || retailer.verification?.status !== "APPROVED") {
        const error = new Error("Choose an approved retailer.");
        error.statusCode = 400;
        throw error;
      }
      return {
        assignedShop: retailer.companyName,
        retailerId: retailer._id,
        retailerCity:
          (retailer.shippingAddresses || []).find((entry) => entry.city)?.city ||
          undefined,
      };
    }
    const typed = String(assignedShop || "").trim();
    if (!typed) {
      const error = new Error("A location is required.");
      error.statusCode = 400;
      throw error;
    }
    return { assignedShop: typed };
  }

  /**
   * Records one stage for a list of scanned/typed units, across any batches.
   * Each code gets its own result so staff can see what was not recorded.
   */
  async recordUnitsStage(codes, assignedShop, notes, stage, retailerId) {
    assertScanStage(stage);
    const cleaned = (Array.isArray(codes) ? codes : [])
      .map((code) => String(code || "").trim())
      .filter(Boolean);
    if (cleaned.length === 0 || cleaned.length > MAX_BULK_UNITS) {
      const error = new Error(
        `Provide between 1 and ${MAX_BULK_UNITS} unit codes.`,
      );
      error.statusCode = 400;
      throw error;
    }
    const location = await this.resolveLocation(stage, assignedShop, retailerId);

    const loaded = new Map();
    const touched = new Set();
    const results = [];
    const timestamp = new Date();

    for (const code of cleaned) {
      let found;
      try {
        found = await this.findUnitByCode(code, loaded);
      } catch (_error) {
        results.push({ code, result: "invalid" });
        continue;
      }
      if (!found) {
        results.push({ code, result: "not_found" });
        continue;
      }
      const { unit } = found;
      const identity = { code, batchId: unit.batchId, unitNumber: unit.unitNumber };
      if (touched.has(unit)) {
        results.push({ ...identity, result: "duplicate" });
        continue;
      }
      touched.add(unit);
      this.appendMovement(unit, location, notes, stage, timestamp);
      results.push({ ...identity, result: "updated" });
    }

    if (touched.size) {
      await BatchUnit.bulkSave([...touched]);
      movementAnchorService.requestRun();
    }
    return { updated: touched.size, results };
  }

  /** A new journey entry with its fingerprint, ready to be anchored. */
  buildMovement(batchId, unitNumber, location, notes, stage, timestamp = new Date()) {
    const place =
      typeof location === "string" ? { assignedShop: location } : location;
    const movement = {
      status: stage,
      assignedShop: String(place.assignedShop).trim(),
      timestamp,
      notes: String(notes || "").trim(),
    };
    movement.dataHash = movementHashOf(batchId, unitNumber, movement);
    // Added after hashing so the hash format stays the same as older entries.
    if (place.retailerId) movement.retailerId = place.retailerId;
    if (place.retailerCity) movement.retailerCity = place.retailerCity;
    // Anchored on chain later, together with other movements, in one tree.
    movement.anchor = { status: "queued" };
    return movement;
  }

  /** Adds a movement to a loaded unit; the caller saves it. */
  appendMovement(unit, location, notes, stage, timestamp = new Date()) {
    const movement = this.buildMovement(
      unit.batchId,
      unit.unitNumber,
      location,
      notes,
      stage,
      timestamp,
    );
    if (stage === "Sold" && unit.verificationCountAtSale == null) {
      unit.verificationCountAtSale = Number(unit.verificationCount || 0);
    }
    unit.status = movement.status;
    unit.assignedShop = movement.assignedShop;
    unit.timestamp = timestamp;
    unit.history.push(movement);
    return unit.history[unit.history.length - 1];
  }

  async recordUnitMovement(unit, location, notes, stage = "Assigned") {
    this.appendMovement(unit, location, notes, stage);
    await unit.save();
    movementAnchorService.requestRun();
    return { unit };
  }

  /**
   * Applies a stage to every unit in a batch with one bulk write. Units
   * already at that stage or later are skipped so a bulk "Stored" never
   * rewinds a dispatched unit. Full histories are never loaded.
   */
  async recordBatchStage(batchId, assignedShop, notes, stage, retailerId) {
    assertScanStage(stage);
    const location = await this.resolveLocation(stage, assignedShop, retailerId);
    const batch = await Batch.findOne({ batchId: String(batchId).trim() })
      .select("batchId")
      .lean();
    if (!batch) return null;

    const targetRank = STAGE_RANK[stage];
    const earlierStatuses = UNIT_STATUSES.filter(
      (status) => (STAGE_RANK[status] ?? 0) < targetRank,
    );
    const [total, eligible] = await Promise.all([
      BatchUnit.countDocuments({ batchId: batch.batchId }),
      BatchUnit.find({ batchId: batch.batchId, status: { $in: earlierStatuses } })
        .select("unitNumber status verificationCount verificationCountAtSale")
        .lean(),
    ]);
    if (eligible.length === 0) {
      const error = new Error(
        `All ${total} units in ${batch.batchId} are already at this stage or later.`,
      );
      error.statusCode = 409;
      throw error;
    }

    const timestamp = new Date();
    const operations = eligible.map((unit) => {
      const movement = this.buildMovement(
        batch.batchId,
        unit.unitNumber,
        location,
        notes,
        stage,
        timestamp,
      );
      const $set = {
        status: stage,
        assignedShop: movement.assignedShop,
        timestamp,
      };
      if (stage === "Sold" && unit.verificationCountAtSale == null) {
        $set.verificationCountAtSale = Number(unit.verificationCount || 0);
      }
      return {
        updateOne: {
          // Only if nobody changed the unit's stage in the meantime.
          filter: { _id: unit._id, status: unit.status },
          update: { $push: { history: movement }, $set },
        },
      };
    });
    const result = await BatchUnit.bulkWrite(operations, { ordered: false });
    const updated = Number(result.modifiedCount || 0);
    movementAnchorService.requestRun();
    return { batch, updated, skipped: total - updated };
  }

  /**
   * Marks a mistaken movement as void. It stays in the history for audit but
   * is ignored for the unit's current stage and never shown to customers.
   */
  async voidMovement(batchId, unitNumber, index, reason, voidedBy) {
    const cleanReason = String(reason || "").trim();
    if (!cleanReason) {
      const error = new Error("Give a reason for voiding this entry.");
      error.statusCode = 400;
      throw error;
    }
    const unit = await BatchUnit.findOne({
      batchId: String(batchId).trim(),
      unitNumber: Number(unitNumber),
    });
    const movement = unit?.history?.[Number(index)];
    if (!movement) return null;
    if (movement.status === "Queued") {
      const error = new Error("The unit's creation entry cannot be voided.");
      error.statusCode = 400;
      throw error;
    }
    if (movement.voidedAt) {
      const error = new Error("This entry has already been voided.");
      error.statusCode = 409;
      throw error;
    }

    movement.voidedAt = new Date();
    movement.voidedBy = String(voidedBy || "unknown");
    movement.voidReason = cleanReason;
    if (movement.status === "Sold") unit.verificationCountAtSale = undefined;

    const current = [...unit.history].reverse().find((entry) => !entry.voidedAt);
    unit.status = current?.status || "Queued";
    unit.assignedShop = current?.assignedShop || "Unassigned";
    unit.timestamp = current?.timestamp || unit.timestamp;

    await unit.save();
    return { unit, movement };
  }

  async setRecall(batchId, { publicMessage, reason }, recalledBy) {
    const message = String(publicMessage || "").trim();
    if (!message) {
      const error = new Error("Write the message customers will see.");
      error.statusCode = 400;
      throw error;
    }
    const batch = await Batch.findOne({ batchId: String(batchId).trim() });
    if (!batch) return null;
    batch.recall = {
      active: true,
      publicMessage: message,
      reason: String(reason || "").trim(),
      recalledAt: new Date(),
      recalledBy: String(recalledBy || "unknown"),
    };
    await batch.save();
    return batch;
  }

  async liftRecall(batchId, liftedBy) {
    const batch = await Batch.findOne({ batchId: String(batchId).trim() });
    if (!batch) return null;
    if (!batch.recall?.active) {
      const error = new Error("This batch is not recalled.");
      error.statusCode = 409;
      throw error;
    }
    batch.recall.active = false;
    batch.recall.liftedAt = new Date();
    batch.recall.liftedBy = String(liftedBy || "unknown");
    await batch.save();
    return batch;
  }

  /** Most recent journey entries across all units, newest first. */
  async listEvents(limit = 500) {
    return BatchUnit.aggregate([
      { $unwind: { path: "$history", includeArrayIndex: "movementIndex" } },
      { $sort: { "history.timestamp": -1 } },
      { $limit: Math.min(Math.max(Number(limit) || 500, 1), 5000) },
      {
        $replaceRoot: {
          newRoot: {
            $mergeObjects: [
              "$history",
              {
                batchId: "$batchId",
                unitNumber: "$unitNumber",
                movementIndex: { $toInt: "$movementIndex" },
                qrCode: "$qrCode",
                quantity: "$quantity",
              },
            ],
          },
        },
      },
    ]).allowDiskUse(true);
  }
}

module.exports = new BatchService();
module.exports.massToGrams = massToGrams;
module.exports.SCAN_STAGES = SCAN_STAGES;
module.exports.requiredInputGrams = requiredInputGrams;
module.exports.receivedQuantityOf = receivedQuantityOf;
