const express = require("express");
const router = express.Router();
const paymentController = require("../controllers/paymentController");
const checkAuth = require("../middleware/check-auth");
const requireAdmin = require("../middleware/require-admin");

// Supplier (purchase-order) payments are internal finance records.
router.use(checkAuth, requireAdmin);

router.post("/", paymentController.recordPayment);
router.get("/tracking/:poId", paymentController.getPaymentTracking);
router.get("/", paymentController.getAllPayments);
router.get("/:id", paymentController.getPaymentById);

module.exports = router;
