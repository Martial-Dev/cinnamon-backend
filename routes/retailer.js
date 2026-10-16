const express = require("express");
const router = express.Router();
const checkAuth = require("../middleware/check-auth");
const requireAdmin = require("../middleware/require-admin");
const retailerController = require("../controllers/retailerController");

// Public onboarding route.
router.post("/", retailerController.createRetailer);

// Protected admin/ops routes.
router.get("/", checkAuth, requireAdmin, retailerController.getRetailers);
router.get("/:id", checkAuth, requireAdmin, retailerController.getRetailerById);
router.put("/:id", checkAuth, requireAdmin, retailerController.updateRetailer);
router.put(
  "/:id/verify",
  checkAuth,
  requireAdmin,
  retailerController.verifyRetailer,
);
router.delete("/:id", checkAuth, requireAdmin, retailerController.deleteRetailer);

module.exports = router;
