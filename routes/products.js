const express = require("express");
const router = express.Router();
const upload = require("../middleware/Multer");
const productsController = require("../controllers/productsController");
const checkAuth = require("../middleware/check-auth");

// Route to create a new product
router.post("/", checkAuth,upload.single("image"), productsController.createProduct);

// Route to get all products
router.get("/", productsController.getAllProducts);

// Route to get a specific product by ID
router.get("/:id", productsController.getProductById);

// Route to update a product by ID
router.put("/:id", productsController.updateProduct);

// Route to delete a product by ID
router.delete("/:id", productsController.deleteProduct);

module.exports = router;