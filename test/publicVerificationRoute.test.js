const assert = require("node:assert/strict");
const express = require("express");
const test = require("node:test");
const {
  createPublicVerificationRouter,
} = require("../routes/public-verification");

const withServer = async (service, callback, configure = () => {}) => {
  const app = express();
  configure(app);
  app.use("/api/public/verify", createPublicVerificationRouter(service));
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const address = server.address();
  try {
    return await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
};

test("valid token returns only the single-unit DTO from the public service", async () => {
  const service = {
    getPublicVerification: async (token) =>
      token === "a".repeat(64)
        ? { recordFound: true, product: { name: "Ceylon Cinnamon" } }
        : null,
  };

  await withServer(service, async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/api/public/verify/${"a".repeat(64)}`,
    );
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(body, {
      recordFound: true,
      product: { name: "Ceylon Cinnamon" },
    });
  });
});

test("invalid token returns a generic 404 without exposing database errors", async () => {
  const service = { getPublicVerification: async () => null };

  await withServer(service, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/public/verify/not-a-token`);
    const body = await response.json();
    assert.equal(response.status, 404);
    assert.equal(body.code, "NOT_FOUND");
    assert.equal(JSON.stringify(body).includes("ObjectId"), false);
  });
});

test("unexpected public errors return a generic message", async () => {
  const service = {
    getPublicVerification: async () => {
      throw new Error("Mongo ObjectId details");
    },
  };

  await withServer(service, async (baseUrl) => {
    const response = await fetch(
      `${baseUrl}/api/public/verify/${"b".repeat(64)}`,
    );
    const body = await response.json();
    assert.equal(response.status, 500);
    assert.equal(body.message.includes("Mongo"), false);
  });
});

test("public verification is rate-limited", async () => {
  const service = {
    getPublicVerification: async () => ({ recordFound: true }),
  };

  await withServer(service, async (baseUrl) => {
    let lastResponse;
    for (let request = 0; request < 31; request += 1) {
      lastResponse = await fetch(
        `${baseUrl}/api/public/verify/${"c".repeat(64)}`,
      );
      await lastResponse.arrayBuffer();
    }
    assert.equal(lastResponse.status, 429);
  });
});

test("behind a trusted proxy each customer gets a separate rate-limit bucket", async () => {
  const service = {
    getPublicVerification: async () => ({ recordFound: true }),
  };

  await withServer(
    service,
    async (baseUrl) => {
      const url = `${baseUrl}/api/public/verify/${"d".repeat(64)}`;
      for (let request = 0; request < 30; request += 1) {
        const response = await fetch(url, {
          headers: { "X-Forwarded-For": "203.0.113.1" },
        });
        await response.arrayBuffer();
      }
      const otherCustomer = await fetch(url, {
        headers: { "X-Forwarded-For": "203.0.113.2" },
      });
      await otherCustomer.arrayBuffer();
      assert.equal(otherCustomer.status, 200);
    },
    (app) => app.set("trust proxy", 1),
  );
});
