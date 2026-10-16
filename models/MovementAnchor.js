const mongoose = require("mongoose");

/**
 * One on-chain anchor: a Merkle root covering many unit movements.
 * Leaves are stored in tree order so any movement's proof can be rebuilt.
 * Created before the transaction is sent, so an interrupted run can be
 * finished later by checking the root on chain.
 */
const movementAnchorSchema = new mongoose.Schema(
  {
    root: { type: String, required: true, unique: true },
    leaves: { type: [String], required: true },
    leafCount: { type: Number, required: true, min: 1 },
    status: {
      type: String,
      enum: ["submitting", "anchored", "failed", "abandoned"],
      default: "submitting",
    },
    attempts: { type: Number, default: 0 },
    lastError: String,
    txId: String,
    blockNumber: Number,
    network: String,
    contractAddress: String,
    explorerUrl: String,
    submittedAt: Date,
    anchoredAt: Date,
  },
  { timestamps: true },
);

movementAnchorSchema.index({ status: 1, createdAt: 1 });

module.exports = mongoose.model("MovementAnchor", movementAnchorSchema);
