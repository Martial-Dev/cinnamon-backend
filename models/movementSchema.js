const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const UNIT_STATUSES = ["Queued", "Packed", "Stored", "Assigned", "Delivered", "Sold"];

/** One entry in a unit's journey. Embedded in BatchUnit.history. */
const movementSchema = new Schema(
  {
    status: {
      type: String,
      enum: UNIT_STATUSES,
      required: true,
    },
    assignedShop: { type: String, required: true, trim: true },
    timestamp: { type: Date, required: true, default: Date.now },
    notes: { type: String, trim: true, default: "" },
    dataHash: String,
    // Set when the stage was recorded against a registered retailer. Kept
    // outside dataHash so existing movement hashes stay valid.
    retailerId: { type: Schema.Types.ObjectId, ref: "Retailer" },
    retailerCity: { type: String, trim: true },
    // Merkle anchoring: many movements share one on-chain root. Transaction
    // details live on the MovementAnchor document for that root.
    anchor: {
      status: {
        type: String,
        enum: ["queued", "submitting", "anchored", "failed"],
      },
      root: String,
      leafIndex: Number,
    },
    // A mistaken entry is voided, never deleted, so the history stays auditable.
    voidedAt: Date,
    voidedBy: String,
    voidReason: { type: String, trim: true },
    // Per-movement transactions from before Merkle anchoring (read only).
    blockchainRef: {
      status: {
        type: String,
        enum: ["recorded", "pending", "failed", "not_configured"],
      },
      txId: String,
      blockNumber: Number,
      network: String,
      contractAddress: String,
      explorerUrl: String,
      verified: Boolean,
    },
  },
  { _id: false },
);

module.exports = movementSchema;
module.exports.UNIT_STATUSES = UNIT_STATUSES;
