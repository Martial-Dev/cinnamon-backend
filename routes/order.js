const express = require("express");
const router = express.Router();
const Order = require("../models/Oder");
const Product = require("../models/Product");
const checkAuth = require("../middleware/check-auth");
const User = require("../models/User");
const uploadImageToFirebase = require("../utils/firebase");
const upload = require("../middleware/Multer");
const Cart = require("../models/Cart");
const transporter = require("../utils/mailer");

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

      // Extract payment-related fields
      const paymentMethod = req.body.paymentMethod || "bank_transfer";
      const transactionId = req.body.transactionId; // payableTransactionId
      const payableOrderId = req.body.payableOrderId;
      const invoiceId = req.body.invoiceId;
      const incomingPaymentStatus = req.body.paymentStatus; // e.g., Paid for online

      // Upload proof image or PDF if provided
      let proofImageUrl = "";
      let proofPdfUrl = "";
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
          "order-proofs",
        );
        // If it's a PDF, store also in proofPdfUrl
        if ((file.originalname || "").toLowerCase().endsWith(".pdf")) {
          proofPdfUrl = proofImageUrl;
        }
      }

      // For online payments, check idempotency if payment already confirmed
      if (paymentMethod === "online" && transactionId) {
        const confirmedPayment = await Order.findOne({
          payableTransactionId: transactionId,
          paymentStatus: "Paid",
        });
        if (confirmedPayment) {
          return res.status(200).json({
            message: "Order already created",
            orderId: confirmedPayment._id,
          });
        }
      }

      // Check duplicate invoiceId
      if (invoiceId) {
        const existingInvoice = await Order.findOne({ invoiceId });
        if (existingInvoice) {
          return res.status(200).json({
            message: "Order already exists",
            orderId: existingInvoice._id,
          });
        }
      }

      // Build order data
      const orderData = {
        user: userId,
        items,
        total: req.body.total,
        shippingAddress: user.address,
        proofImageUrl,
        proofPdfUrl,
        paymentMethod,
        paymentStatus:
          incomingPaymentStatus ||
          (paymentMethod === "bank_transfer" ? "Pending" : "Paid"),
        // default status
        status: "Pending",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      if (paymentMethod === "online") {
        orderData.payableTransactionId = transactionId || undefined;
        orderData.payableOrderId = payableOrderId || undefined;
        orderData.invoiceId = invoiceId || undefined;
        if (orderData.paymentStatus === "Paid") {
          orderData.paymentConfirmedAt = new Date();
        }
      }

      if (paymentMethod === "bank_transfer") {
        // Ensure bank transfers are pending until manual verification
        orderData.paymentStatus = "Pending";
      }

      // Create and save order
      const order = new Order(orderData);
      const savedOrder = await order.save();

      // Send order notification email
      try {
        const orderItemsHtml = items
          .map(
            (item) => `
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;">${item.productName || "Product"}</td>
              <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${item.quantity}</td>
              <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">$${item.price.toFixed(2)}</td>
              <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">$${(item.price * item.quantity).toFixed(2)}</td>
            </tr>
          `,
          )
          .join("");

        const mailOptions = {
          from: process.env.SMTP_USER,
          to: "canelaceylonbycinnamoninc@gmail.com",
          subject: `New Order Received - Order #${savedOrder._id}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto;">
              <h2 style="color: #8B4513; border-bottom: 3px solid #8B4513; padding-bottom: 10px;">New Order Notification</h2>
              
              <div style="background: #f9f9f9; padding: 15px; margin: 20px 0; border-radius: 5px;">
                <h3 style="color: #8B4513; margin-top: 0;">Order Details</h3>
                <p><strong>Order ID:</strong> ${savedOrder._id}</p>
                <p><strong>Customer:</strong> ${user.firstName} ${user.lastName}</p>
                <p><strong>Email:</strong> ${user.email}</p>
                <p><strong>Phone:</strong> ${user.contactNo || "N/A"}</p>
                <p><strong>Payment Method:</strong> ${paymentMethod.replace("_", " ").toUpperCase()}</p>
                <p><strong>Payment Status:</strong> <span style="color: ${orderData.paymentStatus === "Paid" ? "#28a745" : "#ffc107"}; font-weight: bold;">${orderData.paymentStatus}</span></p>
                <p><strong>Order Date:</strong> ${new Date(savedOrder.createdAt).toLocaleString()}</p>
              </div>

              <div style="margin: 20px 0;">
                <h3 style="color: #8B4513;">Shipping Address</h3>
                <p style="padding: 10px; background: #f9f9f9; border-left: 4px solid #8B4513;">${user.address}</p>
              </div>

              <div style="margin: 20px 0;">
                <h3 style="color: #8B4513;">Order Items</h3>
                <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
                  <thead>
                    <tr style="background: #8B4513; color: white;">
                      <th style="padding: 10px; text-align: left;">Product</th>
                      <th style="padding: 10px; text-align: center;">Quantity</th>
                      <th style="padding: 10px; text-align: right;">Price</th>
                      <th style="padding: 10px; text-align: right;">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${orderItemsHtml}
                  </tbody>
                  <tfoot>
                    <tr style="background: #f5f5f5; font-weight: bold;">
                      <td colspan="3" style="padding: 10px; text-align: right; border: 1px solid #ddd;">Total:</td>
                      <td style="padding: 10px; text-align: right; border: 1px solid #ddd; color: #8B4513;">$${req.body.total}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              ${
                proofImageUrl || proofPdfUrl
                  ? `
              <div style="margin: 20px 0;">
                <h3 style="color: #8B4513;">Payment Proof</h3>
                <p><a href="${proofImageUrl || proofPdfUrl}" style="color: #8B4513; text-decoration: underline;">View Payment Proof</a></p>
              </div>
              `
                  : ""
              }

              ${
                transactionId
                  ? `
              <div style="margin: 20px 0;">
                <h3 style="color: #8B4513;">Transaction Details</h3>
                <p><strong>Transaction ID:</strong> ${transactionId}</p>
                ${payableOrderId ? `<p><strong>Order ID:</strong> ${payableOrderId}</p>` : ""}
                ${invoiceId ? `<p><strong>Invoice ID:</strong> ${invoiceId}</p>` : ""}
              </div>
              `
                  : ""
              }

              <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 12px;">
                <p>This is an automated notification from Canela Ceylon Online Store</p>
                <p>Please log in to the admin panel to process this order</p>
              </div>
            </div>
          `,
        };

        await transporter.sendMail(mailOptions);
        console.log(
          `Order notification email sent for order ${savedOrder._id}`,
        );
      } catch (emailError) {
        console.error("Failed to send order notification email:", emailError);
        // Try sending to fallback email
        try {
          const fallbackMailOptions = {
            from: process.env.SMTP_USER,
            to: "vimukthideshanpeiris@gmail.com",
            subject: `New Order Received - Order #${savedOrder._id}`,
            html: `
              <div style="font-family: Arial, sans-serif;">
                <h2 style="color: #8B4513;">New Order Notification</h2>
                <p><strong>Order ID:</strong> ${savedOrder._id}</p>
                <p><strong>Customer:</strong> ${user.firstName} ${user.lastName}</p>
                <p><strong>Total:</strong> $${req.body.total}</p>
                <p><strong>Payment Method:</strong> ${paymentMethod}</p>
                <p><strong>Payment Status:</strong> ${orderData.paymentStatus}</p>
                <p>Please check the admin panel for full order details.</p>
                <p style="color: red; font-size: 12px;">Note: This was sent to fallback email as primary email failed.</p>
              </div>
            `,
          };
          await transporter.sendMail(fallbackMailOptions);
          console.log(
            `Order notification sent to fallback email for order ${savedOrder._id}`,
          );
        } catch (fallbackError) {
          console.error("Failed to send to fallback email:", fallbackError);
        }
      }

      // Deduct product quantities
      for (const item of items) {
        await Product.findByIdAndUpdate(
          item.product,
          { $inc: { quantity: -item.quantity } },
          { new: true },
        );
      }

      // Remove ordered items from user's cart
      const productIdsOrdered = items.map((item) => item.product);
      await Cart.updateOne(
        { userId: userId },
        { $pull: { items: { productId: { $in: productIdsOrdered } } } },
      );

      res.status(201).json(savedOrder);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  },
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
      { new: true },
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
