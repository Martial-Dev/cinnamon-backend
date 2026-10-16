const batchService = require("../services/batchService");
const publicVerificationService = require("../services/publicVerificationService");
const movementAnchorService = require("../services/movementAnchorService");

const sendError = (res, error) =>
  res.status(error.statusCode || 500).json({ message: error.message });

exports.createBatch = async (req, res) => {
  try {
    const batch = await batchService.createBatch(
      req.body,
      req.userData?.userId,
    );
    const data = batch.toObject ? batch.toObject() : batch;
    return res.status(201).json({
      success: true,
      data: {
        ...data,
        unitSummary: {
          total: data.totalUnits,
          byStatus: { Queued: data.totalUnits },
          needsAttention: 0,
          scanned: 0,
        },
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res
        .status(409)
        .json({ message: "Batch ID or unit QR code already exists." });
    }
    return sendError(res, error);
  }
};

exports.listBatches = async (_req, res) => {
  try {
    const batches = await publicVerificationService.listAdminBatches();
    return res.json({ success: true, count: batches.length, data: batches });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.getBlockchainDashboard = async (_req, res) => {
  try {
    const batches =
      await publicVerificationService.getAdminBlockchainDashboard();
    return res.json({ success: true, count: batches.length, data: batches });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.listAvailableCinnamonSources = async (_req, res) => {
  try {
    const sources = await batchService.listAvailablePurchaseSources();
    return res.json({ success: true, count: sources.length, data: sources });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.getTrace = async (req, res) => {
  try {
    const trace = await batchService.getTrace(
      req.params.batchId,
      req.query.unitNumber,
    );
    if (!trace)
      return res.status(404).json({ message: "Batch or unit not found." });
    return res.json({ success: true, data: trace });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.scanUnit = async (req, res) => {
  try {
    const { qrCode, assignedShop, notes, stage, retailerId } = req.body;
    if (!String(qrCode || "").trim()) {
      return res.status(400).json({ message: "A QR code or unit code is required." });
    }

    const result = await batchService.scanUnit(
      qrCode,
      assignedShop,
      notes,
      stage || "Assigned",
      retailerId,
    );
    if (!result) return res.status(404).json({ message: "Batch not found." });
    return res.json({ success: true, data: result });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.recordUnitsStage = async (req, res) => {
  try {
    const { codes, assignedShop, notes, stage, retailerId } = req.body;
    const result = await batchService.recordUnitsStage(
      codes,
      assignedShop,
      notes,
      stage,
      retailerId,
    );
    return res.json({ success: true, data: result });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.recordBatchStage = async (req, res) => {
  try {
    const { assignedShop, notes, stage, retailerId } = req.body;
    const result = await batchService.recordBatchStage(
      req.params.batchId,
      assignedShop,
      notes,
      stage,
      retailerId,
    );
    if (!result) return res.status(404).json({ message: "Batch not found." });
    return res.json({
      success: true,
      data: {
        batchId: result.batch.batchId,
        updated: result.updated,
        skipped: result.skipped,
      },
    });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.listEvents = async (_req, res) => {
  try {
    const events = await batchService.listEvents();
    return res.json({ success: true, count: events.length, data: events });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.voidMovement = async (req, res) => {
  try {
    const result = await batchService.voidMovement(
      req.params.batchId,
      req.params.unitNumber,
      req.params.index,
      req.body?.reason,
      req.userData?.userId,
    );
    if (!result) return res.status(404).json({ message: "Entry not found." });
    return res.json({
      success: true,
      data: { unitNumber: result.unit.unitNumber, status: result.unit.status },
    });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.setRecall = async (req, res) => {
  try {
    const batch = await batchService.setRecall(
      req.params.batchId,
      req.body || {},
      req.userData?.userId,
    );
    if (!batch) return res.status(404).json({ message: "Batch not found." });
    return res.json({ success: true, data: batch.recall });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.liftRecall = async (req, res) => {
  try {
    const batch = await batchService.liftRecall(
      req.params.batchId,
      req.userData?.userId,
    );
    if (!batch) return res.status(404).json({ message: "Batch not found." });
    return res.json({ success: true, data: batch.recall });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.getAnchoringStatus = async (_req, res) => {
  try {
    return res.json({ success: true, data: await movementAnchorService.getStatus() });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.runAnchoring = async (_req, res) => {
  try {
    if (!movementAnchorService.isConfigured()) {
      return res.status(409).json({
        message: "The batch traceability contract is not configured on this server.",
      });
    }
    const result = await movementAnchorService.runOnce();
    return res.json({ success: true, data: result });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.retryFailedAnchoring = async (_req, res) => {
  try {
    return res.json({ success: true, data: await movementAnchorService.retryFailed() });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.getBatchVerification = async (req, res) => {
  try {
    const data = await publicVerificationService.getAdminBatchVerification(
      req.params.batchId,
    );
    if (!data) return res.status(404).json({ message: "Batch not found." });
    return res.json({ success: true, data });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.listUnits = async (req, res) => {
  try {
    const data = await publicVerificationService.listAdminUnits(
      req.params.batchId,
      req.query,
    );
    return res.json({ success: true, data });
  } catch (error) {
    return sendError(res, error);
  }
};

exports.resolveUnit = async (req, res) => {
  try {
    const data = await batchService.resolveUnitCode(req.query.code);
    if (!data) return res.status(404).json({ message: "Unit not found." });
    return res.json({ success: true, data });
  } catch (error) {
    return sendError(res, error);
  }
};
