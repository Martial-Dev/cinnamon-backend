const assert = require("node:assert/strict");
const test = require("node:test");
const crypto = require("crypto");
const batchService = require("../services/batchService");
const { planBatch, toUnitDocument } = require("../scripts/migrate-units-to-collection");

// A batch exactly as it was stored before units moved out: units embedded,
// and its fingerprint computed from that embedded array.
const legacyBatch = () => {
  const batch = {
    _id: "batch-object-id",
    batchId: "B-1003",
    productName: "Ceylon Cinnamon Alba",
    producedOn: new Date("2026-09-15T00:00:00.000Z"),
    totalUnits: 3,
    quantityPerUnit: 40,
    quantityUnit: "g",
    notes: "",
    sourceMaterials: [],
    units: [1, 2, 3].map((unitNumber) => ({
      unitNumber,
      qrCode: `http://localhost:4200/trace/B-1003/${unitNumber}`,
      quantity: 40,
      ...(unitNumber === 1 ? {} : { verificationToken: crypto.randomBytes(32).toString("hex") }),
      history: [],
    })),
  };
  batch.dataHash = batchService.calculateHash(batch);
  return batch;
};

test("fingerprints made from embedded units still match after the move", () => {
  const batch = legacyBatch();
  const { units, ...batchWithoutUnits } = batch;
  // Units come back from the new collection in any order.
  const fromCollection = [units[2], units[0], units[1]];
  assert.equal(batchService.calculateHash(batchWithoutUnits, fromCollection), batch.dataHash);
});

test("the migration plan reports what will move and checks the fingerprint", () => {
  const batch = legacyBatch();
  const plan = planBatch(batch, new Set([2]), (data, units) =>
    batchService.calculateHash(data, units),
  );
  assert.equal(plan.units, 3);
  assert.equal(plan.alreadyMoved, 1);
  assert.equal(plan.toMove, 2);
  assert.equal(plan.tokensToIssue, 1);
  assert.equal(plan.hashMatches, true);

  batch.units[0].quantity = 999; // edited after it was fingerprinted
  const tampered = planBatch(batch, new Set(), (data, units) =>
    batchService.calculateHash(data, units),
  );
  assert.equal(tampered.hashMatches, false);
});

test("moved units keep their QR value and get a token if they had none", () => {
  const batch = legacyBatch();
  const doc = toUnitDocument(batch, batch.units[0], new Date());
  assert.equal(doc.batch, "batch-object-id");
  assert.equal(doc.batchId, "B-1003");
  assert.equal(doc.qrCode, "http://localhost:4200/trace/B-1003/1");
  assert.match(doc.verificationToken, /^[a-f0-9]{64}$/);
  const kept = toUnitDocument(batch, batch.units[1], new Date());
  assert.equal(kept.verificationToken, batch.units[1].verificationToken);
});
