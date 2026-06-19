const express = require("express");
const router = express.Router();
const poController = require("../controllers/poController");

router.post("/", poController.createPO);
router.get("/", poController.getAllPOs);
router.get("/:id", poController.getPOById);
router.put("/:id", poController.updatePO);
router.put("/:id/send", poController.sendPO);
router.put("/:id/status", poController.updateOrderStatus);
router.delete("/:id", poController.deletePO);
router.get("/supplier/:supplierId", poController.getSupplierPOs);

module.exports = router;
