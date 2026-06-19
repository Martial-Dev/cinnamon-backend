const Payment = require("../models/Payment");
const PurchaseOrder = require("../models/PurchaseOrder");

class PaymentService {
  async recordPayment(paymentData) {
    const payment = new Payment(paymentData);
    const saved = await payment.save();

    // Update PO payment status simply (basic)
    const po = await PurchaseOrder.findById(paymentData.poId);
    if (po) {
      // naive: if any payment recorded mark partial/paid depending on amounts
      po.paymentStatus = "partial";
      await po.save();
    }

    return saved;
  }

  async getPaymentTracking(poId) {
    const payments = await Payment.find({ poId });
    const totalPaid = payments.reduce((s, p) => s + (p.amount || 0), 0);
    const po = await PurchaseOrder.findById(poId);
    const totalAmount = po?.totalAmount || po?.total || 0;
    return {
      poId,
      totalAmount,
      paidAmount: totalPaid,
      remainingAmount: Math.max(0, totalAmount - totalPaid),
      payments,
    };
  }

  async getAllPayments(filter = {}) {
    return Payment.find(filter).sort({ createdAt: -1 });
  }
}

module.exports = new PaymentService();
