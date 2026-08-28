var express = require("express");
var bodyParser = require("body-parser");
var cors = require("cors");
var app = express();
const dotenv = require("dotenv"); // Add this at line 1
dotenv.config();

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(cors({ origin: "*" }));

// Import and initialize database connection
const connectDB = require("./config/db");
connectDB();

// Import route modules
const userRoutes = require("./routes/users.js");
const productRoutes = require("./routes/products.js");
const imageRoutes = require("./routes/image.js");
const invoiceRoutes = require("./routes/invoice.js");
const loginRoutes = require("./routes/login.js");
const cartRoutes = require("./routes/cart.js");
const orderRoutes = require("./routes/order.js");
const orderWebhookRoutes = require("./routes/order_webhook.js");
const paymentRoutes = require("./routes/payments.js");
const reviewRoutes = require("./routes/review.js");
const contactRoutes = require("./routes/contact.js");
const recipeRoutes = require("./routes/recipe.js");
const recruitmentRoutes = require("./routes/recruitment.js");
const supplierRoutes = require("./routes/supplier.js");
const retailerRoutes = require("./routes/retailer.js");
const poRoutes = require("./routes/purchase-order.js");
const paymentNewRoutes = require("./routes/payment.js");
const hashRoutes = require("./routes/hash.js");
const blockchainService = require("./utils/blockchain");
const SupplierRegistryABI =
  require("../blockchain/artifacts/contracts/SupplierRegistry.sol/SupplierRegistry.json").abi;

const checkAuth = require("./middleware/check-auth.js");

// Use route modules
app.use("/api/users", userRoutes);
app.use("/api/login", loginRoutes);
app.use("/api/products", productRoutes);
app.use("/uploads", checkAuth, imageRoutes);
app.use("/api/invoice", checkAuth, invoiceRoutes);
app.use("/api/cart", checkAuth, cartRoutes);
app.use("/api/payments", paymentRoutes);
// Expose webhook without auth BEFORE protecting other order routes
app.use("/api/orders", orderWebhookRoutes);
app.use("/api/orders", checkAuth, orderRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/recruitment", recruitmentRoutes);
app.use("/api/recipes", recipeRoutes);
app.use("/api/suppliers", supplierRoutes);
app.use("/api/retailers", retailerRoutes);

// New endpoints for purchase orders, payments (PO-related), and hashing/proofs
app.use("/api/purchase-order", poRoutes);
app.use("/api/payment", paymentNewRoutes);
app.use("/api/hash", hashRoutes);

const useRealBlockchain = String(process.env.USE_REAL_BLOCKCHAIN).trim().toLowerCase() === "true";
if (useRealBlockchain) {
  blockchainService
    .initialize(
      process.env.BLOCKCHAIN_RPC_URL?.trim(),
      process.env.BLOCKCHAIN_PRIVATE_KEY?.trim(),
      process.env.BLOCKCHAIN_CONTRACT_ADDRESS?.trim(),
      SupplierRegistryABI,
    )
    .then(() => {
      console.log("Blockchain service initialized with real contract");
    })
    .catch((err) => {
      console.warn("Failed to initialize blockchain service:", err.message);
    });
} else {
  console.log("USE_REAL_BLOCKCHAIN is disabled or invalid; blockchain service not initialized.");
}

// Start server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
