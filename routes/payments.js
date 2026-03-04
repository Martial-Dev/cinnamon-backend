const express = require("express");
const axios = require("axios");
const crypto = require("crypto");

const router = express.Router();

const toSha512Upper = (value) =>
  crypto
    .createHash("sha512")
    .update(String(value || ""), "utf8")
    .digest("hex")
    .toUpperCase();

const ensureTrailingSlashRemoved = (url) =>
  String(url || "").replace(/\/+$/, "");

const isPlaceholderValue = (value) => {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  return (
    !normalized ||
    normalized.includes("your_") ||
    normalized.includes("placeholder") ||
    normalized.includes("change_me")
  );
};

const parseBoolean = (value, fallbackValue = false) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", "off"].includes(normalized)) {
      return false;
    }
  }

  return fallbackValue;
};

const isHttpsUrl = (value) => /^https:\/\//i.test(String(value || "").trim());

const getPayableConfig = (testModeInput) => {
  const defaultTestMode = parseBoolean(
    process.env.PAYABLE_DEFAULT_TEST_MODE,
    process.env.NODE_ENV !== "production",
  );
  const testMode = parseBoolean(testModeInput, defaultTestMode);

  const merchantKey = testMode
    ? process.env.PAYABLE_MERCHANT_KEY_TEST || process.env.PAYABLE_MERCHANT_KEY
    : process.env.PAYABLE_MERCHANT_KEY_LIVE || process.env.PAYABLE_MERCHANT_KEY;

  const merchantToken = testMode
    ? process.env.PAYABLE_MERCHANT_TOKEN_TEST ||
      process.env.PAYABLE_MERCHANT_TOKEN
    : process.env.PAYABLE_MERCHANT_TOKEN_LIVE ||
      process.env.PAYABLE_MERCHANT_TOKEN;

  const apiBaseRaw = testMode
    ? process.env.PAYABLE_TEST_API_BASE || process.env.PAYABLE_API_BASE
    : process.env.PAYABLE_LIVE_API_BASE || process.env.PAYABLE_API_BASE;

  const apiBase = ensureTrailingSlashRemoved(apiBaseRaw);

  if (!merchantKey || !merchantToken || !apiBase) {
    return {
      valid: false,
      error:
        "Missing Payable configuration. Set PAYABLE_* merchant keys/tokens and PAYABLE_TEST_API_BASE or PAYABLE_LIVE_API_BASE (or PAYABLE_API_BASE fallback).",
    };
  }

  if (isPlaceholderValue(merchantKey) || isPlaceholderValue(merchantToken)) {
    return {
      valid: false,
      error: testMode
        ? "Payable TEST credentials are placeholders. Set PAYABLE_MERCHANT_KEY_TEST and PAYABLE_MERCHANT_TOKEN_TEST."
        : "Payable LIVE credentials are placeholders. Set PAYABLE_MERCHANT_KEY_LIVE and PAYABLE_MERCHANT_TOKEN_LIVE.",
    };
  }

  return {
    valid: true,
    testMode,
    merchantKey,
    merchantToken,
    apiBase,
  };
};

const getCheckValue = ({
  merchantKey,
  merchantToken,
  invoiceId,
  amount,
  currencyCode,
}) => {
  const hashedToken = toSha512Upper(merchantToken);
  const raw = `${merchantKey}|${invoiceId}|${amount}|${currencyCode}|${hashedToken}`;
  return toSha512Upper(raw);
};

router.post("/initiate", async (req, res) => {
  try {
    const config = getPayableConfig(req.body?.testMode);
    if (!config.valid) {
      return res.status(500).json({ error: { "err-message": config.error } });
    }

    const {
      invoiceId,
      integrationType,
      integrationVersion,
      refererUrl,
      logoUrl,
      webhookUrl,
      returnUrl,
      amount,
      currencyCode,
      orderDescription,
      customerFirstName,
      customerLastName,
      customerEmail,
      customerMobilePhone,
      paymentType,
      billingAddressStreet,
      billingAddressCity,
      billingAddressCountry,
      billingAddressPostcodeZip,
      billingAddressStateProvince,
      shippingContactFirstName,
      shippingContactLastName,
      shippingContactEmail,
      shippingContactMobilePhone,
      shippingAddressStreet,
      shippingAddressCity,
      shippingAddressCountry,
      shippingAddressPostcodeZip,
      shippingAddressStateProvince,
    } = req.body || {};

    if (
      !invoiceId ||
      !amount ||
      !orderDescription ||
      !customerFirstName ||
      !customerLastName ||
      !customerEmail ||
      !customerMobilePhone ||
      !billingAddressStreet ||
      !billingAddressCity ||
      !billingAddressCountry ||
      !billingAddressPostcodeZip
    ) {
      return res.status(400).json({
        status: 400,
        error: {
          "err-message": "Missing required fields for payment initiation.",
        },
      });
    }

    const finalCurrencyCode =
      currencyCode || process.env.PAYABLE_CURRENCY || "LKR";
    const finalAmount = Number(amount).toFixed(2);

    const safeWebhookUrl = isHttpsUrl(webhookUrl)
      ? webhookUrl
      : process.env.PAYMENT_WEBHOOK_URL || "";
    const safeReturnUrl = isHttpsUrl(returnUrl)
      ? returnUrl
      : process.env.PAYMENT_RETURN_URL || "";
    const safeRefererUrl = isHttpsUrl(process.env.CLIENT_URL)
      ? process.env.CLIENT_URL
      : isHttpsUrl(refererUrl)
        ? refererUrl
        : "";

    const requestBody = {
      invoiceId,
      merchantKey: config.merchantKey,
      // merchantToken must NEVER be sent to Payable
      integrationType:
        integrationType || process.env.PAYABLE_INTEGRATION_TYPE || "WEB",
      integrationVersion:
        integrationVersion ||
        process.env.PAYABLE_INTEGRATION_VERSION ||
        "1.0.1",
      refererUrl: safeRefererUrl,
      logoUrl: logoUrl || undefined,
      webhookUrl: safeWebhookUrl,
      returnUrl: safeReturnUrl,
      amount: finalAmount,
      currencyCode: finalCurrencyCode,
      orderDescription,
      customerFirstName,
      customerLastName,
      customerEmail,
      customerMobilePhone,
      paymentType: paymentType || 1,
      checkValue: getCheckValue({
        merchantKey: config.merchantKey,
        merchantToken: config.merchantToken,
        invoiceId,
        amount: finalAmount,
        currencyCode: finalCurrencyCode,
      }),
      billingAddressStreet,
      billingAddressCity,
      billingAddressCountry,
      billingAddressPostcodeZip,
      billingAddressStateProvince: billingAddressStateProvince || undefined,
      shippingContactFirstName: shippingContactFirstName || undefined,
      shippingContactLastName: shippingContactLastName || undefined,
      shippingContactEmail: shippingContactEmail || undefined,
      shippingContactMobilePhone: shippingContactMobilePhone || undefined,
      shippingAddressStreet: shippingAddressStreet || undefined,
      shippingAddressCity: shippingAddressCity || undefined,
      shippingAddressCountry: shippingAddressCountry || undefined,
      shippingAddressPostcodeZip: shippingAddressPostcodeZip || undefined,
      shippingAddressStateProvince: shippingAddressStateProvince || undefined,
    };

    // hard safety: strip forbidden field even if added elsewhere
    delete requestBody.merchantToken;

    const response = await axios.post(`${config.apiBase}/`, requestBody, {
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 20000,
    });

    return res.status(200).json(response.data);
  } catch (error) {
    const payableStatus = error?.response?.status || 500;
    const payableData = error?.response?.data;

    if (payableData) {
      return res.status(payableStatus).json(payableData);
    }

    return res.status(500).json({
      status: 500,
      error: {
        "err-message": "Failed to initiate payment",
      },
    });
  }
});

router.get("/status", async (req, res) => {
  try {
    const config = getPayableConfig(req.query.testMode);
    if (!config.valid) {
      return res.status(500).json({ error: { "err-message": config.error } });
    }

    const uid = req.query.uid;
    const statusIndicator = req.query.statusIndicator;

    if (!uid || !statusIndicator) {
      return res.status(400).json({
        status: 400,
        error: { "err-message": "uid and statusIndicator are required" },
      });
    }

    const response = await axios.get(`${config.apiBase}/status`, {
      params: {
        uid,
        statusIndicator,
      },
      timeout: 20000,
    });

    return res.status(200).json(response.data);
  } catch (error) {
    const payableStatus = error?.response?.status || 500;
    const payableData = error?.response?.data;

    if (payableData) {
      return res.status(payableStatus).json(payableData);
    }

    return res.status(500).json({
      status: 500,
      error: {
        "err-message": "Failed to check payment status",
      },
    });
  }
});

module.exports = router;
