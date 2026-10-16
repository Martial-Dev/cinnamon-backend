const PurchaseOrder = require("../models/PurchaseOrder");
const Supplier = require("../models/Supplier");

const formatPurchaseOrder = (purchaseOrder) => {
  if (!purchaseOrder) return purchaseOrder;
  const data = purchaseOrder.toObject
    ? purchaseOrder.toObject()
    : purchaseOrder;
  return {
    ...data,
    id: String(data._id || data.id || ""),
    products: data.items || data.products || [],
  };
};

const hasBatchAllocations = (purchaseOrder) =>
  (purchaseOrder.items || []).some(
    (item) => Number(item.allocatedQuantity || 0) > 0,
  );

const getOrderLines = (order) =>
  (order.items || order.products || []).map((item) => ({
    productId: item.productId || "",
    productName: item.productName || "",
    quantity: Number(item.quantity || 0),
    unit: item.unit || "kg",
    unitPrice: Number(item.unitPrice || 0),
    lineTotal: Number(item.lineTotal || 0),
    hsCode: item.hsCode || "",
    grade: item.grade || "",
    materialCategory:
      item.materialCategory ||
      (/cinnamon/i.test(item.productName || "") ? "cinnamon" : "other"),
    harvestedOn: toDateOrNull(item.harvestedOn),
  }));

const toDateOrNull = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

// Harvest dates are provenance notes, not stock: they may be added or
// corrected after a line has been allocated to a batch.
const withoutHarvestDates = (lines) =>
  lines.map(({ harvestedOn, ...line }) => line);

const receiptFields = (existing, nextStatus) => {
  if (nextStatus !== "completed") return {};
  const fields = existing.receivedAt ? {} : { receivedAt: new Date() };
  // Once deliveries are tracked, closing the order must not make lines that
  // never arrived look fully received.
  if ((existing.receipts || []).length) {
    (existing.items || []).forEach((item, index) => {
      if (item.receivedQuantity === undefined || item.receivedQuantity === null) {
        fields[`items.${index}.receivedQuantity`] = 0;
      }
    });
  }
  return fields;
};

const QUANTITY_TOLERANCE = 1e-6;

const isFutureDate = (date) => date.getTime() > Date.now() + 24 * 60 * 60 * 1000;

const allowedOrderTransitions = {
  draft: ["sent", "rejected"],
  sent: ["accepted", "rejected"],
  accepted: ["completed", "rejected"],
  completed: [],
  rejected: [],
};

const canTransitionOrder = (currentStatus, nextStatus) =>
  currentStatus === nextStatus ||
  Boolean(allowedOrderTransitions[currentStatus]?.includes(nextStatus));

const poService = {
  create: async (data) => {
    const po = new PurchaseOrder(data);
    po.calculateTotal();
    return po.save();
  },
  list: async (filter) => PurchaseOrder.find(filter).sort({ createdAt: -1 }),
  getById: async (id) => PurchaseOrder.findById(id),
  update: async (id, data) =>
    PurchaseOrder.findByIdAndUpdate(id, data, { new: true }),
  remove: async (id) => PurchaseOrder.findByIdAndRemove(id),
};

exports.createPO = async (req, res) => {
  try {
    const payload = {
      ...req.body,
      items: req.body.items || req.body.products || [],
    };
    delete payload.products;
    delete payload.receivedAt;
    payload.items = getOrderLines(payload);

    const supplier = await Supplier.findById(payload.supplierId).select(
      "supplierName",
    );
    if (!supplier) {
      return res.status(400).json({ message: "A valid supplier is required." });
    }
    payload.supplierName = supplier.supplierName;

    const created = await poService.create(payload);
    res.status(201).json(formatPurchaseOrder(created));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getAllPOs = async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.orderStatus = req.query.status;
    const list = await poService.list(filter);
    res.json(list.map(formatPurchaseOrder));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getPOById = async (req, res) => {
  try {
    const po = await poService.getById(req.params.id);
    if (!po) return res.status(404).json({ message: "PO not found" });
    res.json(formatPurchaseOrder(po));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updatePO = async (req, res) => {
  try {
    const existing = await poService.getById(req.params.id);
    if (!existing) return res.status(404).json({ message: "PO not found" });

    const payload = { ...req.body };
    if (payload.supplierId) {
      const supplier = await Supplier.findById(payload.supplierId).select(
        "supplierName",
      );
      if (!supplier) {
        return res
          .status(400)
          .json({ message: "A valid supplier is required." });
      }
      payload.supplierName = supplier.supplierName;
    }

    if (
      payload.orderStatus &&
      !canTransitionOrder(existing.orderStatus || "draft", payload.orderStatus)
    ) {
      return res.status(409).json({
        message: `A ${existing.orderStatus} purchase order cannot transition to ${payload.orderStatus}.`,
      });
    }

    if (Array.isArray(payload.products) || Array.isArray(payload.items)) {
      const requestedItems = getOrderLines(payload);
      const currentItems = getOrderLines(existing);
      if (
        hasBatchAllocations(existing) &&
        JSON.stringify(withoutHarvestDates(requestedItems)) !==
          JSON.stringify(withoutHarvestDates(currentItems))
      ) {
        return res.status(409).json({
          message:
            "Purchase order lines with batch allocations cannot be replaced.",
        });
      }
      delete payload.products;
      if (hasBatchAllocations(existing)) {
        delete payload.items;
        requestedItems.forEach((line, index) => {
          payload[`items.${index}.harvestedOn`] = line.harvestedOn;
        });
      } else {
        payload.items = requestedItems;
      }
    }
    if (
      hasBatchAllocations(existing) &&
      payload.supplierId &&
      String(payload.supplierId) !== String(existing.supplierId)
    ) {
      return res.status(409).json({
        message:
          "The supplier cannot be changed after PO stock is used by a batch.",
      });
    }
    if (
      hasBatchAllocations(existing) &&
      payload.orderStatus &&
      payload.orderStatus !== "completed"
    ) {
      return res.status(409).json({
        message:
          "A completed purchase order with batch allocations cannot be reopened or rejected.",
      });
    }

    delete payload.receivedAt;
    if (payload.orderStatus) {
      Object.assign(payload, receiptFields(existing, payload.orderStatus));
    }

    const updated = await poService.update(req.params.id, payload);
    res.json(formatPurchaseOrder(updated));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.sendPO = async (req, res) => {
  try {
    const po = await poService.getById(req.params.id);
    if (!po) return res.status(404).json({ message: "PO not found" });
    if (!canTransitionOrder(po.orderStatus || "draft", "sent")) {
      return res.status(409).json({
        message: `A ${po.orderStatus} purchase order cannot be sent.`,
      });
    }
    if (hasBatchAllocations(po)) {
      return res.status(409).json({
        message:
          "A purchase order with batch allocations cannot be sent again.",
      });
    }
    po.orderStatus = "sent";
    await po.save();
    res.json(formatPurchaseOrder(po));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const existing = await poService.getById(req.params.id);
    if (!existing) return res.status(404).json({ message: "PO not found" });
    const currentStatus = existing.orderStatus || "draft";
    if (
      !Object.prototype.hasOwnProperty.call(allowedOrderTransitions, status)
    ) {
      return res
        .status(400)
        .json({ message: "Invalid purchase order status." });
    }
    if (status === currentStatus) {
      return res.json(formatPurchaseOrder(existing));
    }
    if (!canTransitionOrder(currentStatus, status)) {
      return res.status(409).json({
        message: `A ${currentStatus} purchase order cannot transition to ${status}.`,
      });
    }
    if (hasBatchAllocations(existing) && status !== "completed") {
      return res.status(409).json({
        message:
          "A completed purchase order with batch allocations cannot be reopened or rejected.",
      });
    }
    const po = await poService.update(req.params.id, {
      orderStatus: status,
      ...receiptFields(existing, status),
    });
    res.json(formatPurchaseOrder(po));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const isCinnamonLine = (item) =>
  item.materialCategory === "cinnamon" ||
  /cinnamon/i.test(item.productName || "");

// Harvest dates are customer-facing provenance only, so they may be set on any
// PO — including one whose stock is already allocated — without unlocking the
// rest of the order.
/**
 * Records goods physically arriving. Only received quantities can be used in
 * batches, and the order completes itself once every line has fully arrived.
 */
exports.recordReceipt = async (req, res) => {
  try {
    const po = await poService.getById(req.params.id);
    if (!po) return res.status(404).json({ message: "PO not found" });
    if (!["accepted", "completed"].includes(po.orderStatus)) {
      return res.status(409).json({
        message: "Deliveries can be recorded once the supplier has accepted the order.",
      });
    }

    const receivedAt = req.body?.receivedAt
      ? toDateOrNull(req.body.receivedAt)
      : new Date();
    if (!receivedAt || isFutureDate(receivedAt)) {
      return res
        .status(400)
        .json({ message: "Enter a valid delivery date that is not in the future." });
    }

    const lines = (Array.isArray(req.body?.lines) ? req.body.lines : [])
      .map((line) => ({ index: Number(line.index), quantity: Number(line.quantity) }))
      .filter((line) => line.quantity > 0);
    if (!lines.length) {
      return res.status(400).json({ message: "Enter at least one received quantity." });
    }

    for (const line of lines) {
      const item = po.items?.[line.index];
      if (!Number.isInteger(line.index) || !item || !Number.isFinite(line.quantity)) {
        return res.status(400).json({ message: "Invalid delivery line." });
      }
      const already = Number(item.receivedQuantity ?? (po.orderStatus === "completed" ? item.quantity : 0));
      if (already + line.quantity > Number(item.quantity) + QUANTITY_TOLERANCE) {
        return res.status(400).json({
          message: `${item.productName}: only ${Number(item.quantity) - already} ${item.unit || "kg"} is still outstanding.`,
        });
      }
    }

    for (const line of lines) {
      const item = po.items[line.index];
      const already = Number(item.receivedQuantity ?? (po.orderStatus === "completed" ? item.quantity : 0));
      item.receivedQuantity = Number((already + line.quantity).toFixed(6));
    }
    po.receipts.push({
      receivedAt,
      note: String(req.body?.note || "").trim(),
      recordedBy: String(req.userData?.userId || "unknown"),
      lines,
    });
    if (!po.receivedAt || receivedAt < po.receivedAt) po.receivedAt = receivedAt;
    const fullyReceived = po.items.every(
      (item) =>
        Number(item.receivedQuantity || 0) + QUANTITY_TOLERANCE >= Number(item.quantity),
    );
    if (fullyReceived) po.orderStatus = "completed";

    await po.save();
    res.json(formatPurchaseOrder(po));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateHarvestDates = async (req, res) => {
  try {
    const existing = await poService.getById(req.params.id);
    if (!existing) return res.status(404).json({ message: "PO not found" });

    const lines = Array.isArray(req.body?.lines) ? req.body.lines : [];
    const latestAllowed = Date.now() + 24 * 60 * 60 * 1000;
    const $set = {};
    const $unset = {};
    // Lets staff fill in when an order received before tracking arrived.
    if (req.body?.receivedAt !== undefined) {
      if (!["accepted", "completed"].includes(existing.orderStatus)) {
        return res
          .status(409)
          .json({ message: "Only accepted or completed orders have a receipt date." });
      }
      const receivedAt = toDateOrNull(req.body.receivedAt);
      if (!receivedAt || isFutureDate(receivedAt)) {
        return res
          .status(400)
          .json({ message: "Enter a valid receipt date that is not in the future." });
      }
      $set.receivedAt = receivedAt;
    }
    for (const line of lines) {
      const index = Number(line.index);
      const item = existing.items?.[index];
      if (!Number.isInteger(index) || !item || !isCinnamonLine(item)) {
        return res
          .status(400)
          .json({ message: "Harvest dates can only be set on cinnamon lines." });
      }
      if (!line.harvestedOn) {
        $unset[`items.${index}.harvestedOn`] = "";
        continue;
      }
      const harvestedOn = toDateOrNull(line.harvestedOn);
      if (!harvestedOn || harvestedOn.getTime() > latestAllowed) {
        return res
          .status(400)
          .json({ message: "Enter a valid harvest date that is not in the future." });
      }
      $set[`items.${index}.harvestedOn`] = harvestedOn;
    }
    if (!Object.keys($set).length && !Object.keys($unset).length) {
      return res.status(400).json({ message: "No dates were provided." });
    }

    const update = {};
    if (Object.keys($set).length) update.$set = $set;
    if (Object.keys($unset).length) update.$unset = $unset;
    const po = await poService.update(req.params.id, update);
    res.json(formatPurchaseOrder(po));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deletePO = async (req, res) => {
  try {
    const existing = await poService.getById(req.params.id);
    if (!existing) return res.status(404).json({ message: "PO not found" });
    if (hasBatchAllocations(existing)) {
      return res.status(409).json({
        message: "A purchase order with batch allocations cannot be deleted.",
      });
    }
    await poService.remove(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getSupplierPOs = async (req, res) => {
  try {
    const list = await poService.list({ supplierId: req.params.supplierId });
    res.json(list.map(formatPurchaseOrder));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
