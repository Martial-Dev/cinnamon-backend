const express = require("express");
const router = express.Router();
const checkAuth = require("../middleware/check-auth");
const requireAdmin = require("../middleware/require-admin");
const poController = require("../controllers/poController");

router.use(checkAuth, requireAdmin);

router.post("/", poController.createPO);
router.get("/", poController.getAllPOs);
router.get("/supplier/:supplierId", poController.getSupplierPOs);
router.get("/:id", poController.getPOById);
router.put("/:id", poController.updatePO);
router.put("/:id/send", poController.sendPO);
router.put("/:id/status", poController.updateOrderStatus);
router.put("/:id/harvest-dates", poController.updateHarvestDates);
router.put("/:id/provenance", poController.updateHarvestDates);
router.post("/:id/receipts", poController.recordReceipt);
router.delete("/:id", poController.deletePO);

module.exports = router;
