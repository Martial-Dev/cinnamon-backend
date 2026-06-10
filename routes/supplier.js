const express = require("express");
const router = express.Router();
const supplierController = require("../controllers/supplierController");
const checkAuth = require("../middleware/check-auth");

// Public routes
router.get("/", supplierController.getSuppliers);
router.get("/country/:country", supplierController.getSupplierByCountry);
router.get("/:id", supplierController.getSupplierById);

// Protected routes - require authentication
router.post("/", checkAuth, supplierController.createSupplier);
router.put("/:id", checkAuth, supplierController.updateSupplier);
router.delete("/:id", checkAuth, supplierController.deleteSupplier);

// Verify supplier (admin only - in production, add role check)
router.post(
  "/:supplierId/verify",
  checkAuth,
  supplierController.verifySupplier,
);

// Add product to supplier
router.post(
  "/:supplierId/products",
  checkAuth,
  supplierController.addProductToSupplier,
);

// Add review to supplier
router.post("/:supplierId/reviews", checkAuth, supplierController.addReview);

module.exports = router;
