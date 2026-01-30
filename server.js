var express = require("express");
var mongoose = require("mongoose");
var bodyParser = require("body-parser");
var cors = require("cors");
var app = express();
var dotenv = require("dotenv");

dotenv.config();

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(cors({ origin: "*" }));

console.log("MONGODB_URI:", process.env.MONGODB_URI);
// Database connection
mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("MongoDB connected successfully"))
  .catch((err) => console.error("MongoDB connection error:", err));

// Import route modules
const userRoutes = require("./routes/users.js");
const productRoutes = require("./routes/products.js");
const imageRoutes = require("./routes/image.js");
const invoiceRoutes = require("./routes/invoice.js");
const loginRoutes = require("./routes/login.js");
const cartRoutes = require("./routes/cart.js");
const orderRoutes = require("./routes/order.js");
const reviewRoutes = require("./routes/review.js");
const contactRoutes = require("./routes/contact.js");
const recipeRoutes = require("./routes/recipe.js");
const chatRoutes = require("./routes/chat.js");

const checkAuth = require("./middleware/check-auth.js");

// Use route modules
app.use("/api/users", userRoutes);
app.use("/api/login", loginRoutes);
app.use("/api/products", productRoutes);
app.use("/uploads", checkAuth, imageRoutes);
app.use("/api/invoice", checkAuth, invoiceRoutes);
app.use("/api/cart", checkAuth, cartRoutes);
app.use("/api/orders", checkAuth, orderRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/recipes", recipeRoutes);
app.use("/api/chat", chatRoutes);

// Start server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
