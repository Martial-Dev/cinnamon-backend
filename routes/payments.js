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

const sanitizeText = (value) =>
  String(value || "")
    .replace(/[\x00-\x1F\x7F]+/g, " ")
    .replace(/[\u2028\u2029]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const sanitizeOrderDescription = (value) =>
  sanitizeText(value).substring(0, 100);

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

const getSdkScriptUrl = (testMode) =>
  testMode
    ? "https://sandboxipgsdk.payable.lk/sdk/v4/payable-checkout.js"
    : "https://ipgsdk.payable.lk/sdk/v4/payable-checkout.js";

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

router.post("/sdk-config", async (req, res) => {
  try {
    const config = getPayableConfig(req.body?.testMode);
    if (!config.valid) {
      return res.status(500).json({ error: { "err-message": config.error } });
    }

    const {
      invoiceId,
      logoUrl,
      notifyUrl,
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
      custom1,
      custom2,
    } = req.body || {};

    const safeOrderDescription = sanitizeOrderDescription(orderDescription);

    if (
      !invoiceId ||
      !amount ||
      !safeOrderDescription ||
      !customerFirstName ||
      !customerLastName ||
      !customerEmail ||
      !customerMobilePhone ||
      !billingAddressStreet ||
      !billingAddressCity ||
      !billingAddressCountry
    ) {
      return res.status(400).json({
        status: 400,
        error: {
          "err-message":
            "Missing required fields for SDK payment configuration.",
        },
      });
    }

    const finalCurrencyCode =
      currencyCode || process.env.PAYABLE_CURRENCY || "LKR";
    const finalAmount = Number(amount).toFixed(2);

    const safeNotifyUrl = isHttpsUrl(notifyUrl)
      ? notifyUrl
      : isHttpsUrl(webhookUrl)
        ? webhookUrl
        : process.env.PAYMENT_WEBHOOK_URL || "";
    const safeReturnUrl = isHttpsUrl(returnUrl)
      ? returnUrl
      : process.env.PAYMENT_RETURN_URL || "";

    // Build payment object with only defined values per SDK spec
    const payment = {
      notifyUrl: safeNotifyUrl,
      returnUrl: safeReturnUrl,
      merchantKey: config.merchantKey,
      checkValue: getCheckValue({
        merchantKey: config.merchantKey,
        merchantToken: config.merchantToken,
        invoiceId,
        amount: finalAmount,
        currencyCode: finalCurrencyCode,
      }),
      invoiceId,
      orderDescription,
      amount: finalAmount,
      currencyCode: finalCurrencyCode,
      paymentType: String(paymentType || 1),
      customerFirstName,
      customerLastName,
      customerMobilePhone,
      customerEmail,
      billingAddressStreet,
      billingAddressCity,
      billingAddressCountry,
    };

    // Add optional fields only if provided
    if (logoUrl) payment.logoUrl = logoUrl;
    if (custom1) payment.custom1 = custom1;
    if (custom2) payment.custom2 = custom2;
    if (billingAddressPostcodeZip)
      payment.billingAddressPostcodeZip = billingAddressPostcodeZip;
    if (billingAddressStateProvince)
      payment.billingAddressStateProvince = billingAddressStateProvince;
    if (shippingContactFirstName)
      payment.shippingContactFirstName = shippingContactFirstName;
    if (shippingContactLastName)
      payment.shippingContactLastName = shippingContactLastName;
    if (shippingContactEmail)
      payment.shippingContactEmail = shippingContactEmail;
    if (shippingContactMobilePhone)
      payment.shippingContactMobilePhone = shippingContactMobilePhone;
    if (shippingAddressStreet)
      payment.shippingAddressStreet = shippingAddressStreet;
    if (shippingAddressCity) payment.shippingAddressCity = shippingAddressCity;
    if (shippingAddressCountry)
      payment.shippingAddressCountry = shippingAddressCountry;
    if (shippingAddressPostcodeZip)
      payment.shippingAddressPostcodeZip = shippingAddressPostcodeZip;
    if (shippingAddressStateProvince)
      payment.shippingAddressStateProvince = shippingAddressStateProvince;

    return res.status(200).json({
      sdkUrl: getSdkScriptUrl(config.testMode),
      payment,
      testMode: config.testMode,
    });
  } catch (error) {
    return res.status(500).json({
      status: 500,
      error: {
        "err-message": "Failed to prepare SDK payment configuration",
      },
    });
  }
});

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
      customerPhone,
      paymentType,
      billingAddressStreet,
      billingAddressStreet2,
      billingAddressCity,
      billingAddressCountry,
      billingAddressPostcodeZip,
      billingAddressStateProvince,
      billingCompanyName,
      shippingContactFirstName,
      shippingContactLastName,
      shippingContactEmail,
      shippingContactMobilePhone,
      shippingContactPhone,
      shippingAddressStreet,
      shippingAddressStreet2,
      shippingAddressCity,
      shippingAddressCountry,
      shippingAddressPostcodeZip,
      shippingAddressStateProvince,
      shippingCompanyName,
      custom1,
      custom2,
    } = req.body || {};

    const safeOrderDescription = sanitizeOrderDescription(orderDescription);

    if (
      !invoiceId ||
      !amount ||
      !safeOrderDescription ||
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
      // merchantToken: config.merchantToken, // removed: Payable rejects this field
      integrationType:
        integrationType || process.env.PAYABLE_INTEGRATION_TYPE || "WEB",
      integrationVersion:
        integrationVersion ||
        process.env.PAYABLE_INTEGRATION_VERSION ||
        "1.0.1",
      refererUrl: refererUrl || process.env.CLIENT_URL || "",
      webhookUrl: webhookUrl || process.env.PAYMENT_WEBHOOK_URL || "",
      returnUrl: returnUrl || process.env.PAYMENT_RETURN_URL || "",
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
        merchantToken: config.merchantToken, // keep here for signature generation
        invoiceId,
        amount: finalAmount,
        currencyCode: finalCurrencyCode,
      }),
      billingAddressStreet,
      billingAddressCity,
      billingAddressCountry,
      billingAddressPostcodeZip,
      billingAddressStateProvince: billingAddressStateProvince || undefined,
    };

    // Add optional fields only if provided per SDK spec
    if (logoUrl) requestBody.logoUrl = logoUrl;
    if (custom1) requestBody.custom1 = custom1;
    if (custom2) requestBody.custom2 = custom2;
    if (customerPhone) requestBody.customerPhone = customerPhone;
    if (billingAddressStreet2)
      requestBody.billingAddressStreet2 = billingAddressStreet2;
    if (billingCompanyName) requestBody.billingCompanyName = billingCompanyName;
    if (shippingContactFirstName)
      requestBody.shippingContactFirstName = shippingContactFirstName;
    if (shippingContactLastName)
      requestBody.shippingContactLastName = shippingContactLastName;
    if (shippingContactEmail)
      requestBody.shippingContactEmail = shippingContactEmail;
    if (shippingContactMobilePhone)
      requestBody.shippingContactMobilePhone = shippingContactMobilePhone;
    if (shippingContactPhone)
      requestBody.shippingContactPhone = shippingContactPhone;
    if (shippingCompanyName)
      requestBody.shippingCompanyName = shippingCompanyName;
    if (shippingAddressStreet)
      requestBody.shippingAddressStreet = shippingAddressStreet;
    if (shippingAddressStreet2)
      requestBody.shippingAddressStreet2 = shippingAddressStreet2;
    if (shippingAddressCity)
      requestBody.shippingAddressCity = shippingAddressCity;
    if (shippingAddressCountry)
      requestBody.shippingAddressCountry = shippingAddressCountry;
    if (shippingAddressPostcodeZip)
      requestBody.shippingAddressPostcodeZip = shippingAddressPostcodeZip;
    if (shippingAddressStateProvince)
      requestBody.shippingAddressStateProvince = shippingAddressStateProvince;

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

// Webhook endpoint to receive payment notifications from Payable
router.post("/webhook", async (req, res) => {
  try {
    const {
      merchantKey,
      payableOrderId,
      payableTransactionId,
      payableAmount,
      payableCurrency,
      invoiceNo,
      statusCode,
      statusMessage,
      checkValue,
    } = req.body || {};

    // Validate required fields in notification
    if (!merchantKey || !payableOrderId || !statusCode || !checkValue) {
      return res.status(400).json({
        status: 400,
        error: "Missing required fields in payment notification",
      });
    }

    // Get config for verification
    const config = getPayableConfig();
    if (!config.valid) {
      return res.status(500).json({
        status: 500,
        error: "Server configuration error",
      });
    }

    // Verify merchantKey matches
    if (merchantKey !== config.merchantKey) {
      return res.status(403).json({
        status: 403,
        error: "Invalid merchant key",
      });
    }

    // Verify checkValue per SDK spec:
    // UPPERCASE(SHA512[<merchantKey>|<payableOrderId>|<payableTransactionId>|<payableAmount>|<payableCurrency>|<invoiceId>|<statusCode>|UPPERCASE(SHA512[<MerchantToken>])])
    const expectedCheckValue = toSha512Upper(
      `${merchantKey}|${payableOrderId}|${payableTransactionId}|${payableAmount}|${payableCurrency}|${invoiceNo}|${statusCode}|${toSha512Upper(config.merchantToken)}`,
    );

    if (checkValue !== expectedCheckValue) {
      return res.status(403).json({
        status: 403,
        error:
          "Invalid checkValue - notification signature verification failed",
      });
    }

    // Log successful notification
    console.log(
      `[Payable Webhook] Invoice: ${invoiceNo}, Status: ${statusCode} (${statusMessage}), Amount: ${payableAmount} ${payableCurrency}`,
    );

    // TODO: Update your database here with payment status
    // Examples:
    // - if (statusCode === 1) update invoice as PAID
    // - if (statusCode === 2) update invoice as FAILED
    // - if (statusCode === 7) update invoice as REFUNDED

    // Send success response to Payable per SDK spec
    return res.status(200).json({ Status: 200 });
  } catch (error) {
    console.error("Error processing payment webhook:", error);
    return res.status(500).json({
      status: 500,
      error: "Failed to process payment notification",
    });
  }
});

module.exports = router;
