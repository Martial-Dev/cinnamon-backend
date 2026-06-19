const mongoose = require("mongoose");
const supplierProductSchema = require("./supplierProductSchema");
const blockchainRefSchema = require("./blockchainRefSchema");
const verificationSchema = require("./verificationSchema");

const supplierSchema = new mongoose.Schema(
  {
    supplierName: { type: String, required: true, unique: true },
    businessLicense: String,
    registrationNumber: String,

    // Contact Information
    contactPerson: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },

    // Address
    address: { type: String, required: true },
    city: { type: String, required: true },
    country: { type: String, required: true },
    zipCode: String,

    // Company Details
    companyDescription: String,
    yearEstablished: Number,
    companySize: {
      type: String,
      enum: ["startup", "small", "medium", "large"],
      default: "small",
    },

    // Products & Pricing
    products: { type: [supplierProductSchema], default: [] },

    // Banking & Payment
    bankName: String,
    accountHolder: String,
    accountNumber: String,
    swift: String,
    paymentTerms: String, // e.g., 'Net 30', 'Prepayment', 'Letter of Credit'

    // Blockchain Integration
    blockchainRef: blockchainRefSchema,
    verification: { type: verificationSchema, default: {} },

    // Quality & Certification
    qualityRating: { type: Number, min: 0, max: 5 },
    certifications: [String], // e.g., ['ISO 9001', 'Organic', 'Fair Trade']
    reviews: [
      {
        rating: { type: Number, min: 1, max: 5 },
        comment: String,
        reviewedBy: String,
        reviewDate: { type: Date, default: Date.now },
      },
    ],

    // Audit Trail
    status: {
      type: String,
      enum: ["active", "inactive", "blacklisted"],
      default: "active",
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    createdBy: String,
    updatedBy: String,
  },
  { timestamps: true },
);

// Index for fast lookup
supplierSchema.index({ email: 1 });
supplierSchema.index({ country: 1 });
supplierSchema.index({ "blockchainRef.hash": 1 });
supplierSchema.index({ "verification.status": 1 });

module.exports = mongoose.model("Supplier", supplierSchema);
