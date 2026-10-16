const assert = require("node:assert/strict");
const test = require("node:test");
const { MovementAnchorService } = require("../services/movementAnchorService");
const { movementHashOf } = require("../utils/traceHash");
const {
  buildMerkleTree,
  movementLeaf,
  unitKeyOf,
  verifyMerkleProof,
} = require("../utils/merkle");

const quietLogger = { warn() {} };

// A query object that can be chained (.select/.limit/.lean) and awaited.
const query = (value) => {
  const chain = {
    select: () => chain,
    limit: () => chain,
    sort: () => chain,
    lean: () => chain,
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
  return chain;
};

const makeMovement = (batchId, unitNumber, status, anchor) => {
  const movement = {
    status,
    assignedShop: "Galle Fort Spice Shop",
    timestamp: new Date(`2026-09-2${unitNumber}T04:00:00.000Z`),
    notes: "",
  };
  movement.dataHash = movementHashOf(batchId, unitNumber, movement);
  if (anchor) movement.anchor = anchor;
  return movement;
};

const makeUnits = (batchId, unitCount) =>
  Array.from({ length: unitCount }, (_, index) => ({
    batchId,
    unitNumber: index + 1,
    saves: 0,
    history: [makeMovement(batchId, index + 1, "Assigned", { status: "queued" })],
  }));

const makeAnchorModel = () => {
  const docs = [];
  const toDoc = (data) => ({
    attempts: 0,
    ...data,
    async save() {
      this.saved = (this.saved || 0) + 1;
    },
  });
  return {
    docs,
    async create(data) {
      const doc = toDoc(data);
      docs.push(doc);
      return doc;
    },
    find(filter) {
      return query(docs.filter((doc) => !filter?.status || doc.status === filter.status));
    },
    findOne(filter) {
      return query(docs.find((doc) => doc.root === filter.root) || null);
    },
    seed(data) {
      const doc = toDoc(data);
      docs.push(doc);
      return doc;
    },
  };
};

const makeUnitModel = (units) => {
  const calls = { updateMany: [], bulkSave: [] };
  return {
    calls,
    find() {
      return query(units);
    },
    async bulkSave(docs) {
      calls.bulkSave.push(docs);
      docs.forEach((doc) => (doc.saves += 1));
    },
    async updateMany(filter, update, options) {
      calls.updateMany.push({ filter, update, options });
      // Apply the arrayFilters update to the in-memory units.
      const root = filter["history.anchor.root"];
      for (const unit of units) {
        for (const movement of unit.history) {
          if (movement.anchor?.root !== root) continue;
          const status = update.$set["history.$[movement].anchor.status"];
          if (status) movement.anchor.status = status;
        }
      }
      return { modifiedCount: 1 };
    },
  };
};

const makeBatchModel = (batchSummaries = []) => {
  const calls = { updateOne: [], updateMany: [] };
  return {
    calls,
    find() {
      return query(batchSummaries);
    },
    async updateOne(filter, update) {
      calls.updateOne.push({ filter, update });
    },
    async updateMany(filter, update) {
      calls.updateMany.push({ filter, update });
    },
  };
};

const makeChain = (overrides = {}) => {
  const calls = { anchorMovements: [], recordBatch: [] };
  return {
    calls,
    isConfigured: () => true,
    getMovementAnchor: async () => ({ anchored: false }),
    verifyBatch: async () => false,
    async recordBatch(batchId, dataHash) {
      calls.recordBatch.push({ batchId, dataHash });
      return { status: "recorded", txId: "0xbatch" };
    },
    async anchorMovements(root, leafCount, onSubmitted) {
      calls.anchorMovements.push({ root, leafCount });
      await onSubmitted?.("0xanchor");
      return { status: "recorded", txId: "0xanchor", blockNumber: 7, network: "sepolia" };
    },
    explorerUrl: (txId) => `https://explorer.test/tx/${txId}`,
    ...overrides,
  };
};

test("movements from many units and batches are anchored with one transaction", async () => {
  const units = [...makeUnits("B-1003", 15), ...makeUnits("B-1004", 5)];
  const UnitModel = makeUnitModel(units);
  const AnchorModel = makeAnchorModel();
  const chain = makeChain();
  const service = new MovementAnchorService({
    BatchModel: makeBatchModel(),
    UnitModel,
    AnchorModel,
    blockchain: chain,
    logger: quietLogger,
  });

  const result = await service.runOnce();

  assert.equal(chain.calls.anchorMovements.length, 1);
  assert.equal(chain.calls.anchorMovements[0].leafCount, 20);
  assert.equal(result.movements.anchored, 20);
  const [anchor] = AnchorModel.docs;
  assert.equal(anchor.status, "anchored");
  assert.equal(anchor.txId, "0xanchor");
  assert.equal(anchor.leaves.length, 20);

  // Every movement now points at the root and its own proof checks out.
  const { proofs } = buildMerkleTree(anchor.leaves);
  for (const unit of units) {
    const movement = unit.history[0];
    assert.equal(movement.anchor.status, "anchored");
    assert.equal(movement.anchor.root, anchor.root);
    const leaf = movementLeaf(unitKeyOf(unit.batchId, unit.unitNumber), movement.dataHash);
    assert.equal(anchor.leaves[movement.anchor.leafIndex], leaf);
    assert.equal(verifyMerkleProof(leaf, proofs[movement.anchor.leafIndex], anchor.root), true);
    assert.equal(unit.saves, 1);
  }
  assert.equal(UnitModel.calls.bulkSave.length, 1, "all units saved in one write");
});

test("an interrupted anchor is finished without sending a second transaction", async () => {
  const AnchorModel = makeAnchorModel();
  const pending = AnchorModel.seed({
    root: "0x" + "11".repeat(32),
    leaves: ["0x" + "22".repeat(32)],
    leafCount: 1,
    status: "submitting",
    txId: "0xearlier",
  });
  const chain = makeChain({
    getMovementAnchor: async () => ({ anchored: true, anchoredAt: new Date("2026-10-01") }),
  });
  const service = new MovementAnchorService({
    BatchModel: makeBatchModel(),
    UnitModel: makeUnitModel([]),
    AnchorModel,
    blockchain: chain,
    logger: quietLogger,
  });

  const result = await service.runOnce();

  assert.equal(result.recovered.anchored, 1);
  assert.equal(chain.calls.anchorMovements.length, 0);
  assert.equal(pending.status, "anchored");
  assert.equal(pending.txId, "0xearlier");
});

test("failed anchors are retried, then marked failed after the attempt limit", async () => {
  const units = makeUnits("B-1003", 2);
  const AnchorModel = makeAnchorModel();
  const chain = makeChain({
    anchorMovements: async () => {
      throw new Error("insufficient funds");
    },
  });
  const service = new MovementAnchorService({
    BatchModel: makeBatchModel(),
    UnitModel: makeUnitModel(units),
    AnchorModel,
    blockchain: chain,
    env: { ANCHOR_MAX_ATTEMPTS: "2" },
    logger: quietLogger,
  });

  await service.runOnce();
  const [anchor] = AnchorModel.docs;
  assert.equal(anchor.status, "submitting");
  assert.equal(anchor.attempts, 1);
  assert.match(anchor.lastError, /insufficient funds/);

  await service.runOnce(); // recovery retries the same root
  assert.equal(anchor.status, "failed");
  assert.equal(units[0].history[0].anchor.status, "failed");
  assert.equal(AnchorModel.docs.length, 1, "no second tree for the same movements");
});

test("waiting batch hashes are recorded, and ones already on chain are not re-sent", async () => {
  const summaries = [
    { _id: 1, batchId: "B-1", dataHash: "aa".repeat(32), blockchainRef: { status: "pending" } },
    { _id: 2, batchId: "B-2", dataHash: "bb".repeat(32), blockchainRef: { status: "failed", attempts: 1 } },
  ];
  const BatchModel = makeBatchModel(summaries);
  const chain = makeChain({ verifyBatch: async (batchId) => batchId === "B-2" });
  const service = new MovementAnchorService({
    BatchModel,
    UnitModel: makeUnitModel([]),
    AnchorModel: makeAnchorModel(),
    blockchain: chain,
    logger: quietLogger,
  });

  const result = await service.runOnce();

  assert.equal(result.batches.recorded, 2);
  assert.deepEqual(chain.calls.recordBatch.map((call) => call.batchId), ["B-1"]);
  const statuses = BatchModel.calls.updateOne.map((call) => call.update.$set.blockchainRef.status);
  assert.deepEqual(statuses, ["recorded", "recorded"]);
});

test("nothing runs when the contract is not configured", async () => {
  const service = new MovementAnchorService({
    BatchModel: makeBatchModel(),
    UnitModel: makeUnitModel(makeUnits("B-1003", 1)),
    AnchorModel: makeAnchorModel(),
    blockchain: makeChain({ isConfigured: () => false }),
    logger: quietLogger,
  });
  assert.deepEqual(await service.runOnce(), { skipped: "not_configured" });
  service.requestRun();
  assert.equal(service.debounceTimer, null);
});

test("many scan requests within the debounce window share one run", async () => {
  const service = new MovementAnchorService({
    BatchModel: makeBatchModel(),
    UnitModel: makeUnitModel([]),
    AnchorModel: makeAnchorModel(),
    blockchain: makeChain(),
    env: { ANCHOR_DEBOUNCE_MS: "20" },
    logger: quietLogger,
  });
  let runs = 0;
  service.runSafely = async () => {
    runs += 1;
  };
  for (let i = 0; i < 10; i += 1) service.requestRun();
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(runs, 1);
});

test("proofs are rebuilt from the stored leaves", async () => {
  const AnchorModel = makeAnchorModel();
  const leaves = Array.from({ length: 5 }, (_, i) =>
    movementLeaf(unitKeyOf("B-1", i + 1), "cd".repeat(32)),
  );
  const { root } = buildMerkleTree(leaves);
  AnchorModel.seed({ root, leaves, leafCount: 5, status: "anchored" });
  const service = new MovementAnchorService({
    BatchModel: makeBatchModel(),
    UnitModel: makeUnitModel([]),
    AnchorModel,
    blockchain: makeChain(),
    logger: quietLogger,
  });

  const stored = await service.getProof(root, 3);
  assert.equal(stored.leaf, leaves[3]);
  assert.equal(verifyMerkleProof(stored.leaf, stored.proof, root), true);
  assert.equal(await service.getProof(root, 9), null);
  assert.equal(await service.getProof("0x" + "00".repeat(32), 0), null);
});

test("a large backlog is cleared in one run with several transactions", async () => {
  const units = makeUnits("B-1003", 25);
  const chain = makeChain();
  const AnchorModel = makeAnchorModel();
  // The stand-in returns all units on every query; return only waiting ones.
  const UnitModel = makeUnitModel(units);
  UnitModel.find = () =>
    query(units.filter((unit) => unit.history.some((m) => m.anchor?.status === "queued")));
  const service = new MovementAnchorService({
    BatchModel: makeBatchModel(),
    UnitModel,
    AnchorModel,
    blockchain: chain,
    env: { ANCHOR_MAX_LEAVES: "10" },
    logger: quietLogger,
  });

  const result = await service.runOnce();

  assert.equal(result.movements.anchored, 25);
  assert.equal(result.movements.anchors, 3);
  assert.deepEqual(chain.calls.anchorMovements.map((call) => call.leafCount), [10, 10, 5]);
});
