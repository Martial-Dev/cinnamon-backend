const batchBlockchain = require("../utils/batchBlockchain");
const movementAnchorService = require("./movementAnchorService");
const { movementHashOf } = require("../utils/traceHash");
const {
  movementLeaf,
  unitKeyOf,
  verifyMerkleProof,
} = require("../utils/merkle");

// Per-step results for a unit's journey.
const STEP = Object.freeze({
  VERIFIED: "verified", // fingerprint matches and its root is on chain
  PENDING: "pending", // waiting for the next anchoring run
  TAMPERED: "tampered", // saved data no longer matches what was anchored
  UNAVAILABLE: "unavailable", // the chain could not be reached
  NOT_CONFIGURED: "not_configured",
});

const STATUS = Object.freeze({
  VERIFIED: "VERIFIED",
  PENDING: "PENDING",
  NOT_CONFIGURED: "NOT_CONFIGURED",
  FAILED: "FAILED",
  NOT_FOUND: "NOT_FOUND",
});

const DEFAULT_QUERY_TIMEOUT_MS = 5000;

const withTimeout = (promise, timeoutMs) => {
  let timer;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error("Blockchain query timed out.")),
      timeoutMs,
    );
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

class BlockchainVerificationService {
  constructor(blockchain = batchBlockchain, options = {}) {
    this.blockchain = blockchain;
    this.anchors = options.anchors || movementAnchorService;
    // Roots confirmed on chain never change, so positive answers are kept.
    this.anchoredRoots = new Set();
    // A slow RPC endpoint must not leave a customer's scan waiting indefinitely.
    this.queryTimeoutMs =
      options.queryTimeoutMs ||
      Number(process.env.BLOCKCHAIN_QUERY_TIMEOUT_MS) ||
      DEFAULT_QUERY_TIMEOUT_MS;
  }

  async verifyBatch(batch, calculatedHash) {
    if (!this.blockchain.isConfigured()) {
      return this.result(STATUS.NOT_CONFIGURED, batch);
    }

    const recordStatus = batch?.blockchainRef?.status;
    if (recordStatus === "pending") {
      return this.result(STATUS.PENDING, batch);
    }
    if (recordStatus === "failed") {
      return this.result(STATUS.FAILED, batch, "RECORDING_FAILED");
    }
    if (recordStatus !== "recorded") {
      return this.result(STATUS.NOT_FOUND, batch);
    }

    if (calculatedHash !== batch.dataHash) {
      return this.result(STATUS.FAILED, batch, "DATABASE_HASH_MISMATCH");
    }

    try {
      const verified = await withTimeout(
        this.blockchain.verifyBatch(batch.batchId, batch.dataHash),
        this.queryTimeoutMs,
      );
      return verified
        ? this.result(STATUS.VERIFIED, batch)
        : this.result(STATUS.FAILED, batch, "ONCHAIN_HASH_MISMATCH");
    } catch (_error) {
      return this.result(STATUS.FAILED, batch, "CHAIN_QUERY_FAILED");
    }
  }

  /**
   * Checks each recorded step of one unit. Returns a Map from the step's
   * index in unit.history to a STEP value. Steps without a fingerprint are
   * left out.
   */
  async verifyMovements(batchId, unit) {
    const results = new Map();
    const history = unit?.history || [];
    const configured = this.blockchain.isConfigured();
    const rootChecks = new Map();

    const rootIsAnchored = (root) => {
      if (this.anchoredRoots.has(root)) return Promise.resolve(true);
      if (!rootChecks.has(root)) {
        rootChecks.set(
          root,
          withTimeout(this.blockchain.getMovementAnchor(root), this.queryTimeoutMs).then(
            (anchor) => {
              if (anchor?.anchored) this.anchoredRoots.add(root);
              return Boolean(anchor?.anchored);
            },
          ),
        );
      }
      return rootChecks.get(root);
    };

    await Promise.all(
      history.map(async (movement, index) => {
        if (!movement?.dataHash) return;
        if (movementHashOf(batchId, unit.unitNumber, movement) !== movement.dataHash) {
          results.set(index, STEP.TAMPERED);
          return;
        }
        if (!configured) {
          results.set(index, STEP.NOT_CONFIGURED);
          return;
        }
        const anchor = movement.anchor;
        if (anchor?.status !== "anchored" || !anchor.root) {
          results.set(index, STEP.PENDING);
          return;
        }
        try {
          const leaf = movementLeaf(unitKeyOf(batchId, unit.unitNumber), movement.dataHash);
          const stored = await this.anchors.getProof(anchor.root, anchor.leafIndex);
          if (
            !stored ||
            stored.leaf !== leaf ||
            !verifyMerkleProof(leaf, stored.proof, anchor.root)
          ) {
            results.set(index, STEP.TAMPERED);
            return;
          }
          results.set(
            index,
            (await rootIsAnchored(anchor.root)) ? STEP.VERIFIED : STEP.TAMPERED,
          );
        } catch (_error) {
          results.set(index, STEP.UNAVAILABLE);
        }
      }),
    );
    return results;
  }

  result(status, batch, reason) {
    return {
      status,
      verified: status === STATUS.VERIFIED,
      reason,
      blockchain: {
        txId: batch?.blockchainRef?.txId,
        blockNumber: batch?.blockchainRef?.blockNumber,
        network: batch?.blockchainRef?.network,
        contractAddress: batch?.blockchainRef?.contractAddress,
        explorerUrl: batch?.blockchainRef?.explorerUrl,
        verified: status === STATUS.VERIFIED,
      },
    };
  }
}

module.exports = new BlockchainVerificationService();
module.exports.BlockchainVerificationService = BlockchainVerificationService;
module.exports.STATUS = STATUS;
module.exports.STEP = STEP;
