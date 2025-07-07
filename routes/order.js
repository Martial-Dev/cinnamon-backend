const express = require("express");
const router = express.Router();
const Order = require("../models/Oder");
const Product = require("../models/Product");
const checkAuth = require("../middleware/check-auth");
const User = require("../models/User");
const uploadImageToFirebase = require("../utils/firebase");
const upload = require("../middleware/Multer");
const Cart = require("../models/Cart");

router.post(
  "/",
  checkAuth,
  upload.fields([
    { name: "proofImage", maxCount: 1 },
    { name: "proofPdf", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const userId = req.userData.userId;
      const user = await User.findById(userId);
      if (!user || !user.address) {
        return res
          .status(400)
          .json({ error: "User or shipping address not found." });
      }

      // Parse items if sent as JSON string
      let items = req.body.items;
      if (typeof items === "string") {
        items = JSON.parse(items);
      }

      // Upload proof image or PDF if provided
      let proofImageUrl = "";
      let file = null;
      if (req.files && req.files.proofImage && req.files.proofImage[0]) {
        file = req.files.proofImage[0];
      } else if (req.files && req.files.proofPdf && req.files.proofPdf[0]) {
        file = req.files.proofPdf[0];
      }
      if (file) {
        proofImageUrl = await uploadImageToFirebase(
          file.buffer,
          file.originalname,
          "order-proofs"
        );
      }

      // Build order data
      const orderData = {
        user: userId,
        items,
        total: req.body.total,
        shippingAddress: user.address,
        proofImageUrl,
        paymentStatus: "Pending",
      };

      // Create and save order
      const order = new Order(orderData);
      const savedOrder = await order.save();

      // Deduct product quantities
      for (const item of items) {
        await Product.findByIdAndUpdate(
          item.product,
          { $inc: { quantity: -item.quantity } },
          { new: true }
        );
      }

      // Remove ordered items from user's cart
      const productIdsOrdered = items.map((item) => item.product);
      await Cart.updateOne(
        { userId: userId },
        { $pull: { items: { productId: { $in: productIdsOrdered } } } }
      );

      res.status(201).json(savedOrder);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  }
);

// Get all orders
router.get("/", async (req, res) => {
  try {
    const orders = await Order.find()
      .populate("user")
      .populate("items.product");
    res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all orders for the authenticated user (userId from header/middleware)
router.get("/user", checkAuth, async (req, res) => {
  try {
    const userId = req.userData.userId; // set by checkAuth middleware
    const orders = await Order.find({ user: userId })
      .populate("user")
      .populate("items.product");
    // Optionally transform items to include productName as in your other GET
    const ordersWithNames = orders.map((order) => {
      const orderObj = order.toObject();
      orderObj.items = orderObj.items.map((item) => ({
        ...item,
        productName:
          item.product && item.product.productName
            ? item.product.productName
            : "",
        product:
          item.product && item.product._id ? item.product._id : item.product,
      }));
      return orderObj;
    });
    res.json(ordersWithNames);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get a specific order by ID
router.get("/:id", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate("user")
      .populate("items.product");
    if (!order) return res.status(404).json({ message: "Order not found" });

    // Transform items to include productName
    const orderObj = order.toObject();
    orderObj.items = orderObj.items.map((item) => ({
      ...item,
      productName:
        item.product && item.product.productName
          ? item.product.productName
          : "",
      product:
        item.product && item.product._id ? item.product._id : item.product,
    }));

    res.json(orderObj);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update an order
router.put("/:id", async (req, res) => {
  try {
    const updatedOrder = await Order.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    if (!updatedOrder)
      return res.status(404).json({ message: "Order not found" });
    res.json(updatedOrder);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Delete an order
router.delete("/:id", async (req, res) => {
  try {
    const deletedOrder = await Order.findByIdAndDelete(req.params.id);
    if (!deletedOrder)
      return res.status(404).json({ message: "Order not found" });
    res.json({ message: "Order deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
