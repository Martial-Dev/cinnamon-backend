const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const ProductMaterialSchema = new Schema(
  {
    poId: { type: Schema.Types.ObjectId, ref: "PurchaseOrder", required: true },
    productId: { type: String },
    materialType: {
      type: String,
      enum: ["raw", "packaging", "additive"],
      default: "raw",
    },
    supplierId: { type: Schema.Types.ObjectId, ref: "Supplier" },
    description: String,
    batchId: String,
    quantity: Number,
    unit: { type: String, default: "kg" },
    hash: String,
    blockchainRef: {
      txId: String,
      network: String,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("ProductMaterial", ProductMaterialSchema);
