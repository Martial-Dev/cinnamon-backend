const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const PaymentSchema = new Schema(
  {
    poId: { type: Schema.Types.ObjectId, ref: "PurchaseOrder", required: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: "USD" },
    status: {
      type: String,
      enum: ["pending", "processed", "completed", "failed", "refunded"],
      default: "pending",
    },
    paymentMethod: {
      type: String,
      enum: ["bank_transfer", "credit_card", "cryptocurrency", "check"],
      default: "bank_transfer",
    },
    reference: { type: String },
    dueDate: { type: Date },
    paidDate: { type: Date },
    invoiceId: { type: Schema.Types.ObjectId, ref: "Invoice" },
    notes: String,
    blockchainRef: {
      hash: String,
      txId: String,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Payment", PaymentSchema);
