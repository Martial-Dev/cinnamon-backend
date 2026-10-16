const assert = require("node:assert/strict");
const test = require("node:test");
const {
  toPublicVerificationDto,
} = require("../services/publicVerificationDto");

const sample = (blockchainStatus = "NOT_CONFIGURED") => ({
  batch: {
    _id: "internal-batch-id",
    batchId: "B-1003",
    productName: "Ceylon Cinnamon",
    quantityUnit: "g",
    notes: "private batch note",
    sourceMaterials: [
      {
        purchaseOrderId: "internal-po-id",
        supplierId: "internal-supplier-id",
        supplierName: "Private Supplier Name",
        grade: "Alba",
      },
    ],
    units: [
      { unitNumber: 1, verificationToken: "first-token" },
      { unitNumber: 2, verificationToken: "sibling-token" },
    ],
  },
  unit: {
    unitNumber: 1,
    quantity: 40,
    history: [
      {
        status: "Packed",
        timestamp: "2026-09-18T00:00:00.000Z",
        notes: "private movement note",
        assignedShop: "Private Shop",
      },
    ],
    verificationCount: 2,
    firstVerifiedAt: "2026-10-06T00:00:00.000Z",
  },
  supplierRecords: new Map([
    [
      "internal-supplier-id",
      {
        _id: "internal-supplier-id",
        country: "Sri Lanka",
        province: "Southern Province",
        district: "Matara",
        address: "Private home address",
        phone: "+94000000000",
        email: "private@example.test",
        publicLocationPrecision: "district",
        publicDisplay: "anonymous",
      },
    ],
  ]),
  blockchain: {
    status: blockchainStatus,
    verified: blockchainStatus === "VERIFIED",
    reason:
      blockchainStatus === "NOT_CONFIGURED" ? undefined : "CHAIN_QUERY_FAILED",
    blockchain: {
      txId: "0xprivate-transaction",
      contractAddress: "0xprivate-contract",
      network: "private-network",
    },
  },
});

test("public DTO contains one unit's customer information only", () => {
  const dto = toPublicVerificationDto(sample());
  const serialized = JSON.stringify(dto);

  assert.deepEqual(dto.product, {
    brand: "Canela Ceylon",
    name: "Ceylon Cinnamon",
    grade: "Alba",
    netWeight: "40 g",
  });
  assert.equal(dto.journey.length, 1);
  assert.equal(dto.journey[0].stage, "Packed");
  assert.equal(dto.journey[0].date, "2026-09-18T00:00:00.000Z");
  assert.equal(dto.scanHistory.verificationCount, 2);
  for (const privateValue of [
    "internal-batch-id",
    "internal-po-id",
    "internal-supplier-id",
    "sibling-token",
    "Private Supplier Name",
    "private batch note",
    "private movement note",
    "Private Shop",
    "Private home address",
    "+94000000000",
    "private@example.test",
    "0xprivate-transaction",
    "0xprivate-contract",
    "private-network",
  ]) {
    assert.equal(serialized.includes(privateValue), false, privateValue);
  }
  assert.deepEqual(dto.origin.locations, [
    {
      country: "Sri Lanka",
      province: "Southern Province",
      district: "Matara",
    },
  ]);
});

test("public DTO omits journey stages that have no recorded events", () => {
  const result = sample();
  result.unit.history = [];

  assert.deepEqual(toPublicVerificationDto(result).journey, []);
});

test("public producer naming requires explicit consent", () => {
  const result = sample();
  result.supplierRecords.get("internal-supplier-id").publicDisplay = "fullName";
  result.supplierRecords.get("internal-supplier-id").publicName =
    "Approved Name";

  assert.deepEqual(toPublicVerificationDto(result).origin.producers, [
    "Canela Ceylon supply partner",
  ]);

  result.supplierRecords.get(
    "internal-supplier-id",
  ).publicIdentificationConsent = true;
  assert.deepEqual(toPublicVerificationDto(result).origin.producers, [
    "Approved Name",
  ]);
});

test("public wording never exposes NOT_CONFIGURED or raw chain fields", () => {
  const dto = toPublicVerificationDto(sample());
  const serialized = JSON.stringify(dto);

  assert.equal(dto.verification.state, "available");
  assert.match(dto.verification.message, /currently being introduced/);
  assert.equal(serialized.includes("NOT_CONFIGURED"), false);
  assert.equal(serialized.includes("transaction"), false);
});

test("public blockchain wording distinguishes verified and integrity failures", () => {
  const verified = sample("VERIFIED");
  verified.blockchain.reason = undefined;
  assert.equal(
    toPublicVerificationDto(verified).verification.blockchainVerified,
    true,
  );

  const mismatch = sample("FAILED");
  mismatch.blockchain.reason = "ONCHAIN_HASH_MISMATCH";
  assert.equal(
    toPublicVerificationDto(mismatch).verification.state,
    "attention",
  );

  const pending = sample("PENDING");
  pending.blockchain.reason = undefined;
  assert.match(
    toPublicVerificationDto(pending).verification.message,
    /verification for this product is pending/,
  );

  const recordingFailure = sample("FAILED");
  recordingFailure.blockchain.reason = "RECORDING_FAILED";
  assert.match(
    toPublicVerificationDto(recordingFailure).verification.message,
    /temporarily unavailable/,
  );
});

test("journey shows the full recorded supply chain in order", () => {
  const result = sample();
  result.batch.producedOn = "2026-09-18T00:00:00.000Z";
  result.batch.sourceMaterials[0].purchaseOrderId = "po-1";
  result.batch.sourceMaterials[0].purchaseOrderItemIndex = 0;
  result.supplierRecords.get("internal-supplier-id").village =
    "Kurundugahahetekma";
  result.supplierRecords.get("internal-supplier-id").district = "Galle";
  result.supplierRecords.get("internal-supplier-id").publicLocationPrecision =
    "village";
  result.purchaseOrderRecords = new Map([
    [
      "po-1",
      {
        receivedAt: "2026-09-16T05:00:00.000Z",
        items: [{ harvestedOn: "2026-09-10T00:00:00.000Z" }],
      },
    ],
  ]);
  result.unit.history = [
    { status: "Delivered", timestamp: "2026-09-22T06:00:00.000Z", assignedShop: "Galle Fort Spice Shop" },
    { status: "Queued", timestamp: "2026-09-18T03:00:00.000Z", assignedShop: "Unassigned" },
    { status: "Stored", timestamp: "2026-09-19T03:00:00.000Z", assignedShop: "Warehouse B, Bay 4", notes: "pallet 12" },
    { status: "Assigned", timestamp: "2026-09-20T04:00:00.000Z", assignedShop: "Galle Fort Spice Shop" },
    { status: "Packed", timestamp: "not-a-date" },
  ];

  const journey = toPublicVerificationDto(result).journey;
  const serialized = JSON.stringify(journey);

  assert.deepEqual(
    journey.map((event) => [event.stage, event.date]),
    [
      ["Harvested", "2026-09-10T00:00:00.000Z"],
      ["Received by Canela Ceylon", "2026-09-16T05:00:00.000Z"],
      ["Packed", "2026-09-18T00:00:00.000Z"],
      ["Stored", "2026-09-19T03:00:00.000Z"],
      ["Dispatched", "2026-09-20T04:00:00.000Z"],
      ["Available at retailer", "2026-09-22T06:00:00.000Z"],
    ],
  );
  assert.equal(
    journey[0].detail,
    "Cinnamon harvested in Kurundugahahetekma, Galle District.",
  );
  assert.equal(journey[4].detail, "Sent to Galle Fort Spice Shop.");
  assert.equal(journey[5].detail, "Received at Galle Fort Spice Shop.");
  assert.equal(serialized.includes("Warehouse B"), false);
  assert.equal(serialized.includes("pallet 12"), false);
  assert.equal(serialized.includes("Traceability record created"), false);
});

test("village precision publishes the village but never the address", () => {
  const result = sample();
  const supplier = result.supplierRecords.get("internal-supplier-id");
  supplier.village = "Kurundugahahetekma";
  supplier.district = "Galle";
  supplier.publicLocationPrecision = "village";

  const dto = toPublicVerificationDto(result);

  assert.deepEqual(dto.origin.locations, [
    {
      country: "Sri Lanka",
      district: "Galle",
      province: "Southern Province",
      village: "Kurundugahahetekma",
    },
  ]);
  assert.equal(JSON.stringify(dto).includes("Private home address"), false);

  supplier.publicLocationPrecision = "exact";
  assert.deepEqual(toPublicVerificationDto(result).origin.locations, [
    { country: "Sri Lanka" },
  ]);
});

test("journey omits harvest and receipt when they were never recorded", () => {
  const result = sample();
  delete result.batch.producedOn;

  const stages = toPublicVerificationDto(result).journey.map((e) => e.stage);

  assert.equal(stages.includes("Harvested"), false);
  assert.equal(stages.includes("Received by Canela Ceylon"), false);
});

test("dates are normalised to ISO strings for Sri Lanka-local display", () => {
  const result = sample();
  result.unit.history = [
    { status: "Packed", timestamp: new Date("2026-09-17T20:00:00.000Z") },
  ];
  result.unit.firstVerifiedAt = new Date("2026-10-06T19:00:00.000Z");

  const dto = toPublicVerificationDto(result);

  assert.equal(dto.journey[0].date, "2026-09-17T20:00:00.000Z");
  assert.equal(dto.scanHistory.firstVerifiedAt, "2026-10-06T19:00:00.000Z");
});

test("unusual verification activity is flagged above the configured threshold", () => {
  const result = sample();
  result.unit.verificationCount = 5;
  result.env = { PUBLIC_VERIFICATION_ALERT_THRESHOLD: "5" };
  assert.equal(toPublicVerificationDto(result).scanHistory.unusualActivity, false);

  result.unit.verificationCount = 6;
  assert.equal(toPublicVerificationDto(result).scanHistory.unusualActivity, true);
});

test("public DTO never exposes batch codes, unit numbers, or other units", () => {
  const dto = toPublicVerificationDto(sample());
  const serialized = JSON.stringify(dto);

  assert.equal(serialized.includes("B-1003"), false);
  assert.equal("units" in dto, false);
  assert.equal(serialized.includes("unitNumber"), false);
  assert.equal(serialized.includes("first-token"), false);
});

test("voided entries are hidden and sold units show the retailer town", () => {
  const result = sample();
  result.unit.history = [
    { status: "Assigned", timestamp: "2026-09-20T04:00:00.000Z", assignedShop: "Wrong Shop", voidedAt: "2026-09-20T05:00:00.000Z" },
    { status: "Assigned", timestamp: "2026-09-20T06:00:00.000Z", assignedShop: "Galle Fort Spice Shop", retailerCity: "Galle" },
    { status: "Sold", timestamp: "2026-09-25T06:00:00.000Z", assignedShop: "Galle Fort Spice Shop", retailerCity: "Galle" },
  ];

  const journey = toPublicVerificationDto(result).journey;
  const serialized = JSON.stringify(journey);

  assert.equal(serialized.includes("Wrong Shop"), false);
  assert.deepEqual(
    journey.map((event) => event.detail),
    ["Sent to Galle Fort Spice Shop, Galle.", "Sold at Galle Fort Spice Shop, Galle."],
  );
});

test("an active recall is shown to customers with its public message only", () => {
  const result = sample();
  result.batch.recall = {
    active: true,
    publicMessage: "Possible moisture damage. Please return for a refund.",
    reason: "Internal: warehouse leak bay 4",
    recalledAt: "2026-10-01T00:00:00.000Z",
  };

  const dto = toPublicVerificationDto(result);

  assert.deepEqual(dto.recall, {
    active: true,
    message: "Possible moisture damage. Please return for a refund.",
    date: "2026-10-01T00:00:00.000Z",
  });
  assert.equal(JSON.stringify(dto).includes("warehouse leak"), false);

  result.batch.recall.active = false;
  assert.equal(toPublicVerificationDto(result).recall, null);
});

test("after a sale only later checks count towards unusual activity", () => {
  const result = sample();
  result.env = { PUBLIC_VERIFICATION_ALERT_THRESHOLD: "5" };
  result.unit.verificationCount = 30;
  result.unit.verificationCountAtSale = 27;
  assert.equal(toPublicVerificationDto(result).scanHistory.unusualActivity, false);

  result.unit.verificationCountAtSale = 20;
  assert.equal(toPublicVerificationDto(result).scanHistory.unusualActivity, true);
});

test("only steps proved on chain are marked verified for customers", () => {
  const result = sample("VERIFIED");
  result.blockchain.reason = undefined;
  result.batch.producedOn = "2026-09-15T00:00:00.000Z";
  result.unit.history = [
    { status: "Queued", timestamp: "2026-09-15T01:00:00.000Z", assignedShop: "Unassigned" },
    { status: "Stored", timestamp: "2026-09-16T01:00:00.000Z", assignedShop: "Warehouse" },
    { status: "Assigned", timestamp: "2026-09-17T01:00:00.000Z", assignedShop: "Galle Fort Spice Shop" },
  ];
  result.movementSteps = new Map([
    [0, "verified"],
    [1, "verified"],
    [2, "pending"],
  ]);

  const journey = toPublicVerificationDto(result).journey;
  const verified = Object.fromEntries(journey.map((step) => [step.stage, step.verified === true]));

  assert.deepEqual(verified, { Packed: true, Stored: true, Dispatched: false });
});

test("a tampered journey step switches the page to needs attention", () => {
  const result = sample("VERIFIED");
  result.blockchain.reason = undefined;
  result.unit.history = [
    { status: "Assigned", timestamp: "2026-09-17T01:00:00.000Z", assignedShop: "Shop" },
  ];
  result.movementSteps = new Map([[0, "tampered"]]);

  const dto = toPublicVerificationDto(result);

  assert.equal(dto.verification.state, "attention");
  assert.equal(dto.journey[0].verified, undefined);
});
