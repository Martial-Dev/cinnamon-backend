const assert = require("node:assert/strict");
const test = require("node:test");
const {
  BlockchainVerificationService,
  STATUS,
} = require("../services/blockchainVerificationService");

const makeBatch = (status = "recorded") => ({
  batchId: "B-1003",
  dataHash: "expected-hash",
  blockchainRef: {
    status,
    txId: "0xtransaction",
    network: "sepolia",
  },
});

test("returns NOT_CONFIGURED when no batch contract is initialized", async () => {
  const service = new BlockchainVerificationService({
    isConfigured: () => false,
  });

  const result = await service.verifyBatch(makeBatch(), "expected-hash");

  assert.equal(result.status, STATUS.NOT_CONFIGURED);
  assert.equal(result.verified, false);
});

test("returns NOT_FOUND when the configured chain has no batch record", async () => {
  const service = new BlockchainVerificationService({
    isConfigured: () => true,
  });

  const result = await service.verifyBatch(
    makeBatch("not_configured"),
    "expected-hash",
  );

  assert.equal(result.status, STATUS.NOT_FOUND);
});

test("preserves a pending recording state", async () => {
  const service = new BlockchainVerificationService({
    isConfigured: () => true,
  });

  const result = await service.verifyBatch(
    makeBatch("pending"),
    "expected-hash",
  );

  assert.equal(result.status, STATUS.PENDING);
});

test("returns FAILED when the stored batch no longer matches its saved hash", async () => {
  const service = new BlockchainVerificationService({
    isConfigured: () => true,
    verifyBatch: async () => assert.fail("must not query the chain"),
  });

  const result = await service.verifyBatch(makeBatch(), "different-hash");

  assert.equal(result.status, STATUS.FAILED);
  assert.equal(result.reason, "DATABASE_HASH_MISMATCH");
});

test("returns VERIFIED only when the on-chain batch hash matches", async () => {
  const service = new BlockchainVerificationService({
    isConfigured: () => true,
    verifyBatch: async (batchId, hash) =>
      batchId === "B-1003" && hash === "expected-hash",
  });

  const result = await service.verifyBatch(makeBatch(), "expected-hash");

  assert.equal(result.status, STATUS.VERIFIED);
  assert.equal(result.verified, true);
});

test("returns FAILED when the chain rejects the hash or cannot be queried", async () => {
  const mismatchService = new BlockchainVerificationService({
    isConfigured: () => true,
    verifyBatch: async () => false,
  });
  const failureService = new BlockchainVerificationService({
    isConfigured: () => true,
    verifyBatch: async () => {
      throw new Error("RPC failure");
    },
  });

  assert.equal(
    (await mismatchService.verifyBatch(makeBatch(), "expected-hash")).status,
    STATUS.FAILED,
  );
  assert.equal(
    (await failureService.verifyBatch(makeBatch(), "expected-hash")).reason,
    "CHAIN_QUERY_FAILED",
  );
});

test("returns FAILED instead of hanging when the chain query times out", async () => {
  const service = new BlockchainVerificationService(
    {
      isConfigured: () => true,
      verifyBatch: () => new Promise(() => {}),
    },
    { queryTimeoutMs: 20 },
  );

  const result = await service.verifyBatch(makeBatch(), "expected-hash");

  assert.equal(result.status, STATUS.FAILED);
  assert.equal(result.reason, "CHAIN_QUERY_FAILED");
});

const { STEP } = require("../services/blockchainVerificationService");
const { movementHashOf } = require("../utils/traceHash");
const merkle = require("../utils/merkle");

const anchoredUnit = () => {
  const unit = { unitNumber: 7, history: [] };
  const statuses = ["Stored", "Assigned", "Sold"];
  statuses.forEach((status, index) => {
    const movement = {
      status,
      assignedShop: "Galle Fort Spice Shop",
      timestamp: new Date(`2026-09-2${index}T04:00:00.000Z`),
      notes: "",
    };
    movement.dataHash = movementHashOf("B-1003", 7, movement);
    unit.history.push(movement);
  });
  const leaves = unit.history
    .slice(0, 2)
    .map((movement) => merkle.movementLeaf(merkle.unitKeyOf("B-1003", 7), movement.dataHash));
  const { root, proofs } = merkle.buildMerkleTree(leaves);
  unit.history[0].anchor = { status: "anchored", root, leafIndex: 0 };
  unit.history[1].anchor = { status: "anchored", root, leafIndex: 1 };
  unit.history[2].anchor = { status: "queued" };
  const anchors = {
    getProof: async (requestedRoot, index) =>
      requestedRoot === root ? { leaf: leaves[index], proof: proofs[index] } : null,
  };
  return { unit, root, anchors };
};

test("each journey step is verified, pending, or flagged on its own", async () => {
  const { unit, anchors } = anchoredUnit();
  let chainCalls = 0;
  const service = new BlockchainVerificationService(
    {
      isConfigured: () => true,
      getMovementAnchor: async () => {
        chainCalls += 1;
        return { anchored: true };
      },
    },
    { anchors },
  );

  const steps = await service.verifyMovements("B-1003", unit);

  assert.equal(steps.get(0), STEP.VERIFIED);
  assert.equal(steps.get(1), STEP.VERIFIED);
  assert.equal(steps.get(2), STEP.PENDING);
  assert.equal(chainCalls, 1, "one chain read per root, not per step");

  await service.verifyMovements("B-1003", unit);
  assert.equal(chainCalls, 1, "anchored roots are remembered");
});

test("editing a recorded step after anchoring is detected", async () => {
  const { unit, anchors } = anchoredUnit();
  const service = new BlockchainVerificationService(
    { isConfigured: () => true, getMovementAnchor: async () => ({ anchored: true }) },
    { anchors },
  );

  // Someone changes the shop in MongoDB but leaves the old fingerprint.
  unit.history[1].assignedShop = "Different Shop";
  assert.equal((await service.verifyMovements("B-1003", unit)).get(1), STEP.TAMPERED);

  // ...or also rewrites the fingerprint: it no longer matches the anchored leaf.
  unit.history[1].dataHash = movementHashOf("B-1003", 7, unit.history[1]);
  assert.equal((await service.verifyMovements("B-1003", unit)).get(1), STEP.TAMPERED);
});

test("a root missing from the chain or an unreachable chain is not reported as verified", async () => {
  const { unit, anchors } = anchoredUnit();
  const missing = new BlockchainVerificationService(
    { isConfigured: () => true, getMovementAnchor: async () => ({ anchored: false }) },
    { anchors },
  );
  assert.equal((await missing.verifyMovements("B-1003", unit)).get(0), STEP.TAMPERED);

  const down = new BlockchainVerificationService(
    { isConfigured: () => true, getMovementAnchor: () => new Promise(() => {}) },
    { anchors, queryTimeoutMs: 20 },
  );
  assert.equal((await down.verifyMovements("B-1003", unit)).get(0), STEP.UNAVAILABLE);

  const notConfigured = new BlockchainVerificationService(
    { isConfigured: () => false },
    { anchors },
  );
  assert.equal(
    (await notConfigured.verifyMovements("B-1003", unit)).get(0),
    STEP.NOT_CONFIGURED,
  );
});
