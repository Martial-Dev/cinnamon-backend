const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  items: [
    {
      product: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Product",
        required: true,
      },
      quantity: { type: Number, required: true, min: 1 },
      price: { type: Number, required: true },
      productName: { type: String },
      image: { type: String },
    },
  ],
  total: { type: Number, required: true },

  // Payment Information
  paymentMethod: {
    type: String,
    enum: ["online", "bank_transfer", "cash_on_delivery"],
    // Default kept undefined to preserve existing behavior where not set
  },
  paymentStatus: {
    type: String,
    enum: ["Not Paid", "Pending", "Paid", "Failed", "Refunded"],
    default: "Pending",
  },

  // Payable Payment Gateway Fields (for online payments)
  payableTransactionId: { type: String, index: true, sparse: true },
  payableOrderId: { type: String },
  invoiceId: { type: String, unique: true, sparse: true },
  paymentScheme: { type: String },
  paymentType: { type: Number },
  transactionType: { type: String },

  // Bank Transfer proof fields
  proofImageUrl: { type: String },
  proofPdfUrl: { type: String },

  // Order Fulfillment Status
  status: {
    type: String,
    enum: ["Pending", "x", "Processing", "Shipped", "Delivered", "Cancelled"],
    default: "Pending",
  },

  shippingAddress: { type: String, required: true },

  // Timestamps
  paymentConfirmedAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Indexes helpful for webhook lookups
orderSchema.index({ payableTransactionId: 1 });
orderSchema.index({ invoiceId: 1 });

module.exports = mongoose.model("Order", orderSchema);
