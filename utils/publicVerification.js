const crypto = require("crypto");

const TOKEN_PATTERN = /^[a-f0-9]{64}$/;
const DEFAULT_UNUSUAL_ACTIVITY_THRESHOLD = 25;

// One package is normally checked a handful of times (shop, buyer, a refresh).
// Far more than that suggests the label may have been copied.
const getUnusualActivityThreshold = (env = process.env) => {
  const configured = Number(env.PUBLIC_VERIFICATION_ALERT_THRESHOLD);
  return Number.isInteger(configured) && configured > 0
    ? configured
    : DEFAULT_UNUSUAL_ACTIVITY_THRESHOLD;
};

/**
 * Checks that count towards the unusual-activity warning. Once a unit is sold
 * only checks after the sale count: browsing in-store is expected, but one
 * owner repeatedly checking far more than usual suggests a copied label.
 */
const activityCountOf = (unit) => {
  const total = Number(unit?.verificationCount || 0);
  const atSale = unit?.verificationCountAtSale;
  return atSale === undefined || atSale === null
    ? total
    : Math.max(total - Number(atSale), 0);
};

const hasUnusualActivity = (verificationCount, env = process.env) =>
  Number(verificationCount || 0) > getUnusualActivityThreshold(env);

const getPublicBaseUrl = (env = process.env) => {
  const configured = env.PUBLIC_VERIFICATION_BASE_URL?.trim();
  if (!configured) {
    const error = new Error("Public verification URL is not configured.");
    error.statusCode = 503;
    error.code = "PUBLIC_VERIFICATION_NOT_CONFIGURED";
    throw error;
  }

  let parsed;
  try {
    parsed = new URL(configured);
  } catch {
    const error = new Error("Public verification URL is invalid.");
    error.statusCode = 503;
    error.code = "PUBLIC_VERIFICATION_NOT_CONFIGURED";
    throw error;
  }
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    (env.NODE_ENV === "production" && parsed.protocol !== "https:")
  ) {
    const error = new Error("Public verification URL is invalid.");
    error.statusCode = 503;
    error.code = "PUBLIC_VERIFICATION_NOT_CONFIGURED";
    throw error;
  }
  return parsed.toString().replace(/\/+$/, "");
};

const createVerificationToken = () => crypto.randomBytes(32).toString("hex");

const createVerificationUrl = (token, baseUrl = getPublicBaseUrl()) =>
  `${baseUrl.replace(/\/+$/, "")}/verify/${token}`;

const getVerificationTokenFromValue = (value) => {
  const rawValue = String(value || "").trim();
  if (TOKEN_PATTERN.test(rawValue)) return rawValue;
  try {
    const parsed = new URL(rawValue);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const verifyIndex = parts.indexOf("verify");
    const token = parts[verifyIndex + 1];
    return verifyIndex >= 0 && TOKEN_PATTERN.test(token || "") ? token : null;
  } catch {
    return null;
  }
};

module.exports = {
  TOKEN_PATTERN,
  getPublicBaseUrl,
  getUnusualActivityThreshold,
  hasUnusualActivity,
  activityCountOf,
  createVerificationToken,
  createVerificationUrl,
  getVerificationTokenFromValue,
};
