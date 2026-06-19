const PurchaseOrder = require("../models/PurchaseOrder");
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
    const created = await poService.create(req.body);
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getAllPOs = async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.orderStatus = req.query.status;
    const list = await poService.list(filter);
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getPOById = async (req, res) => {
  try {
    const po = await poService.getById(req.params.id);
    if (!po) return res.status(404).json({ message: "PO not found" });
    res.json(po);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updatePO = async (req, res) => {
  try {
    const updated = await poService.update(req.params.id, req.body);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.sendPO = async (req, res) => {
  try {
    const po = await poService.getById(req.params.id);
    if (!po) return res.status(404).json({ message: "PO not found" });
    po.orderStatus = "sent";
    await po.save();
    res.json(po);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const po = await poService.update(req.params.id, { orderStatus: status });
    res.json(po);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deletePO = async (req, res) => {
  try {
    await poService.remove(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getSupplierPOs = async (req, res) => {
  try {
    const list = await poService.list({ supplierId: req.params.supplierId });
    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
