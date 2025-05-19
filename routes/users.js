const express = require("express");
const router = express.Router();
const User = require("../models/User");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const transporter = require("../utils/mailer");

// Create a new user
router.post("/", async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      userName,
      password,
      address,
      postalCode,
      contactNo,
    } = req.body;

    // Check for required fields
    if (!firstName || !lastName || !email || !userName || !password) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Check if user already exists by email or username
    const existingUser = await User.findOne({ $or: [{ email }, { userName }] });
    if (existingUser) {
      return res
        .status(409)
        .json({ error: "User with this email or username already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({
      firstName,
      lastName,
      email,
      userName,
      password: hashedPassword,
      address,
      postalCode,
      contactNo,
    });

    const savedUser = await newUser.save();
    res
      .status(201)
      .json({ message: "User added successfully", user_id: savedUser._id });
  } catch (err) {
    console.error("User creation error:", err); // Add this line
    if (err.name === "ValidationError") {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: "Internal server error" });
  }
});

// Get a specific user by ID
router.get("/:id", async (req, res) => {
  const userId = req.params.id;

  try {
    const user = await User.findById(userId).select("-password"); // Exclude password from response
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update user details
router.put("/:id", async (req, res) => {
  const userId = req.params.id;
  const updates = req.body;

  try {
    const updatedUser = await User.findByIdAndUpdate(userId, updates, {
      new: true,
    });
    if (!updatedUser) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json(updatedUser);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a user
router.delete("/:id", async (req, res) => {
  const userId = req.params.id;

  try {
    const deletedUser = await User.findByIdAndDelete(userId);
    if (!deletedUser) {
      return res.status(404).json({ message: "User not found" });
    }
    res.json({ message: "User deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


//recover password
router.post("/recover-password", async (req, res) => {
  const { email } = req.body;

  try {
    // Use findOne instead of find and handle the promise correctly
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).send({ message: "User not found" });
    }

    // Generate a JWT token for password recovery
    const token = jwt.sign(
      { userId: user._id, email: user.email }, // Payload
      process.env.JWT_SECRET, // Secret
      { expiresIn: "1h" } // Expiration time
    );

    const recoveryLink = `http://localhost:${process.env.clientUrl}/reset-password?token=${token}`;

    const mailOptions = {
      from: "canelaceylonbycinnamoninc@gmail.com",
      to: email,
      subject: "Password Recovery",
      text: `Click the following link to recover your password: ${recoveryLink}`,
    };

    transporter.sendMail(mailOptions, (error) => {
      if (error) {
        console.error(error);
        return res.status(500).send({ message: "Failed to send email" });
      }
      res.send({ message: "Recovery email sent successfully" });
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: "Server error" });
  }
});
// Reset password

router.post("/reset-password", async (req, res) => {
  const { token, password } = req.body;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.status(404).send({ message: "User not found" });
    }

    // Hash the new password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Update the password
    await User.updateOne(
      { _id: user._id },
      { $set: { password: hashedPassword } }
    );

    res.send({ message: "Password reset successfully" });
  } catch (error) {
    console.error(error);
    res.status(400).send({ message: "Invalid or expired token" });
  }
});

module.exports = router;
