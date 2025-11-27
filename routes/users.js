const express = require("express");
const router = express.Router();
const User = require("../models/User");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const transporter = require("../utils/mailer");

// Debug endpoint to check environment and mailer status
router.get("/debug/config", async (req, res) => {
  try {
    const env = {
      MONGODB_URI: !!process.env.MONGODB_URI,
      JWT_SECRET: !!process.env.JWT_SECRET,
      CLIENT_URL: !!(process.env.CLIENT_URL || process.env.clientUrl),
      EMAIL_FROM: !!process.env.EMAIL_FROM,
      EMAIL_PASSWORD: !!process.env.EMAIL_PASSWORD,
    };

    // Verify transporter using promise-style verify when available
    let mail = { ok: false };
    try {
      if (typeof transporter.verify === "function") {
        await transporter.verify();
        mail.ok = true;
      } else {
        mail.ok = true;
      }
    } catch (verifyErr) {
      mail.ok = false;
      mail.error =
        verifyErr && verifyErr.message ? verifyErr.message : String(verifyErr);
    }

    return res.json({ env, mail });
  } catch (err) {
    console.error("Debug endpoint error:", err);
    res.status(500).json({ error: "Debug endpoint failed" });
  }
});

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
    // Validate environment and configuration early to provide clearer errors
    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET is not set in environment");
      return res
        .status(500)
        .send({ message: "Server configuration error (missing JWT_SECRET)" });
    }

    // Find the user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).send({ message: "User not found" });
    }

    // Generate a JWT token for password recovery
    const token = jwt.sign(
      { userId: user._id, email: user.email },
      process.env.JWT_SECRET,
      {
        expiresIn: "1h",
      }
    );

    // Build client URL safely. Prefer explicit CLIENT_URL env var, fall back to clientUrl or default
    const rawClientUrl =
      process.env.CLIENT_URL ||
      process.env.clientUrl ||
      "http://localhost:4200";
    const clientUrl = String(rawClientUrl).replace(/\/$/, "");
    const recoveryLink = `${clientUrl}/reset-password?token=${token}`;

    const mailOptions = {
      from: process.env.EMAIL_FROM || "canelaceylonbycinnamoninc@gmail.com",
      to: email,
      subject: "Password Recovery",
      text: `Click the following link to recover your password: ${recoveryLink}`,
    };

    // Verify transporter configuration before sending to catch auth errors early
    try {
      if (typeof transporter.verify === "function") {
        await transporter.verify();
      }
    } catch (verifyErr) {
      console.error("Mail transporter verification failed:", verifyErr);
      return res
        .status(500)
        .send({ message: "Email service not configured properly" });
    }

    // Send mail with a small timeout to avoid long-hanging requests
    const sendMailPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const err = new Error("Mail send timeout");
        err.code = "MAIL_TIMEOUT";
        reject(err);
      }, 15000); // 15s timeout

      transporter.sendMail(mailOptions, (error, info) => {
        clearTimeout(timer);
        if (error) return reject(error);
        resolve(info);
      });
    });

    try {
      const info = await sendMailPromise;
      // In development, include the recovery link in the response for easy testing
      const devResponse =
        process.env.NODE_ENV !== "production" ? { recoveryLink } : {};
      return res.send({
        message: "Recovery email sent successfully",
        ...devResponse,
      });
    } catch (sendErr) {
      console.error("Error sending recovery email:", sendErr);
      return res.status(500).send({ message: "Failed to send email" });
    }
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
