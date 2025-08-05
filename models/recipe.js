const mongoose = require("mongoose");

const recipeSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  imageUrl: { type: String, required: true },
  ingredients: [{ type: String }],
  steps: [{ type: String }],
  createdBy: { type: String },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Recipe", recipeSchema);
