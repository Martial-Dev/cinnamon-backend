const assert = require("node:assert/strict");
const test = require("node:test");
const PurchaseOrder = require("../models/PurchaseOrder");
const batchService = require("../services/batchService");

const PO_ID = "6ac4d096b665641acd97437e";

const withPurchaseOrder = async (callback) => {
  const original = {
    findById: PurchaseOrder.findById,
    updateOne: PurchaseOrder.updateOne,
  };
  const previousBaseUrl = process.env.PUBLIC_VERIFICATION_BASE_URL;
  process.env.PUBLIC_VERIFICATION_BASE_URL = "https://verify.example.test";
  const reservations = [];
  PurchaseOrder.findById = () => ({
    populate: async () => ({
      _id: PO_ID,
      orderStatus: "completed",
      supplierId: { _id: "6ac36bec98a8108659e4f618", supplierName: "Supplier" },
      items: [
        {
          productName: 'Alba 5"',
          materialCategory: "cinnamon",
          quantity: 1,
          unit: "kg",
          allocatedQuantity: 0,
        },
      ],
    }),
  });
  PurchaseOrder.updateOne = async (filter, update) => {
    reservations.push(update);
    throw new Error("stop after reservation");
  };
  try {
    await callback(reservations);
  } finally {
    Object.assign(PurchaseOrder, original);
    process.env.PUBLIC_VERIFICATION_BASE_URL = previousBaseUrl;
  }
};

const payload = (allocatedKg) => ({
  batchId: "B-1004",
  productName: "Ceylon Cinnamon Alba",
  totalUnits: 15,
  quantityPerUnit: 40,
  quantityUnit: "g",
  sourceAllocations: [
    { purchaseOrderId: PO_ID, purchaseOrderItemIndex: 0, quantity: allocatedKg },
  ],
});

test("allocating more cinnamon than the batch uses is rejected before reserving stock", async () => {
  await withPurchaseOrder(async (reservations) => {
    await assert.rejects(
      batchService.createBatch(payload(1), "admin"),
      (error) =>
        error.statusCode === 400 &&
        /exceeds what this batch uses \(600 g\)/.test(error.message),
    );
    assert.equal(reservations.length, 0);
  });
});

test("allocating exactly the batch output reserves only that amount", async () => {
  await withPurchaseOrder(async (reservations) => {
    await assert.rejects(
      batchService.createBatch(payload(0.6), "admin"),
      /stop after reservation/,
    );
    assert.equal(reservations.length, 1);
    assert.equal(reservations[0].$inc["items.0.allocatedQuantity"], 0.6);
  });
});

test("under-allocation is still rejected", async () => {
  await withPurchaseOrder(async () => {
    await assert.rejects(
      batchService.createBatch(payload(0.5), "admin"),
      /do not cover the batch output/,
    );
  });
});

test("repair plan returns the unused 400 g of a 1 kg allocation", () => {
  const { planRelease } = require("../scripts/release-over-allocated-stock");
  const plan = planRelease(
    {
      totalUnits: 15,
      quantityPerUnit: 40,
      quantityUnit: "g",
      sourceMaterials: [
        { purchaseOrderId: PO_ID, purchaseOrderItemIndex: 0, quantity: 1, unit: "kg" },
      ],
    },
    batchService.massToGrams,
  );

  assert.deepEqual(plan, [
    {
      sourceIndex: 0,
      purchaseOrderId: PO_ID,
      itemIndex: 0,
      unit: "kg",
      from: 1,
      to: 0.6,
      release: 0.4,
    },
  ]);
});

test("scanning rejects unknown stages before touching the database", async () => {
  await assert.rejects(
    batchService.scanUnit("a".repeat(64), "Shop", "", "Lost"),
    (error) => error.statusCode === 400 && /Stage must be one of/.test(error.message),
  );
});

test("only delivered quantities are available for batches", () => {
  const { receivedQuantityOf } = batchService;
  assert.equal(receivedQuantityOf({ orderStatus: "completed" }, { quantity: 10 }), 10);
  assert.equal(receivedQuantityOf({ orderStatus: "accepted" }, { quantity: 10 }), 0);
  assert.equal(
    receivedQuantityOf({ orderStatus: "accepted" }, { quantity: 10, receivedQuantity: 4 }),
    4,
  );
  assert.equal(
    receivedQuantityOf({ orderStatus: "completed" }, { quantity: 10, receivedQuantity: 4 }),
    4,
  );
});

test("processing loss raises the cinnamon a batch must be allocated", async () => {
  // 15 x 40 g = 600 g packed; with 25% loss the batch needs 800 g.
  assert.equal(batchService.requiredInputGrams(600, 25), 800);
  await withPurchaseOrder(async (reservations) => {
    await assert.rejects(
      batchService.createBatch({ ...payload(0.6), processingLossPercent: 25 }, "admin"),
      /do not cover/,
    );
    await assert.rejects(
      batchService.createBatch({ ...payload(0.8), processingLossPercent: 25 }, "admin"),
      /stop after reservation/,
    );
    assert.equal(reservations.length, 1);
    await assert.rejects(
      batchService.createBatch({ ...payload(0.8), processingLossPercent: 60 }, "admin"),
      /between 0 and 50%/,
    );
  });
});
