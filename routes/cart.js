const express = require("express");
const router = express.Router();
const Cart = require("../models/Cart");
const Product = require("../models/Product");
const checkAuth = require("../middleware/check-auth");

// Add item to cart
router.post("/", checkAuth, async (req, res) => {
  try {
    const userId = req.userData.userId;
    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const { _id, productId, quantity = 1 } = req.body;
    const idToFind = _id || productId;
    if (!idToFind) {
      return res.status(400).json({ error: "Product id is required" });
    }

    const product = await Product.findById(idToFind);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = new Cart({ userId, items: [], totalPrice: 0 });
    }

    cart.items.push({
      productId: product._id,
      productName: product.productName,
      price: product.price,
      quantity,
      productImage: product.productImage,
    });

    cart.totalPrice = cart.items.reduce(
      (sum, item) => sum + item.price * (item.quantity || 1),
      0,
    );

    await cart.save();
    res.status(200).json({ message: "Item added to cart", cart });
  } catch (err) {
    console.error("Add to cart error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get all cart items for the authenticated user
router.get("/", checkAuth, async (req, res) => {
  try {
    const userId = req.userData.userId;
    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return res.status(404).json({ message: "Cart not found" });
    }
    res.status(200).json(cart.items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete cart item
router.delete("/:id", async (req, res) => {
  try {
    const userId = req.userData?.userId;
    if (!userId) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const { id } = req.params;
    const result = await Cart.findOneAndUpdate(
      { userId },
      {
        $pull: {
          items: {
            $or: [{ _id: id }, { productId: id }],
          },
        },
      },
      { new: true },
    );

    if (!result) {
      return res.status(404).json({ message: "Cart not found" });
    }

    const itemStillExists = result.items.some(
      (item) => item._id.toString() === id || item.productId.toString() === id,
    );
    if (itemStillExists) {
      return res.status(404).json({ message: "Item not found in cart" });
    }

    res.status(200).json({ message: "Item deleted from cart", cart: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete multiple cart items
router.post("/remove-items", async (req, res) => {
  try {
    const userId = req.userData?.userId;
    if (!userId) {
      return res.status(401).json({ message: "User not authenticated" });
    }

    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: "No item ids provided" });
    }

    const normalizedIds = ids.map((id) => String(id));

    const result = await Cart.findOneAndUpdate(
      { userId },
      {
        $pull: {
          items: {
            $or: [
              { _id: { $in: normalizedIds } },
              { productId: { $in: normalizedIds } },
            ],
          },
        },
      },
      { new: true },
    );

    if (!result) {
      return res.status(404).json({ message: "Cart not found" });
    }

    res.status(200).json({ message: "Items deleted from cart", cart: result });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
