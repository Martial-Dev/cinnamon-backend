const assert = require("node:assert/strict");
const test = require("node:test");
const {
  PublicVerificationService,
} = require("../services/publicVerificationService");
const {
  TOKEN_PATTERN,
  createVerificationToken,
  createVerificationUrl,
  getPublicBaseUrl,
  getVerificationTokenFromValue,
} = require("../utils/publicVerification");

test("token generation uses 256-bit random values and configurable URLs", () => {
  const token = createVerificationToken();
  assert.match(token, TOKEN_PATTERN);
  assert.notEqual(token, createVerificationToken());
  assert.equal(
    createVerificationUrl(token, "https://verify.example.test/"),
    `https://verify.example.test/verify/${token}`,
  );
  assert.equal(getVerificationTokenFromValue(token), token);
  assert.equal(
    getVerificationTokenFromValue(
      `https://verify.example.test/verify/${token}`,
    ),
    token,
  );
  assert.equal(
    getVerificationTokenFromValue("https://example.test/trace/B-1003/1"),
    null,
  );
  assert.equal(
    getPublicBaseUrl({
      PUBLIC_VERIFICATION_BASE_URL: "https://staging.example.test/",
      NODE_ENV: "production",
    }),
    "https://staging.example.test",
  );
  assert.throws(() =>
    getPublicBaseUrl({
      PUBLIC_VERIFICATION_BASE_URL: "http://localhost:4200",
      NODE_ENV: "production",
    }),
  );
});

const chain = (value) => {
  const c = {
    select: () => c,
    lean: () => c,
    sort: () => c,
    skip: () => c,
    limit: () => c,
    then: (resolve, reject) => Promise.resolve(value).then(resolve, reject),
  };
  return c;
};

const BATCH = {
  _id: "mongo-batch-id",
  batchId: "B-1003",
  productName: "Ceylon Cinnamon Alba",
  quantityUnit: "g",
  totalUnits: 15,
  quantityPerUnit: 40,
  producedOn: new Date("2026-09-15T00:00:00.000Z"),
  dataHash: "batch-hash",
  sourceMaterials: [],
};

const makeUnit = (unitNumber, overrides = {}) => ({
  _id: `unit-${unitNumber}`,
  batch: "mongo-batch-id",
  batchId: "B-1003",
  unitNumber,
  verificationToken: unitNumber.toString(16).padStart(2, "0").repeat(32),
  qrCode: `private-qr-value-${unitNumber}`,
  quantity: 40,
  status: "Assigned",
  history: [{ status: "Assigned", timestamp: new Date("2026-09-18"), assignedShop: "Shop" }],
  verificationCount: 1,
  ...overrides,
});

const quietSuppliers = { find: () => chain([]) };

const makeService = ({ units = [], hashCalls = { count: 0 }, env = {} } = {}) => {
  const updates = [];
  const UnitModel = {
    findOneAndUpdate(filter, update) {
      updates.push({ filter, update });
      const unit = units.find((entry) => entry.verificationToken === filter.verificationToken);
      if (unit) unit.verificationCount = Number(unit.verificationCount || 0) + 1;
      return chain(unit || null);
    },
  };
  const service = new PublicVerificationService({
    UnitModel,
    BatchModel: { findById: () => chain(BATCH) },
    SupplierModel: quietSuppliers,
    PurchaseOrderModel: { find: () => chain([]) },
    batchHashService: {
      calculateStoredHash: async () => {
        hashCalls.count += 1;
        return "batch-hash";
      },
    },
    blockchainService: {
      verifyBatch: async () => ({ status: "NOT_CONFIGURED", verified: false }),
    },
    env,
  });
  return { service, updates };
};

test("a scan updates and reads only the unit with that token", async () => {
  const units = Array.from({ length: 15 }, (_, index) => makeUnit(index + 1));
  const { service, updates } = makeService({ units });
  const token = units[6].verificationToken;

  const result = await service.getPublicVerification(token);
  const serialized = JSON.stringify(result);

  assert.equal(updates.length, 1);
  assert.deepEqual(updates[0].filter, { verificationToken: token });
  assert.equal(updates[0].update.$inc.verificationCount, 1);
  assert.equal(result.recordFound, true);
  assert.equal(result.product.name, "Ceylon Cinnamon Alba");
  assert.equal(result.scanHistory.verificationCount, 2);
  assert.equal("units" in result, false);
  for (const unit of units) {
    assert.equal(serialized.includes(unit.verificationToken), false);
    assert.equal(serialized.includes(unit.qrCode), false);
  }
  assert.equal(serialized.includes("mongo-batch-id"), false);
  assert.equal(serialized.includes("NOT_CONFIGURED"), false);
});

test("unknown and malformed tokens return nothing", async () => {
  const { service, updates } = makeService();
  assert.equal(await service.getPublicVerification("f".repeat(64)), null);
  assert.equal(await service.getPublicVerification("B-1003/01"), null);
  assert.equal(updates.length, 1, "malformed tokens never reach the database");
});

test("the batch fingerprint is reused between scans instead of re-reading every unit", async () => {
  const units = [makeUnit(1), makeUnit(2)];
  const hashCalls = { count: 0 };
  const { service } = makeService({ units, hashCalls });

  await service.getPublicVerification(units[0].verificationToken);
  await service.getPublicVerification(units[1].verificationToken);
  assert.equal(hashCalls.count, 1);

  const expiredCalls = { count: 0 };
  const expired = makeService({ units, hashCalls: expiredCalls, env: { PUBLIC_HASH_CACHE_MS: "1" } });
  await expired.service.getPublicVerification(units[0].verificationToken);
  await new Promise((resolve) => setTimeout(resolve, 5));
  await expired.service.getPublicVerification(units[0].verificationToken);
  assert.equal(expiredCalls.count, 2, "recomputed after the cache expires");
});

test("admin unit rows flag outdated QR values and unusual activity", () => {
  const token = "c".repeat(64);
  const service = new PublicVerificationService({
    env: { PUBLIC_VERIFICATION_ALERT_THRESHOLD: "3" },
  });
  const current = service.serializeAdminUnit(
    { unitNumber: 1, verificationToken: token, qrCode: `https://verify.example.test/verify/${token}` },
    "https://verify.example.test",
  );
  const legacy = service.serializeAdminUnit(
    { unitNumber: 2, verificationToken: token, qrCode: "http://localhost:4200/trace/B-1003/2", verificationCount: 4 },
    "https://verify.example.test",
  );

  assert.equal(current.qrCodeOutdated, false);
  assert.equal(current.unusualActivity, false);
  assert.equal(legacy.qrCodeOutdated, true);
  assert.equal(legacy.unusualActivity, true);
  assert.equal(legacy.verificationUrl, `https://verify.example.test/verify/${token}`);
});

test("units without a token get one, without touching their original QR value", async () => {
  const writes = [];
  const service = new PublicVerificationService({
    UnitModel: { bulkWrite: async (operations) => writes.push(...operations) },
    env: { PUBLIC_VERIFICATION_BASE_URL: "https://verify.example.test" },
  });
  const units = [
    { _id: 1, unitNumber: 1, qrCode: "http://localhost:4200/trace/B-1003/1" },
    { _id: 2, unitNumber: 2, qrCode: "x", verificationToken: "a".repeat(64) },
  ];

  await service.issueMissingTokens(units);

  assert.match(units[0].verificationToken, TOKEN_PATTERN);
  assert.equal(units[0].qrCode, "http://localhost:4200/trace/B-1003/1");
  assert.equal(writes.length, 1, "only the unit that lacked a token is written");
  assert.deepEqual(writes[0].updateOne.filter, { _id: 1, verificationToken: { $exists: false } });
});

test("unit pages filter on the server and cap their size", async () => {
  const queries = [];
  let selected = null;
  let limit = null;
  const service = new PublicVerificationService({
    UnitModel: {
      find(query) {
        queries.push(query);
        const c = chain([]);
        c.select = (fields) => {
          selected = fields;
          return c;
        };
        c.limit = (value) => {
          limit = value;
          return c;
        };
        return c;
      },
      countDocuments: async () => 0,
      bulkWrite: async () => {},
    },
    AnchorModel: { find: () => chain([]) },
    env: { PUBLIC_VERIFICATION_BASE_URL: "https://verify.example.test" },
  });

  await service.listAdminUnits("B-1003", { filter: "attention", q: "12" });
  assert.equal(queries[0].batchId, "B-1003");
  assert.ok(queries[0].$or, "attention filter applied in the database");
  assert.equal(queries[0].$expr.$regexMatch.regex, "^12");

  await service.listAdminUnits("B-1003", { filter: "scanned", limit: 100000 });
  assert.deepEqual(queries[1].verificationCount, { $gt: 0 });
  assert.equal(limit, 200);

  await service.listAdminUnits("B-1003", { fields: "labels", limit: 100000 });
  assert.equal(limit, 10000);
  assert.doesNotMatch(selected, /history/);
});

test("batch summaries are counted in the database", async () => {
  const service = new PublicVerificationService({
    UnitModel: {
      aggregate: async (pipeline) => {
        const match = pipeline[0].$match;
        if (pipeline[1].$group._id.status) {
          return [
            { _id: { batchId: "B-1003", status: "Queued" }, count: 10 },
            { _id: { batchId: "B-1003", status: "Sold" }, count: 5 },
          ];
        }
        if (match.verificationCount) return [{ _id: "B-1003", count: 7 }];
        return [{ _id: "B-1003", count: 2 }];
      },
    },
    env: { PUBLIC_VERIFICATION_BASE_URL: "https://verify.example.test" },
  });

  const summaries = await service.getUnitSummaries(["B-1003", "B-1004"]);

  assert.deepEqual(summaries.get("B-1003"), {
    total: 15,
    byStatus: { Queued: 10, Sold: 5 },
    needsAttention: 2,
    scanned: 7,
  });
  assert.deepEqual(summaries.get("B-1004"), {
    total: 0,
    byStatus: {},
    needsAttention: 0,
    scanned: 0,
  });
});
