const express = require("express");
const router = express.Router();
const paymentController = require("../controllers/paymentController");

router.post("/", paymentController.recordPayment);
router.get("/tracking/:poId", paymentController.getPaymentTracking);
router.get("/", paymentController.getAllPayments);
router.get("/:id", paymentController.getPaymentById);

module.exports = router;
