const assert = require("node:assert/strict");
const test = require("node:test");
const Batch = require("../models/Batch");
const BatchUnit = require("../models/BatchUnit");
const batchService = require("../services/batchService");
const movementAnchorService = require("../services/movementAnchorService");
const { movementHashOf } = require("../utils/traceHash");

// ---- In-memory stand-ins for the batches and batchunits collections ----

const makeUnit = (batchId, unitNumber, status = "Queued") => ({
  _id: `${batchId}:${unitNumber}`,
  batchId,
  unitNumber,
  qrCode: `https://verify.example.test/verify/${batchId}-${unitNumber}`,
  status,
  assignedShop: "Unassigned",
  verificationCount: 0,
  history: [],
  saves: 0,
  async save() {
    this.saves += 1;
  },
});

const chain = (value) => {
  const c = {
    select: () => c,
    lean: () => c,
    sort: () => c,
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
  return c;
};

/**
 * Replaces the model methods the batch service uses, backed by `units`.
 * bulkWrite applies $push/$set to the matching in-memory unit.
 */
const withCollections = async (units, callback, batchIds = null) => {
  const known = new Set(batchIds || units.map((unit) => unit.batchId));
  const original = {
    findOne: BatchUnit.findOne,
    find: BatchUnit.find,
    countDocuments: BatchUnit.countDocuments,
    bulkWrite: BatchUnit.bulkWrite,
    bulkSave: BatchUnit.bulkSave,
    batchFindOne: Batch.findOne,
    batchExists: Batch.exists,
    requestRun: movementAnchorService.requestRun,
  };
  const calls = { bulkSave: [], bulkWrite: [], runRequests: 0, findOne: 0 };
  BatchUnit.findOne = async (query) => {
    calls.findOne += 1;
    return (
      units.find((unit) =>
        query.verificationToken
          ? unit.verificationToken === query.verificationToken
          : unit.batchId === query.batchId && unit.unitNumber === query.unitNumber,
      ) || null
    );
  };
  BatchUnit.find = (query) =>
    chain(
      units
        .filter((unit) => unit.batchId === query.batchId)
        .filter((unit) => !query.status?.$in || query.status.$in.includes(unit.status)),
    );
  BatchUnit.countDocuments = async (query) =>
    units.filter((unit) => unit.batchId === query.batchId).length;
  BatchUnit.bulkSave = async (docs) => {
    calls.bulkSave.push(docs);
    docs.forEach((doc) => (doc.saves += 1));
  };
  BatchUnit.bulkWrite = async (operations) => {
    calls.bulkWrite.push(operations);
    let modifiedCount = 0;
    for (const { updateOne } of operations) {
      const unit = units.find(
        (entry) =>
          entry._id === updateOne.filter._id && entry.status === updateOne.filter.status,
      );
      if (!unit) continue;
      unit.history.push(updateOne.update.$push.history);
      Object.assign(unit, updateOne.update.$set);
      modifiedCount += 1;
    }
    return { modifiedCount };
  };
  Batch.findOne = (query) =>
    chain(known.has(query.batchId) ? { batchId: query.batchId } : null);
  Batch.exists = async (query) => known.has(query.batchId);
  movementAnchorService.requestRun = () => {
    calls.runRequests += 1;
  };
  try {
    await callback(calls);
  } finally {
    Object.assign(BatchUnit, {
      findOne: original.findOne,
      find: original.find,
      countDocuments: original.countDocuments,
      bulkWrite: original.bulkWrite,
      bulkSave: original.bulkSave,
    });
    Batch.findOne = original.batchFindOne;
    Batch.exists = original.batchExists;
    movementAnchorService.requestRun = original.requestRun;
  }
};

const unitsWith = (statuses, batchId = "B-1003") =>
  statuses.map((status, index) => makeUnit(batchId, index + 1, status));

// ---- Whole batch ----

test("whole-batch stage updates every eligible unit with one timestamp", async () => {
  const units = unitsWith(["Queued", "Assigned", "Queued"]);
  await withCollections(units, async (calls) => {
    const result = await batchService.recordBatchStage(
      "B-1003",
      "Colombo warehouse",
      "bay 4",
      "Stored",
    );

    assert.equal(result.updated, 2);
    assert.equal(result.skipped, 1);
    assert.equal(units[0].status, "Stored");
    assert.equal(units[1].status, "Assigned");
    assert.equal(units[1].history.length, 0);
    assert.equal(units[0].history[0].timestamp, units[2].history[0].timestamp);
    assert.equal(
      units[0].history[0].dataHash,
      movementHashOf("B-1003", 1, units[0].history[0]),
    );
    assert.equal(units[0].history[0].anchor.status, "queued");
    assert.equal(calls.bulkWrite.length, 1, "one bulk write for the whole batch");
    assert.equal(calls.runRequests, 1);
  });
});

test("whole-batch stage refuses when every unit is already further along", async () => {
  const units = unitsWith(["Delivered", "Delivered"]);
  await withCollections(units, async (calls) => {
    await assert.rejects(
      batchService.recordBatchStage("B-1003", "Shop", "", "Assigned"),
      (error) => error.statusCode === 409,
    );
    assert.equal(calls.bulkWrite.length, 0);
  });
});

test("whole-batch stage validates the stage and missing batches", async () => {
  await assert.rejects(
    batchService.recordBatchStage("B-1003", "Shop", "", "Lost"),
    (error) => error.statusCode === 400,
  );
  await withCollections([], async () => {
    assert.equal(await batchService.recordBatchStage("B-404", "Shop", "", "Stored"), null);
  });
});

test("a unit changed by someone else during a bulk write is not overwritten", async () => {
  const units = unitsWith(["Queued", "Queued"]);
  await withCollections(units, async () => {
    const realBulkWrite = BatchUnit.bulkWrite;
    BatchUnit.bulkWrite = async (operations) => {
      units[1].status = "Delivered"; // another scan landed first
      return realBulkWrite(operations);
    };
    const result = await batchService.recordBatchStage("B-1003", "Shop", "", "Assigned");
    assert.equal(result.updated, 1);
    assert.equal(result.skipped, 1);
    assert.equal(units[1].status, "Delivered");
  });
});

test("a 500-unit whole-batch scan sends no transactions and writes once", async () => {
  const batchBlockchain = require("../utils/batchBlockchain");
  const originalContract = batchBlockchain.contract;
  batchBlockchain.contract = new Proxy(
    {},
    { get: () => () => assert.fail("scanning must not call the contract") },
  );
  const units = unitsWith(Array.from({ length: 500 }, () => "Queued"));
  try {
    await withCollections(units, async (calls) => {
      const startedAt = Date.now();
      const result = await batchService.recordBatchStage(
        "B-1003",
        "Galle Fort Spice Shop",
        "",
        "Assigned",
      );
      assert.equal(result.updated, 500);
      assert.ok(Date.now() - startedAt < 2000);
      assert.equal(calls.bulkWrite.length, 1);
      assert.equal(calls.runRequests, 1);
    });
  } finally {
    batchBlockchain.contract = originalContract;
  }
});

// ---- Single and several units ----

test("a single unit can be found by a typed batch/unit code", async () => {
  const units = unitsWith(["Queued", "Queued", "Queued"]);
  await withCollections(units, async () => {
    const result = await batchService.scanUnit("B-1003/2", "Galle Fort Spice Shop", "", "Assigned");
    assert.equal(result.unit.unitNumber, 2);
    assert.equal(units[1].status, "Assigned");
    assert.equal(units[1].saves, 1);
    assert.equal(units[0].status, "Queued");
  });
});

test("unknown batches return not found; wrong codes for a real batch are rejected", async () => {
  const units = unitsWith(["Queued"]);
  await withCollections(units, async () => {
    assert.equal(await batchService.findUnitByCode("B-9999-1"), null);
    await assert.rejects(
      batchService.findUnitByCode("B-1003-7"),
      (error) => error.statusCode === 400,
    );
    assert.deepEqual(await batchService.resolveUnitCode("B-1003-1"), {
      batchId: "B-1003",
      unitNumber: 1,
      status: "Queued",
      assignedShop: "Unassigned",
    });
    assert.equal(await batchService.resolveUnitCode("nonsense"), null);
  });
});

test("several units from different batches are recorded in one action", async () => {
  const units = [...unitsWith(["Queued", "Queued", "Queued"]), ...unitsWith(["Queued", "Queued"], "B-1004")];
  await withCollections(units, async (calls) => {
    const result = await batchService.recordUnitsStage(
      ["B-1003-1", "B-1003/3", "B-1004-2", "B-1003-1", "B-9999-1", "nonsense"],
      "Galle Fort Spice Shop",
      "",
      "Assigned",
    );

    assert.equal(result.updated, 3);
    assert.deepEqual(
      result.results.map((entry) => entry.result),
      ["updated", "updated", "updated", "duplicate", "not_found", "invalid"],
    );
    assert.equal(units[0].status, "Assigned");
    assert.equal(units[1].status, "Queued");
    assert.equal(units[2].status, "Assigned");
    assert.equal(units[4].status, "Assigned");
    assert.equal(units[0].history.length, 1, "a unit listed twice is recorded once");
    assert.equal(calls.bulkSave.length, 1);
    assert.equal(calls.bulkSave[0].length, 3);
  });
});

test("bulk recording validates the list size and stage", async () => {
  await assert.rejects(
    batchService.recordUnitsStage([], "Shop", "", "Stored"),
    (error) => error.statusCode === 400,
  );
  await assert.rejects(
    batchService.recordUnitsStage(["B-1003-1"], "Shop", "", "Lost"),
    (error) => error.statusCode === 400,
  );
});

test("selling a unit records the check count at the time of sale", async () => {
  const units = unitsWith(["Delivered"]);
  units[0].verificationCount = 4;
  await withCollections(units, async () => {
    await batchService.scanUnit("B-1003-1", "Galle Fort Spice Shop", "", "Sold");
    assert.equal(units[0].status, "Sold");
    assert.equal(units[0].verificationCountAtSale, 4);
  });
});

// ---- Corrections ----

test("voiding a mistaken entry keeps it but restores the previous stage", async () => {
  const [unit] = unitsWith(["Sold"]);
  unit.history = [
    { status: "Queued", assignedShop: "Unassigned", timestamp: new Date("2026-09-15") },
    { status: "Stored", assignedShop: "Colombo warehouse", timestamp: new Date("2026-09-16") },
    { status: "Sold", assignedShop: "Wrong Shop", timestamp: new Date("2026-09-17") },
  ];
  unit.verificationCountAtSale = 3;

  await withCollections([unit], async () => {
    await assert.rejects(
      batchService.voidMovement("B-1003", 1, 2, "", "admin"),
      (error) => error.statusCode === 400,
    );
    const result = await batchService.voidMovement("B-1003", 1, 2, "Wrong shop scanned", "admin");

    assert.equal(result.unit.history.length, 3);
    assert.ok(result.unit.history[2].voidedAt);
    assert.equal(result.unit.history[2].voidReason, "Wrong shop scanned");
    assert.equal(result.unit.status, "Stored");
    assert.equal(result.unit.assignedShop, "Colombo warehouse");
    assert.equal(result.unit.verificationCountAtSale, undefined);
    assert.equal(unit.saves, 1);

    await assert.rejects(
      batchService.voidMovement("B-1003", 1, 2, "again", "admin"),
      (error) => error.statusCode === 409,
    );
    await assert.rejects(
      batchService.voidMovement("B-1003", 1, 0, "creation", "admin"),
      (error) => error.statusCode === 400,
    );
  });
});

test("recall requires a customer message and can be lifted", async () => {
  const batch = {
    batchId: "B-1003",
    async save() {},
  };
  const original = Batch.findOne;
  Batch.findOne = async () => batch;
  try {
    await assert.rejects(
      batchService.setRecall("B-1003", { publicMessage: " " }, "admin"),
      (error) => error.statusCode === 400,
    );
    await batchService.setRecall("B-1003", { publicMessage: "Do not use.", reason: "Lab result" }, "admin");
    assert.equal(batch.recall.active, true);
    await batchService.liftRecall("B-1003", "admin");
    assert.equal(batch.recall.active, false);
    assert.ok(batch.recall.liftedAt);
  } finally {
    Batch.findOne = original;
  }
});

test("retail stages accept only approved retailers", async () => {
  const Retailer = require("../models/Retailer");
  const original = Retailer.findById;
  const retailers = {
    "64b000000000000000000001": {
      _id: "64b000000000000000000001",
      companyName: "Galle Fort Spice Shop",
      shippingAddresses: [{ address: "12 Church St", city: "Galle" }],
      verification: { status: "APPROVED" },
    },
    "64b000000000000000000002": {
      _id: "64b000000000000000000002",
      companyName: "Pending Shop",
      verification: { status: "PENDING" },
    },
  };
  Retailer.findById = (id) => ({
    select: () => ({ lean: async () => retailers[id] || null }),
  });
  try {
    assert.deepEqual(
      await batchService.resolveLocation("Assigned", "", "64b000000000000000000001"),
      {
        assignedShop: "Galle Fort Spice Shop",
        retailerId: "64b000000000000000000001",
        retailerCity: "Galle",
      },
    );
    await assert.rejects(
      batchService.resolveLocation("Assigned", "", "64b000000000000000000002"),
      (error) => error.statusCode === 400,
    );
    await assert.rejects(
      batchService.resolveLocation("Assigned", "  ", undefined),
      (error) => error.statusCode === 400,
    );
  } finally {
    Retailer.findById = original;
  }
});

test("whole-batch stage endpoint is admin-only", async () => {
  process.env.JWT_SECRET = "batch-stage-test-secret";
  const express = require("express");
  const app = express();
  app.use(express.json());
  app.use("/api/batches", require("../routes/batches"));
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}/api/batches`;
    for (const [method, path] of [
      ["POST", "/B-1003/stage"],
      ["GET", "/B-1003/units"],
      ["GET", "/units/resolve?code=B-1003-1"],
      ["GET", "/admin/blockchain/B-1003"],
    ]) {
      const response = await fetch(`${base}${path}`, { method });
      assert.equal(response.status, 401, `${method} ${path}`);
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
