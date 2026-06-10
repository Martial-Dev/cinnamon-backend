const mongoose = require("mongoose");

const supplierProductSchema = new mongoose.Schema(
  {
    productName: { type: String, required: true },
    productDescription: { type: String },
    hsCode: { type: String }, // For customs
    quantity: { type: Number, required: true },
    quantityUnit: { type: String, default: "kg" },
    price: { type: Number, required: true },
    currency: { type: String, default: "USD" },
    grade: { type: String }, // e.g., A, B, C for cinnamon
    minimumOrder: { type: Number },
    availability: {
      type: String,
      enum: ["in_stock", "made_to_order", "seasonal"],
      default: "in_stock",
    },
    leadTime: { type: Number }, // in days
    certifications: [{ type: String }], // e.g., ['Organic', 'Fair Trade']
  },
  { _id: false },
);

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
supplierSchema.index({ supplierName: 1 });
supplierSchema.index({ email: 1 });
supplierSchema.index({ country: 1 });
supplierSchema.index({ "blockchainRef.hash": 1 });
supplierSchema.index({ "verification.status": 1 });

module.exports = mongoose.model("Supplier", supplierSchema);
