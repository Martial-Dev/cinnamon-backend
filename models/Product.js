const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
  productName: { type: String, required: true },
  productDescription: { type: String, required: true },
  productImage: { type: String, required: true },
  createdDate: { type: Date, default: Date.now },
  quantity: { type: Number, required: true },
  price: { type: Number, required: true },
  availability: { type: String, required: true },
});

module.exports = mongoose.model("Product", productSchema);
