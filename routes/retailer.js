const express = require("express");
const router = express.Router();
const checkAuth = require("../middleware/check-auth");
const retailerController = require("../controllers/retailerController");

// Public onboarding route.
router.post("/", retailerController.createRetailer);

// Protected admin/ops routes.
router.get("/", checkAuth, retailerController.getRetailers);
router.get("/:id", checkAuth, retailerController.getRetailerById);
router.put("/:id", checkAuth, retailerController.updateRetailer);
router.put("/:id/verify", checkAuth, retailerController.verifyRetailer);
router.delete("/:id", checkAuth, retailerController.deleteRetailer);

module.exports = router;
