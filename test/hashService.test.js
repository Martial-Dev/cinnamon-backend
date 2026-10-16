const assert = require("node:assert/strict");
const test = require("node:test");
const hashService = require("../services/hashService");

test("purchase-order proof creation refuses to manufacture mock transactions", async () => {
  await assert.rejects(
    hashService.recordOnBlockchain(
      "PO",
      "000000000000000000000000",
      "example-hash",
    ),
    (error) =>
      error.statusCode === 503 && error.code === "PO_BLOCKCHAIN_NOT_CONFIGURED",
  );
});

test("purchase-order hash comparison is explicitly not an on-chain verification", async () => {
  const result = await hashService.verifyHash(
    "PO",
    "000000000000000000000000",
    "example-hash",
  );

  assert.equal(result.verificationStatus, "NOT_CONFIGURED");
  assert.equal(result.verified, false);
});
