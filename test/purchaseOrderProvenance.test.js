const assert = require("node:assert/strict");
const test = require("node:test");
const PurchaseOrder = require("../models/PurchaseOrder");
const poController = require("../controllers/poController");

const allocatedOrder = () => ({
  _id: "6ac4d096b665641acd97437e",
  orderStatus: "completed",
  supplierId: "6ac36bec98a8108659e4f618",
  receivedAt: undefined,
  items: [
    {
      productName: 'Alba 5"',
      quantity: 1,
      unit: "kg",
      unitPrice: 8000,
      lineTotal: 8000,
      materialCategory: "cinnamon",
      allocatedQuantity: 0.6,
    },
  ],
});

const call = async (handler, req) => {
  let statusCode = 200;
  let body;
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(value) {
      body = value;
      return this;
    },
  };
  await handler(req, res);
  return { statusCode, body };
};

const withModel = async (existing, callback) => {
  const original = {
    findById: PurchaseOrder.findById,
    findByIdAndUpdate: PurchaseOrder.findByIdAndUpdate,
  };
  const updates = [];
  PurchaseOrder.findById = async () => existing;
  PurchaseOrder.findByIdAndUpdate = async (_id, update) => {
    updates.push(update);
    return { ...existing, ...update };
  };
  try {
    await callback(updates);
  } finally {
    Object.assign(PurchaseOrder, original);
  }
};

test("harvest dates can be added to a line already used by a batch", async () => {
  const existing = allocatedOrder();
  await withModel(existing, async (updates) => {
    const { statusCode } = await call(poController.updatePO, {
      params: { id: existing._id },
      body: {
        products: [{ ...existing.items[0], harvestedOn: "2026-09-10" }],
      },
    });
    assert.equal(statusCode, 200);
    assert.equal(
      updates[0]["items.0.harvestedOn"].toISOString(),
      "2026-09-10T00:00:00.000Z",
    );
    assert.equal("items" in updates[0], false);
  });
});

test("quantities on an allocated line still cannot be changed", async () => {
  const existing = allocatedOrder();
  await withModel(existing, async (updates) => {
    const { statusCode } = await call(poController.updatePO, {
      params: { id: existing._id },
      body: { products: [{ ...existing.items[0], quantity: 5 }] },
    });
    assert.equal(statusCode, 409);
    assert.equal(updates.length, 0);
  });
});

test("completing a purchase order records when it was received", async () => {
  const existing = { ...allocatedOrder(), orderStatus: "accepted", items: [] };
  await withModel(existing, async (updates) => {
    await call(poController.updateOrderStatus, {
      params: { id: existing._id },
      body: { status: "completed" },
    });
    assert.ok(updates[0].receivedAt instanceof Date);
  });
});

test("clients cannot set the receipt date directly", async () => {
  const existing = { ...allocatedOrder(), items: [] };
  await withModel(existing, async (updates) => {
    await call(poController.updatePO, {
      params: { id: existing._id },
      body: { receivedAt: "2020-01-01", notes: "x" },
    });
    assert.equal("receivedAt" in updates[0], false);
  });
});

test("harvest-date endpoint updates only harvest dates on an allocated PO", async () => {
  const existing = allocatedOrder();
  await withModel(existing, async (updates) => {
    const { statusCode } = await call(poController.updateHarvestDates, {
      params: { id: existing._id },
      body: { lines: [{ index: 0, harvestedOn: "2026-09-10" }] },
    });
    assert.equal(statusCode, 200);
    assert.deepEqual(Object.keys(updates[0]), ["$set"]);
    assert.deepEqual(Object.keys(updates[0].$set), ["items.0.harvestedOn"]);
  });
});

test("harvest-date endpoint rejects future dates and non-cinnamon lines", async () => {
  const existing = allocatedOrder();
  existing.items.push({ productName: "Packaging film", materialCategory: "other" });
  await withModel(existing, async (updates) => {
    const future = await call(poController.updateHarvestDates, {
      params: { id: existing._id },
      body: { lines: [{ index: 0, harvestedOn: "2099-01-01" }] },
    });
    const otherLine = await call(poController.updateHarvestDates, {
      params: { id: existing._id },
      body: { lines: [{ index: 1, harvestedOn: "2026-09-10" }] },
    });
    assert.equal(future.statusCode, 400);
    assert.equal(otherLine.statusCode, 400);
    assert.equal(updates.length, 0);
  });
});

test("harvest-date endpoint is admin-only", async () => {
  process.env.JWT_SECRET = "harvest-route-test-secret";
  const express = require("express");
  const app = express();
  app.use("/api/purchase-order", require("../routes/purchase-order"));
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/api/purchase-order/x/harvest-dates`,
      { method: "PUT" },
    );
    assert.equal(response.status, 401);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

const acceptedOrder = () => ({
  _id: "6ac4d096b665641acd97437e",
  orderStatus: "accepted",
  receipts: [],
  items: [
    { productName: 'Alba 5"', quantity: 10, unit: "kg", materialCategory: "cinnamon" },
    { productName: "Bags", quantity: 100, unit: "pcs", materialCategory: "other" },
  ],
  async save() {
    this.saved = true;
  },
});

test("partial deliveries add up and complete the order when everything arrives", async () => {
  const po = acceptedOrder();
  await withModel(po, async () => {
    const first = await call(poController.recordReceipt, {
      params: { id: po._id },
      body: { receivedAt: "2026-09-12", lines: [{ index: 0, quantity: 4 }] },
      userData: { userId: "admin" },
    });
    assert.equal(first.statusCode, 200);
    assert.equal(po.items[0].receivedQuantity, 4);
    assert.equal(po.orderStatus, "accepted");
    assert.equal(po.receivedAt.toISOString(), "2026-09-12T00:00:00.000Z");

    const tooMuch = await call(poController.recordReceipt, {
      params: { id: po._id },
      body: { lines: [{ index: 0, quantity: 7 }] },
    });
    assert.equal(tooMuch.statusCode, 400);
    assert.match(tooMuch.body.message, /only 6 kg is still outstanding/);

    await call(poController.recordReceipt, {
      params: { id: po._id },
      body: { lines: [{ index: 0, quantity: 6 }, { index: 1, quantity: 100 }] },
    });
    assert.equal(po.items[0].receivedQuantity, 10);
    assert.equal(po.orderStatus, "completed");
    assert.equal(po.receipts.length, 2);
  });
});

test("deliveries cannot be recorded before acceptance or with a future date", async () => {
  const draft = { ...acceptedOrder(), orderStatus: "sent" };
  await withModel(draft, async () => {
    const response = await call(poController.recordReceipt, {
      params: { id: draft._id },
      body: { lines: [{ index: 0, quantity: 1 }] },
    });
    assert.equal(response.statusCode, 409);
  });
  const po = acceptedOrder();
  await withModel(po, async () => {
    const response = await call(poController.recordReceipt, {
      params: { id: po._id },
      body: { receivedAt: "2099-01-01", lines: [{ index: 0, quantity: 1 }] },
    });
    assert.equal(response.statusCode, 400);
  });
});

test("closing a tracked order early marks undelivered lines as not received", async () => {
  const po = acceptedOrder();
  po.receipts = [{ receivedAt: new Date(), lines: [{ index: 0, quantity: 4 }] }];
  po.items[0].receivedQuantity = 4;
  await withModel(po, async (updates) => {
    await call(poController.updateOrderStatus, {
      params: { id: po._id },
      body: { status: "completed" },
    });
    assert.equal(updates[0]["items.1.receivedQuantity"], 0);
    assert.equal("items.0.receivedQuantity" in updates[0], false);
  });
});

test("older completed orders can have their receipt date filled in", async () => {
  const existing = allocatedOrder();
  await withModel(existing, async (updates) => {
    const response = await call(poController.updateHarvestDates, {
      params: { id: existing._id },
      body: { receivedAt: "2026-09-12" },
    });
    assert.equal(response.statusCode, 200);
    assert.equal(updates[0].$set.receivedAt.toISOString(), "2026-09-12T00:00:00.000Z");
  });
});
