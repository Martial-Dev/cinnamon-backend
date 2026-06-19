const mongoose = require("mongoose");

const verificationSchema = new mongoose.Schema(
  {
    status: {
      type: String,
      enum: ["PENDING", "VERIFIED", "REJECTED", "SUSPENDED"],
      default: "PENDING",
    },
    verifiedBy: String, // User ID of verifier
    verificationDate: Date,
    verificationNotes: String,
    documentsRequired: [String], // e.g., ['business_license', 'tax_certificate', 'product_samples']
    documentsProvided: [String],
  },
  { _id: false },
);

module.exports = verificationSchema;