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
    // Supplied by the farmer; shown to customers as the "Harvested" stage.
    harvestedOn: { type: Date },
    // Quantity actually delivered so far. Undefined on orders completed before
    // delivery tracking, where the full quantity is treated as received.
    receivedQuantity: { type: Number, min: 0 },
    materialCategory: {
      type: String,
      enum: ["cinnamon", "other"],
      default: "other",
    },
    allocatedQuantity: { type: Number, default: 0, min: 0 },
    allocations: {
      type: [
        new Schema(
          {
            batchId: { type: String, required: true },
            quantity: { type: Number, required: true, min: 0.001 },
            allocatedAt: { type: Date, default: Date.now },
          },
          { _id: false },
        ),
      ],
      default: [],
    },
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
    // Set when the order is marked completed (goods received).
    receivedAt: { type: Date },
    receipts: {
      type: [
        new Schema(
          {
            receivedAt: { type: Date, required: true },
            note: { type: String, trim: true },
            recordedBy: String,
            lines: [
              new Schema(
                {
                  index: { type: Number, required: true },
                  quantity: { type: Number, required: true, min: 0.000001 },
                },
                { _id: false },
              ),
            ],
          },
          { _id: false },
        ),
      ],
      default: [],
    },
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
