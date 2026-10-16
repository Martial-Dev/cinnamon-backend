const express = require("express");
const router = express.Router();
const supplierController = require("../controllers/supplierController");
const checkAuth = require("../middleware/check-auth");
const requireAdmin = require("../middleware/require-admin");

// Public routes
router.post("/", supplierController.createSupplier);
router.get("/", checkAuth, requireAdmin, supplierController.getSuppliers);
router.get(
  "/country/:country",
  checkAuth,
  requireAdmin,
  supplierController.getSupplierByCountry,
);
router.get("/:id", checkAuth, requireAdmin, supplierController.getSupplierById);

// Protected routes - require authentication
router.put("/:id", checkAuth, requireAdmin, supplierController.updateSupplier);
router.delete(
  "/:id",
  checkAuth,
  requireAdmin,
  supplierController.deleteSupplier,
);

// Verify supplier (admin only - in production, add role check)
router.post(
  "/:supplierId/verify",
  checkAuth,
  requireAdmin,
  supplierController.verifySupplier,
);

// Add product to supplier
router.post(
  "/:supplierId/products",
  checkAuth,
  requireAdmin,
  supplierController.addProductToSupplier,
);

// Add review to supplier
router.post(
  "/:supplierId/reviews",
  checkAuth,
  requireAdmin,
  supplierController.addReview,
);

module.exports = router;
