const Cart = require("../models/Cart");
const Product = require("../models/Product");

exports.addToCart = async (req, res) => {
  try {
    const userId = req.userData.userId;
    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    const { _id, quantity = 1 } = req.body;

    // Find the product by ID
    const product = await Product.findById(_id);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = new Cart({ userId, items: [], totalPrice: 0 });
    }

    // Add the product to the cart
    cart.items.push({
      productId: product._id,
      productName: product.productName,
      price: product.price,
      quantity: 1,
      productImage: product.productImage // <-- Add this line if you want to store image in cart
    });

    // Update total price
    cart.totalPrice = cart.items.reduce((sum, item) => sum + item.price * (item.quantity || 1), 0);

    await cart.save();
    res.status(200).json({ message: "Item added to cart", cart });
  } catch (err) {
    console.error("Add to cart error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.getCartItems = async (req, res) => {
    try {
        const items = await Cart.find();
        res.status(200).json(items);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};

exports.deleteCartItem = async (req, res) => {
    try {
        const { id } = req.params;
        const result = await Cart.findByIdAndDelete(id);
        if (!result) {
            return res.status(404).json({ message: "Item not found" });
        }
        res.status(200).json({ message: "Item deleted from cart" });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};