const express = require("express");
const router = express.Router();
const Order = require("../models/Oder");

// Optional: Verify webhook source IPs (placeholder)
const verifyPayableWebhook = (req, res, next) => {
  const clientIP =
    req.ip || req.headers["x-forwarded-for"] || req.connection?.remoteAddress;
  console.log("Webhook request from IP:", clientIP);
  // TODO: Restrict to Payable IPs in production
  next();
};

// Webhook endpoint - Called by Payable when payment completes
router.post("/payment-notify", verifyPayableWebhook, async (req, res) => {
  try {
    console.log("=== Payable Webhook Received ===");
    console.log("Timestamp:", new Date().toISOString());
    console.log("Headers:", JSON.stringify(req.headers, null, 2));
    console.log("Payload:", JSON.stringify(req.body, null, 2));

    const {
      payableTransactionId,
      paymentMethod,
      payableOrderId,
      statusMessage,
      paymentType,
      paymentScheme,
      txType,
    } = req.body || {};

    if (!payableTransactionId || !statusMessage) {
      console.error("Missing required fields in webhook");
      return res
        .status(200)
        .json({ success: false, message: "Missing required fields" });
    }

    if (statusMessage !== "SUCCESS") {
      console.log("Payment not successful, status:", statusMessage);
      return res
        .status(200)
        .json({
          success: true,
          message: "Payment not successful",
          processed: false,
        });
    }

    const existingOrder = await Order.findOne({ payableTransactionId });

    if (existingOrder && existingOrder.paymentStatus === "Paid") {
      console.log("Transaction already processed:", payableTransactionId);
      return res
        .status(200)
        .json({
          success: true,
          message: "Transaction already processed",
          orderId: existingOrder._id,
        });
    }

    if (existingOrder) {
      existingOrder.paymentStatus = "Paid";
      existingOrder.payableTransactionId = payableTransactionId;
      existingOrder.payableOrderId = payableOrderId;
      existingOrder.paymentScheme = paymentScheme;
      existingOrder.paymentType = paymentType;
      existingOrder.transactionType = txType;
      existingOrder.paymentConfirmedAt = new Date();
      existingOrder.updatedAt = new Date();

      await existingOrder.save();
      console.log("Order payment confirmed:", existingOrder._id);

      return res
        .status(200)
        .json({
          success: true,
          message: "Payment confirmed",
          orderId: existingOrder._id,
        });
    }

    console.log("Payment confirmed but order not created yet");
    console.log("Transaction will be linked when order is created");

    return res.status(200).json({
      success: true,
      message: "Webhook received, waiting for order creation",
      payableTransactionId: payableTransactionId,
    });
  } catch (error) {
    console.error("=== Webhook Processing Error ===");
    console.error("Error:", error);
    console.error("Stack:", error.stack);
    return res
      .status(200)
      .json({
        success: false,
        message: "Webhook received but processing failed",
        error: error.message,
      });
  }
});

module.exports = router;
