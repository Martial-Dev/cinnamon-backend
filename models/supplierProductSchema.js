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

module.exports = supplierProductSchema;