const mongoose = require("mongoose");

const InvoiceItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
  productName: { type: String, required: true },
  quantity: { type: Number, required: true },
  price: { type: Number, required: true },
  lineNumber: { type: Number },
  hsCode: { type: String },
  quantityUnit: { type: String },
  netWeight: { type: Number },
  grossWeight: { type: Number },
  grade: { type: String },
  batchId: { type: String },
  lineTotal: { type: Number, required: true },
});

module.exports = InvoiceItemSchema;