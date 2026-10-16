const assert = require("node:assert/strict");
const express = require("express");
const jwt = require("jsonwebtoken");
const test = require("node:test");
const User = require("../models/User");

process.env.JWT_SECRET = "route-security-test-secret";
// The mailer refuses to load without SMTP settings; no mail is sent here.
Object.assign(process.env, {
  SMTP_HOST: process.env.SMTP_HOST || "smtp.invalid",
  SMTP_PORT: process.env.SMTP_PORT || "587",
  SMTP_USER: process.env.SMTP_USER || "test",
  SMTP_PASS: process.env.SMTP_PASS || "test",
});

const USER_ID = "000000000000000000000001";
const OTHER_ID = "000000000000000000000002";

const tokenFor = (role, userId = USER_ID) =>
  `Bearer ${jwt.sign({ userId, role }, process.env.JWT_SECRET)}`;

const withServer = async (callback) => {
  const app = express();
  app.use(express.json());
  app.use("/api/users", require("../routes/users"));
  app.use("/api/payment", require("../routes/payment"));
  app.use("/api/retailers", require("../routes/retailer"));
  app.use("/api/suppliers", require("../routes/supplier"));
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  try {
    await callback(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
};

const request = (url, { method = "GET", auth, body } = {}) =>
  fetch(url, {
    method,
    headers: {
      ...(auth ? { Authorization: auth } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

test("user accounts cannot be read, edited, or deleted anonymously", async () => {
  await withServer(async (base) => {
    for (const method of ["GET", "PUT", "DELETE"]) {
      const response = await request(`${base}/api/users/${USER_ID}`, { method });
      assert.equal(response.status, 401, method);
    }
    const debug = await request(`${base}/api/users/debug/config`);
    assert.equal(debug.status, 401);
  });
});

test("a customer cannot read or edit another customer's account", async () => {
  await withServer(async (base) => {
    const read = await request(`${base}/api/users/${OTHER_ID}`, {
      auth: tokenFor("user"),
    });
    const edit = await request(`${base}/api/users/${OTHER_ID}`, {
      method: "PUT",
      auth: tokenFor("user"),
      body: { firstName: "x" },
    });
    const remove = await request(`${base}/api/users/${USER_ID}`, {
      method: "DELETE",
      auth: tokenFor("user"),
    });
    assert.equal(read.status, 403);
    assert.equal(edit.status, 403);
    assert.equal(remove.status, 403);
  });
});

test("editing your own account ignores role and password", async () => {
  const original = User.findByIdAndUpdate;
  let applied;
  User.findByIdAndUpdate = (_id, updates) => {
    applied = updates;
    return { select: async () => ({ _id: USER_ID, ...updates }) };
  };
  try {
    await withServer(async (base) => {
      const response = await request(`${base}/api/users/${USER_ID}`, {
        method: "PUT",
        auth: tokenFor("user"),
        body: {
          firstName: "Nimal",
          role: "admin",
          password: "plain",
          _id: OTHER_ID,
        },
      });
      assert.equal(response.status, 200);
      assert.deepEqual(applied, { firstName: "Nimal" });
    });
  } finally {
    User.findByIdAndUpdate = original;
  }
});

test("finance, retailer, and supplier management require an administrator", async () => {
  await withServer(async (base) => {
    const checks = [
      ["GET", "/api/payment"],
      ["POST", "/api/payment"],
      ["GET", `/api/payment/tracking/${USER_ID}`],
      ["GET", "/api/retailers"],
      ["PUT", `/api/retailers/${USER_ID}`],
      ["DELETE", `/api/retailers/${USER_ID}`],
      ["DELETE", `/api/suppliers/${USER_ID}`],
      ["POST", `/api/suppliers/${USER_ID}/products`],
      ["POST", `/api/suppliers/${USER_ID}/reviews`],
    ];
    for (const [method, path] of checks) {
      const anonymous = await request(`${base}${path}`, { method });
      const customer = await request(`${base}${path}`, {
        method,
        auth: tokenFor("user"),
      });
      assert.equal(anonymous.status, 401, `${method} ${path} anonymous`);
      assert.equal(customer.status, 403, `${method} ${path} customer`);
    }
  });
});

test("public supplier applications cannot set status, ratings, or reviews", () => {
  const { pickSupplierApplication } = require("../controllers/supplierController");
  const picked = pickSupplierApplication({
    supplierName: "Farm",
    village: "Kurundugahahetekma",
    status: "active",
    qualityRating: 5,
    reviews: [{ rating: 5 }],
    verification: { status: "VERIFIED" },
    createdBy: "admin",
  });
  assert.deepEqual(picked, {
    supplierName: "Farm",
    village: "Kurundugahahetekma",
  });
});
