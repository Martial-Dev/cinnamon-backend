const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
  productName: { type: String, required: true },
  productDescription: { type: String, required: true },
  productImage: { type: String, required: true },
  createdDate: { type: Date, default: Date.now },
  quantity: { type: Number, required: true }, // For bulk, this could be in kg
  price: { type: Number, required: true }, // Price per kg for bulk
  availability: { type: String, required: true },
  type: { type: String, enum: ['standard', 'bulk'], default: 'standard' }, // New: Product type
  discount: { type: Number, default: 0, min: 0, max: 100 }, // New: Discount percentage
});

module.exports = mongoose.model("Product", productSchema);