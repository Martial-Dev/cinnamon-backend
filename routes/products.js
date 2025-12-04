const express = require("express");
const router = express.Router();
const upload = require("../middleware/Multer");
const Product = require("../models/Product");
const uploadImageToFirebase = require("../utils/firebase");
const checkAuth = require("../middleware/check-auth");

// Create a new product
router.post("/", checkAuth, upload.single("image"), async (req, res) => {
  try {
    let productImage = "";
    if (req.file) {
      productImage = await uploadImageToFirebase(
        req.file.buffer,
        req.file.originalname,
        "products"
      );
    }
    const {
      productName,
      productDescription,
      quantity,
      price,
      availability,
      type,
      discount,
    } = req.body;

    const product = new Product({
      productName,
      productDescription,
      productImage,
      quantity,
      price,
      availability,
      type: type || 'standard',
      discount: discount || 0,
    });

    await product.save();
    res.status(201).json({ message: "Product created successfully", product });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get all products
router.get("/", async (req, res) => {
  try {
    const products = await Product.find();
    res.status(200).json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get a specific product by ID
router.get("/:id", async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    res.status(200).json(product);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update a product by ID
router.put("/:id", checkAuth, upload.single("image"), async (req, res) => {
  try {
    let updateData = req.body;
    if (req.file) {
      updateData.productImage = await uploadImageToFirebase(
        req.file.buffer,
        req.file.originalname,
        "products"
      );
    }
    const product = await Product.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
    });
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    res.status(200).json({ message: "Product updated successfully", product });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Delete a product by ID
router.delete("/:id", checkAuth, async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    res.status(200).json({ message: "Product deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;