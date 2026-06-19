const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const MaterialProofSchema = new Schema(
  {
    materialType: String,
    batchId: String,
    materialHash: String,
  },
  { _id: false },
);

const BlockchainProofSchema = new Schema(
  {
    documentType: {
      type: String,
      enum: ["PO", "SUPPLIER", "INVOICE"],
      required: true,
    },
    documentId: { type: Schema.Types.ObjectId, required: true },
    dataHash: { type: String, required: true },
    txId: String,
    network: String,
    contractAddress: String,
    explorerUrl: String,
    verified: { type: Boolean, default: false },
    materials: { type: [MaterialProofSchema], default: [] },
    recordedAt: Date,
  },
  { timestamps: true },
);

module.exports = mongoose.model("BlockchainProof", BlockchainProofSchema);
