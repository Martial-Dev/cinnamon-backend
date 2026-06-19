const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const PurchaseOrderItemSchema = new Schema(
  {
    productId: { type: String },
    productName: { type: String, required: true },
    quantity: { type: Number, required: true },
    unit: { type: String, default: "kg" },
    unitPrice: { type: Number, required: true },
    lineTotal: { type: Number, required: true },
    hsCode: { type: String },
    grade: { type: String },
  },
  { _id: false },
);

const BlockchainRefSchema = new Schema(
  {
    hash: String,
    txId: String,
    network: String,
    contractAddress: String,
    explorerUrl: String,
    recordedAt: Date,
  },
  { _id: false },
);

const PurchaseOrderSchema = new Schema(
  {
    supplierId: {
      type: Schema.Types.ObjectId,
      ref: "Supplier",
      required: true,
    },
    supplierName: { type: String },
    items: { type: [PurchaseOrderItemSchema], default: [] },
    totalAmount: { type: Number, default: 0 },
    currency: { type: String, default: "USD" },
    deliveryTerms: { type: String },
    paymentTerms: { type: String },
    paymentStatus: {
      type: String,
      enum: ["pending", "partial", "paid", "overdue"],
      default: "pending",
    },
    orderStatus: {
      type: String,
      enum: ["draft", "sent", "accepted", "rejected", "completed"],
      default: "draft",
    },
    dueDate: { type: Date },
    notes: String,
    blockchainRef: { type: BlockchainRefSchema },
    createdBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true },
);

PurchaseOrderSchema.methods.calculateTotal = function () {
  this.totalAmount = (this.items || []).reduce(
    (s, it) => s + (it.lineTotal || 0),
    0,
  );
  return this.totalAmount;
};

module.exports = mongoose.model("PurchaseOrder", PurchaseOrderSchema);
