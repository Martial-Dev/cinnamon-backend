const mongoose = require("mongoose");

const mongoURI = process.env.MONGODB_URI;

const connectDB = async () => {
  try {
    // Configure Mongoose with modern defaults
    mongoose.set("strictQuery", true); // Prepare for v7 default

    console.log("Connecting to MongoDB...");

    await mongoose.connect(mongoURI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
      minPoolSize: 2,
      retryWrites: true,
      w: "majority",
    });

    console.log("✓ MongoDB connected successfully");

    // Connection event listeners
    mongoose.connection.on("disconnected", () => {
      console.warn("⚠ MongoDB disconnected");
    });

    mongoose.connection.on("error", (err) => {
      console.error("✗ MongoDB connection error:", err.message);
    });
  } catch (error) {
    console.error("✗ MongoDB connection failed:", error.message);
    process.exit(1);
  }
};

module.exports = connectDB;
