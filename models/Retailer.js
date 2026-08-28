const mongoose = require("mongoose");

const shippingAddressSchema = new mongoose.Schema(
  {
    label: String,
    address: { type: String, required: true },
    city: String,
    country: String,
    postalCode: String,
  },
  { _id: false },
);

const retailerSchema = new mongoose.Schema(
  {
    companyName: { type: String, required: true, trim: true },
    businessType: {
      type: String,
      enum: ["retailer", "distributor", "wholesaler", "hospitality"],
      default: "retailer",
    },
    registrationNumber: String,
    taxId: String,

    contactPerson: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, required: true, trim: true },

    billingAddress: { type: String, required: true, trim: true },
    shippingAddresses: { type: [shippingAddressSchema], default: [] },

    purchaseProfile: {
      categories: { type: [String], default: [] },
      avgMonthlyVolume: Number,
      preferredPackSizes: { type: [String], default: [] },
      moqAcceptance: Boolean,
    },

    commercialTerms: {
      paymentTerms: {
        type: String,
        enum: ["prepaid", "net15", "net30", "net60"],
      },
      currency: String,
      creditLimit: Number,
      incoterms: { type: [String], default: [] },
    },

    verification: {
      status: {
        type: String,
        enum: ["PENDING", "APPROVED", "REJECTED", "SUSPENDED"],
        default: "PENDING",
      },
      verifiedBy: String,
      verifiedAt: Date,
      notes: String,
    },

    // Optional for future blockchain attestation.
    blockchainRef: {
      txId: String,
      network: String,
      contractAddress: String,
      hash: String,
      explorerUrl: String,
      recordedAt: Date,
    },

    sourceChannel: { type: String, default: "website" },
    status: {
      type: String,
      enum: ["active", "inactive", "blacklisted"],
      default: "active",
    },
    createdBy: String,
    updatedBy: String,
  },
  { timestamps: true },
);

retailerSchema.index({ email: 1 });
retailerSchema.index({ companyName: 1 });
retailerSchema.index({ "verification.status": 1 });

module.exports = mongoose.model("Retailer", retailerSchema);
