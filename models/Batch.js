const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const sourceMaterialSchema = new Schema(
  {
    purchaseOrderId: {
      type: Schema.Types.ObjectId,
      ref: "PurchaseOrder",
      required: true,
    },
    purchaseOrderItemIndex: { type: Number, required: true },
    supplierId: {
      type: Schema.Types.ObjectId,
      ref: "Supplier",
      required: true,
    },
    supplierName: { type: String, required: true },
    productName: { type: String, required: true },
    grade: { type: String, trim: true, default: "" },
    quantity: { type: Number, required: true, min: 0.001 },
    unit: { type: String, required: true },
  },
  { _id: false },
);

const batchSchema = new Schema(
  {
    batchId: { type: String, required: true, unique: true, trim: true },
    productName: { type: String, required: true, trim: true },
    producedOn: { type: Date, required: true },
    totalUnits: { type: Number, required: true, min: 1 },
    quantityPerUnit: { type: Number, required: true, min: 0.001 },
    quantityUnit: { type: String, default: "g", trim: true },
    notes: { type: String, trim: true, default: "" },
    sourceMaterials: { type: [sourceMaterialSchema], default: [] },
    // Cinnamon lost in grading/trimming, as a percentage of the input.
    processingLossPercent: { type: Number, min: 0, max: 50, default: 0 },
    recall: {
      active: { type: Boolean, default: false },
      publicMessage: { type: String, trim: true },
      reason: { type: String, trim: true },
      recalledAt: Date,
      recalledBy: String,
      liftedAt: Date,
      liftedBy: String,
    },
    dataHash: String,
    blockchainRef: {
      status: {
        type: String,
        enum: ["recorded", "pending", "failed", "not_configured"],
        default: "not_configured",
      },
      txId: String,
      blockNumber: Number,
      network: String,
      contractAddress: String,
      explorerUrl: String,
      verified: { type: Boolean, default: null },
      attempts: { type: Number, default: 0 },
      lastError: String,
    },
    createdBy: String,
  },
  { timestamps: true },
);

// Units live in their own collection (models/BatchUnit.js) so a batch can
// have any number of packages without reaching MongoDB's 16 MB document limit.

/**
 * Batches used to embed their units, with unique indexes on unit fields.
 * Those indexes would reject a second batch saved without units, so they are
 * removed once the server connects.
 */
batchSchema.statics.dropLegacyUnitIndexes = async function dropLegacyUnitIndexes() {
  const existing = await this.collection.indexes().catch(() => []);
  for (const index of existing) {
    if (Object.keys(index.key || {}).some((field) => field.startsWith("units."))) {
      await this.collection.dropIndex(index.name);
    }
  }
};

module.exports = mongoose.model("Batch", batchSchema);
