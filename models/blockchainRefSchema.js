const mongoose = require("mongoose");

const blockchainRefSchema = new mongoose.Schema(
  {
    txId: String,
    network: String, // e.g., 'ethereum', 'polygon'
    contractAddress: String,
    hash: String, // SHA256 hash of supplier data
    explorerUrl: String,
    recordedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

module.exports = blockchainRefSchema;
