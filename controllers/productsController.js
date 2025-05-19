// filepath: /backend-mongodb/backend-mongodb/src/controllers/productsController.js
const Product = require("../models/Product");
const uploadImageToFirebase = require("../utils/firebase");

// Create a new product
exports.createProduct = async (req, res) => {
  try {
    let product_image = "";
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
      productImage,
      quantity,

      price,
      availability,
    } = req.body;

    const product = new Product({
      productName,
      productDescription,
      productImage,
      quantity,
      price,
      availability,
    });

    await product.save();
    res.status(201).json({ message: "Product created successfully", product });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Retrieve all products
exports.getAllProducts = async (req, res) => {
  try {
    const products = await Product.find();
    res.status(200).json(products);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Retrieve a product by ID
exports.getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    res.status(200).json(product);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Update a product by ID
exports.updateProduct = async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    res.status(200).json({ message: "Product updated successfully", product });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Delete a product by ID
exports.deleteProduct = async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }
    res.status(200).json({ message: "Product deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
