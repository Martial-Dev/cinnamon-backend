const assert = require("node:assert/strict");
const express = require("express");
const jwt = require("jsonwebtoken");
const test = require("node:test");
const batchRoutes = require("../routes/batches");
const hashRoutes = require("../routes/hash");
const supplierRoutes = require("../routes/supplier");

const withServer = async (callback) => {
  process.env.JWT_SECRET = "route-authorization-test-secret";
  const app = express();
  app.use("/api/batches", batchRoutes);
  app.use("/api/hash", hashRoutes);
  app.use("/api/suppliers", supplierRoutes);
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const address = server.address();
  try {
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
};

const tokenFor = (role) =>
  jwt.sign({ userId: "test-user", role }, process.env.JWT_SECRET);

test("admin blockchain dashboard rejects unauthenticated and non-admin access", async () => {
  await withServer(async (baseUrl) => {
    const url = `${baseUrl}/api/batches/admin/blockchain`;
    const unauthenticated = await fetch(url);
    assert.equal(unauthenticated.status, 401);

    const userRequest = await fetch(url, {
      headers: { Authorization: `Bearer ${tokenFor("user")}` },
    });
    assert.equal(userRequest.status, 403);
  });
});

test("legacy hash proofs and supplier details require administrator access", async () => {
  await withServer(async (baseUrl) => {
    const requests = [
      `${baseUrl}/api/hash/proof/PO/000000000000000000000000`,
      `${baseUrl}/api/suppliers/000000000000000000000000`,
    ];
    for (const url of requests) {
      const response = await fetch(url);
      assert.equal(response.status, 401);
    }
  });
});
