const Cart = require('../models/Cart');

exports.addToCart = async (req, res) => {
    try {
        const { id, name, price } = req.body;
        const newItem = new Cart({ id, name, price });
        await newItem.save();
        res.status(201).json({ message: "Item added to cart", item: newItem });
    } catch (error) {
        res.status(500).json({ error: error.message });
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