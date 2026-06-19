const express = require("express");
const router = express.Router();
const Invoice = require("../models/Invoice");
const Order = require("../models/Oder");

// Create a new invoice
router.post("/", async (req, res) => {
  try {
    const payload = req.body || {};
    // If total not provided, compute from items
    if (!payload.total && Array.isArray(payload.items)) {
      payload.total = payload.items.reduce(
        (acc, it) =>
          acc +
          (Number(it.lineTotal || (it.price || 0) * (it.quantity || 0)) || 0),
        0,
      );
    }

    const newInvoice = new Invoice(payload);
    const savedInvoice = await newInvoice.save();
    res.status(201).json(savedInvoice);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all invoices
router.get("/", async (req, res) => {
  try {
    const invoices = await Invoice.find();
    res.status(200).json(invoices);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Preview invoice generated from an order (no DB write)
router.get("/preview-from-order/:orderId", async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId).lean();
    if (!order) return res.status(404).json({ message: "Order not found" });

    const items = (order.items || []).map((it, idx) => {
      const lineTotal =
        it.lineTotal != null
          ? Number(it.lineTotal)
          : Number(it.price || 0) * Number(it.quantity || 0);
      return {
        productId: it.product,
        productName: it.productName || "",
        quantity: it.quantity || 0,
        price: it.price || 0,
        lineNumber: idx + 1,
        lineTotal,
      };
    });

    const total = items.reduce((s, i) => s + (Number(i.lineTotal) || 0), 0);

    const preview = {
      orderId: order._id,
      items,
      total,
      type: req.query.type || "PROFORMA",
      currency: order.currency || "USD",
      seller: req.body?.seller || {},
      buyer: req.body?.buyer || {},
    };

    res.json(preview);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create and save invoice from an order
router.post("/from-order/:orderId", async (req, res) => {
  try {
    const order = await Order.findById(req.params.orderId).lean();
    if (!order) return res.status(404).json({ message: "Order not found" });

    const items = (order.items || []).map((it, idx) => {
      const lineTotal =
        it.lineTotal != null
          ? Number(it.lineTotal)
          : Number(it.price || 0) * Number(it.quantity || 0);
      return {
        productId: it.product,
        productName: it.productName || "",
        quantity: it.quantity || 0,
        price: it.price || 0,
        lineNumber: idx + 1,
        lineTotal,
      };
    });

    const total = items.reduce((s, i) => s + (Number(i.lineTotal) || 0), 0);

    const invoicePayload = {
      orderId: order._id,
      items,
      total,
      type: req.body.type || "PROFORMA",
      currency: req.body.currency || order.currency || "USD",
      seller: req.body.seller || {},
      buyer: req.body.buyer || {},
      createdBy: req.body.createdBy || "system",
    };

    const newInvoice = new Invoice(invoicePayload);
    const savedInvoice = await newInvoice.save();
    res.status(201).json(savedInvoice);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get a specific invoice by ID
router.get("/:id", async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found" });
    }
    res.status(200).json(invoice);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update an invoice by ID
router.put("/:id", async (req, res) => {
  try {
    const updatedInvoice = await Invoice.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true },
    );
    if (!updatedInvoice) {
      return res.status(404).json({ message: "Invoice not found" });
    }
    res.status(200).json(updatedInvoice);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete an invoice by ID
router.delete("/:id", async (req, res) => {
  try {
    const deletedInvoice = await Invoice.findByIdAndDelete(req.params.id);
    if (!deletedInvoice) {
      return res.status(404).json({ message: "Invoice not found" });
    }
    res.status(200).json({ message: "Invoice deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
