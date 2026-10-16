const Batch = require("../models/Batch");
const BatchUnit = require("../models/BatchUnit");
const MovementAnchor = require("../models/MovementAnchor");
const batchBlockchain = require("../utils/batchBlockchain");
const {
  buildMerkleTree,
  movementLeaf,
  unitKeyOf,
} = require("../utils/merkle");

const numberFrom = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

// A movement waits for anchoring when it has a fingerprint and has not yet
// been placed in a tree. Movements from before anchoring existed have no
// `anchor` at all and are picked up the same way.
const ELIGIBLE_MOVEMENT = {
  dataHash: { $exists: true, $nin: [null, ""] },
  $or: [{ "anchor.status": { $exists: false } }, { "anchor.status": "queued" }],
};

/**
 * Anchors unit movements in the background. Many movements are combined into
 * one Merkle tree and only its root is written on chain, so one transaction
 * covers any number of units. Also anchors batch hashes that are waiting.
 *
 * Runs in a single backend process. With several instances, run the job in
 * only one of them (ANCHOR_WORKER=false on the others).
 */
class MovementAnchorService {
  constructor({
    BatchModel = Batch,
    UnitModel = BatchUnit,
    AnchorModel = MovementAnchor,
    blockchain = batchBlockchain,
    env = process.env,
    logger = console,
  } = {}) {
    this.BatchModel = BatchModel;
    this.UnitModel = UnitModel;
    this.AnchorModel = AnchorModel;
    this.blockchain = blockchain;
    this.logger = logger;
    this.intervalMs = numberFrom(env.ANCHOR_INTERVAL_MS, 10 * 60 * 1000);
    this.debounceMs = numberFrom(env.ANCHOR_DEBOUNCE_MS, 60 * 1000);
    // 20,000 leaves keep an anchor document near 1.5 MB; a run sends up to
    // maxRounds transactions so a large backlog clears in one run.
    this.maxLeaves = numberFrom(env.ANCHOR_MAX_LEAVES, 20000);
    this.maxRounds = numberFrom(env.ANCHOR_MAX_ROUNDS, 10);
    this.maxAttempts = numberFrom(env.ANCHOR_MAX_ATTEMPTS, 5);
    this.running = false;
    this.debounceTimer = null;
    this.intervalTimer = null;
    this.lastRun = null;
    this.treeCache = new Map();
  }

  isConfigured() {
    return this.blockchain.isConfigured();
  }

  /** Periodic safety net; scans also trigger a run through requestRun. */
  start() {
    if (this.intervalTimer || !this.isConfigured()) return;
    this.intervalTimer = setInterval(() => this.runSafely(), this.intervalMs);
    this.intervalTimer.unref?.();
    this.requestRun();
  }

  stop() {
    clearInterval(this.intervalTimer);
    clearTimeout(this.debounceTimer);
    this.intervalTimer = null;
    this.debounceTimer = null;
  }

  /**
   * Asks for a run soon. Calls within the debounce window share one run, so a
   * busy scanning session still produces one transaction.
   */
  requestRun() {
    if (!this.isConfigured() || this.debounceTimer) return;
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.runSafely();
    }, this.debounceMs);
    this.debounceTimer.unref?.();
  }

  async runSafely() {
    try {
      return await this.runOnce();
    } catch (error) {
      this.logger.warn("Anchoring run failed:", error.message);
      return { error: error.message };
    }
  }

  async runOnce() {
    if (!this.isConfigured()) return { skipped: "not_configured" };
    if (this.running) return { skipped: "busy" };
    this.running = true;
    const startedAt = new Date();
    try {
      const recovered = await this.recoverSubmitting();
      const batches = await this.anchorPendingBatches();
      const movements = { anchored: 0, anchors: 0 };
      for (let round = 0; round < this.maxRounds; round += 1) {
        const result = await this.anchorPendingMovements();
        if (!result.leafCount) break; // nothing left to anchor
        movements.anchors += 1;
        movements.anchored += result.anchored;
        if (!result.anchored) break; // the chain refused; retry next run
      }
      this.lastRun = { startedAt, finishedAt: new Date(), recovered, batches, movements };
      return this.lastRun;
    } finally {
      this.running = false;
    }
  }

  // ---------------- Batches ----------------

  async anchorPendingBatches() {
    const waiting = await this.BatchModel.find({
      dataHash: { $exists: true, $nin: [null, ""] },
      "blockchainRef.status": { $in: ["pending", "failed", "not_configured"] },
      $or: [
        { "blockchainRef.attempts": { $exists: false } },
        { "blockchainRef.attempts": { $lt: this.maxAttempts } },
      ],
    })
      .select("batchId dataHash blockchainRef")
      .limit(50)
      .lean();

    let recorded = 0;
    for (const batch of waiting) {
      const attempts = Number(batch.blockchainRef?.attempts || 0) + 1;
      try {
        // Already on chain (e.g. a run stopped after mining): just record it.
        const onChain = await this.blockchain.verifyBatch(batch.batchId, batch.dataHash);
        const result = onChain
          ? { ...batch.blockchainRef, status: "recorded" }
          : await this.blockchain.recordBatch(batch.batchId, batch.dataHash);
        await this.BatchModel.updateOne(
          { _id: batch._id },
          {
            $set: {
              blockchainRef: { ...result, attempts, lastError: undefined },
            },
          },
        );
        recorded += 1;
      } catch (error) {
        await this.BatchModel.updateOne(
          { _id: batch._id },
          {
            $set: {
              "blockchainRef.status": "failed",
              "blockchainRef.attempts": attempts,
              "blockchainRef.lastError": String(error.message).slice(0, 300),
            },
          },
        );
        this.logger.warn(`Batch ${batch.batchId} anchoring failed:`, error.message);
      }
    }
    return { waiting: waiting.length, recorded };
  }

  // ---------------- Movements ----------------

  /** Finishes anchors whose transaction may not have completed last time. */
  async recoverSubmitting() {
    const pending = await this.AnchorModel.find({ status: "submitting" });
    let anchored = 0;
    for (const anchor of pending) {
      if (await this.submitAnchor(anchor)) anchored += 1;
    }
    return { pending: pending.length, anchored };
  }

  async anchorPendingMovements() {
    const units = await this.UnitModel.find({
      history: { $elemMatch: ELIGIBLE_MOVEMENT },
    }).limit(this.maxLeaves);

    const entries = [];
    for (const unit of units) {
      for (const movement of unit.history || []) {
        if (entries.length >= this.maxLeaves) break;
        if (!movement.dataHash) continue;
        const status = movement.anchor?.status;
        if (status && status !== "queued") continue;
        entries.push({
          unit,
          movement,
          leaf: movementLeaf(unitKeyOf(unit.batchId, unit.unitNumber), movement.dataHash),
        });
      }
    }
    if (entries.length === 0) return { anchored: 0 };

    const { root } = buildMerkleTree(entries.map((entry) => entry.leaf));
    // Record the anchor before touching the chain so it can always be recovered.
    const anchor = await this.AnchorModel.create({
      root,
      leaves: entries.map((entry) => entry.leaf),
      leafCount: entries.length,
      status: "submitting",
    });
    entries.forEach((entry, leafIndex) => {
      entry.movement.anchor = { status: "submitting", root, leafIndex };
    });
    const touched = [...new Set(entries.map((entry) => entry.unit))];
    await this.UnitModel.bulkSave(touched);

    const ok = await this.submitAnchor(anchor);
    return { anchored: ok ? entries.length : 0, root, leafCount: entries.length };
  }

  /** Sends (or confirms) one anchor. Returns true once it is on chain. */
  async submitAnchor(anchor) {
    try {
      const existing = await this.blockchain.getMovementAnchor(anchor.root);
      const result = existing?.anchored
        ? {
            txId: anchor.txId,
            explorerUrl: this.blockchain.explorerUrl?.(anchor.txId) || anchor.explorerUrl,
          }
        : await this.blockchain.anchorMovements(
            anchor.root,
            anchor.leafCount,
            async (txId) => {
              anchor.txId = txId;
              anchor.submittedAt = new Date();
              await anchor.save();
            },
          );
      Object.assign(anchor, {
        status: "anchored",
        anchoredAt: existing?.anchoredAt || new Date(),
        txId: result.txId || anchor.txId,
        blockNumber: result.blockNumber ?? anchor.blockNumber,
        network: result.network || anchor.network,
        contractAddress: result.contractAddress || anchor.contractAddress,
        explorerUrl: result.explorerUrl || anchor.explorerUrl,
        lastError: undefined,
      });
      await anchor.save();
      await this.setMovementStatus(anchor.root, "anchored");
      return true;
    } catch (error) {
      anchor.attempts = Number(anchor.attempts || 0) + 1;
      anchor.lastError = String(error.message).slice(0, 300);
      if (anchor.attempts >= this.maxAttempts) {
        anchor.status = "failed";
        await this.setMovementStatus(anchor.root, "failed");
      }
      await anchor.save();
      this.logger.warn(`Anchor ${anchor.root} failed:`, error.message);
      return false;
    }
  }

  setMovementStatus(root, status) {
    return this.UnitModel.updateMany(
      { "history.anchor.root": root },
      { $set: { "history.$[movement].anchor.status": status } },
      { arrayFilters: [{ "movement.anchor.root": root }] },
    );
  }

  /**
   * Puts movements from failed anchors back in the queue for a fresh tree.
   * Used by the admin "retry" action.
   */
  async retryFailed() {
    const failed = await this.AnchorModel.find({ status: "failed" }).select("root");
    for (const anchor of failed) {
      await this.UnitModel.updateMany(
        { "history.anchor.root": anchor.root },
        { $set: { "history.$[movement].anchor": { status: "queued" } } },
        { arrayFilters: [{ "movement.anchor.root": anchor.root }] },
      );
      await this.AnchorModel.updateOne(
        { _id: anchor._id },
        { $set: { status: "abandoned" } },
      );
    }
    await this.BatchModel.updateMany(
      { "blockchainRef.status": "failed" },
      { $set: { "blockchainRef.attempts": 0 } },
    );
    this.requestRun();
    return { requeuedAnchors: failed.length };
  }

  // ---------------- Proofs ----------------

  /** Merkle proof for one movement, rebuilt from the stored leaves. */
  async getProof(root, leafIndex) {
    let tree = this.treeCache.get(root);
    if (!tree) {
      const anchor = await this.AnchorModel.findOne({ root }).select("leaves status").lean();
      if (!anchor) return null;
      tree = { leaves: anchor.leaves, ...buildMerkleTree(anchor.leaves) };
      if (this.treeCache.size >= 50) {
        this.treeCache.delete(this.treeCache.keys().next().value);
      }
      this.treeCache.set(root, tree);
    }
    if (!Number.isInteger(leafIndex) || !tree.leaves[leafIndex]) return null;
    return { leaf: tree.leaves[leafIndex], proof: tree.proofs[leafIndex] };
  }

  // ---------------- Admin summary ----------------

  async getStatus() {
    const [queued] = await this.UnitModel.aggregate([
      { $match: { history: { $elemMatch: ELIGIBLE_MOVEMENT } } },
      { $unwind: "$history" },
      { $replaceRoot: { newRoot: "$history" } },
      { $match: ELIGIBLE_MOVEMENT },
      { $count: "count" },
    ]);
    const [submitting, failed, recent] = await Promise.all([
      this.AnchorModel.countDocuments({ status: "submitting" }),
      this.AnchorModel.countDocuments({ status: "failed" }),
      this.AnchorModel.find({ status: { $in: ["anchored", "failed", "submitting"] } })
        .select("-leaves")
        .sort({ createdAt: -1 })
        .limit(10)
        .lean(),
    ]);
    return {
      configured: this.isConfigured(),
      running: this.running,
      queuedMovements: queued?.count || 0,
      submittingAnchors: submitting,
      failedAnchors: failed,
      lastRun: this.lastRun,
      intervalMinutes: Math.round(this.intervalMs / 60000),
      recentAnchors: recent,
    };
  }
}

module.exports = new MovementAnchorService();
module.exports.MovementAnchorService = MovementAnchorService;
module.exports.ELIGIBLE_MOVEMENT = ELIGIBLE_MOVEMENT;
