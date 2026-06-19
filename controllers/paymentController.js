const paymentService = require("../services/paymentService");

exports.recordPayment = async (req, res) => {
  try {
    const payment = await paymentService.recordPayment(req.body);
    res.status(201).json(payment);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getPaymentTracking = async (req, res) => {
  try {
    const track = await paymentService.getPaymentTracking(req.params.poId);
    res.json(track);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getAllPayments = async (req, res) => {
  try {
    const payments = await paymentService.getAllPayments(req.query || {});
    res.json(payments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getPaymentById = async (req, res) => {
  try {
    const payment = await paymentService.getAllPayments({ _id: req.params.id });
    res.json(payment[0] || null);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
