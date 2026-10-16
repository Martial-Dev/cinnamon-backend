const express = require("express");
const checkAuth = require("../middleware/check-auth");
const requireAdmin = require("../middleware/require-admin");
const batchController = require("../controllers/batchController");

const router = express.Router();

router.get(
  "/admin/blockchain",
  checkAuth,
  requireAdmin,
  batchController.getBlockchainDashboard,
);
router.get(
  "/admin/blockchain/:batchId",
  checkAuth,
  requireAdmin,
  batchController.getBatchVerification,
);
router.get("/units/resolve", checkAuth, requireAdmin, batchController.resolveUnit);
router.get("/:batchId/units", checkAuth, requireAdmin, batchController.listUnits);
router.get(
  "/admin/anchoring",
  checkAuth,
  requireAdmin,
  batchController.getAnchoringStatus,
);
router.post(
  "/admin/anchoring/run",
  checkAuth,
  requireAdmin,
  batchController.runAnchoring,
);
router.post(
  "/admin/anchoring/retry",
  checkAuth,
  requireAdmin,
  batchController.retryFailedAnchoring,
);
router.get(
  "/admin/trace/:batchId",
  checkAuth,
  requireAdmin,
  batchController.getTrace,
);
router.get(
  "/available-cinnamon-sources",
  checkAuth,
  requireAdmin,
  batchController.listAvailableCinnamonSources,
);
router.get("/", checkAuth, requireAdmin, batchController.listBatches);
router.post("/", checkAuth, requireAdmin, batchController.createBatch);
router.post("/scan", checkAuth, requireAdmin, batchController.scanUnit);
router.post(
  "/scan/bulk",
  checkAuth,
  requireAdmin,
  batchController.recordUnitsStage,
);
router.post(
  "/:batchId/stage",
  checkAuth,
  requireAdmin,
  batchController.recordBatchStage,
);
router.get("/events", checkAuth, requireAdmin, batchController.listEvents);

router.post(
  "/:batchId/units/:unitNumber/movements/:index/void",
  checkAuth,
  requireAdmin,
  batchController.voidMovement,
);
router.post("/:batchId/recall", checkAuth, requireAdmin, batchController.setRecall);
router.delete(
  "/:batchId/recall",
  checkAuth,
  requireAdmin,
  batchController.liftRecall,
);

module.exports = router;
