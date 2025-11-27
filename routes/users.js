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
  const { email } = req.body || {};

  if (!email || typeof email !== "string") {
    return res.status(400).json({ message: "Invalid request" });
  }

  const { JWT_SECRET, CLIENT_URL, EMAIL_FROM } = process.env;

  if (!JWT_SECRET || !CLIENT_URL || !EMAIL_FROM) {
    console.error("Missing required env vars for recover-password");
    return res.status(500).json({ message: "Server configuration error" });
  }

  try {
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(200).json({
        message: "If an account with that email exists, an email will be sent.",
      });
    }

    const token = jwt.sign({ userId: user._id }, JWT_SECRET, {
      expiresIn: "1h",
    });

    const clientUrl = CLIENT_URL.replace(/\/$/, "");
    const recoveryLink = `${clientUrl}/reset-password?token=${token}`;

    const mailOptions = {
      from: EMAIL_FROM,
      to: email,
      subject: "Password Recovery",
      text: `Use this link to reset your password: ${recoveryLink}`,
      html: `<p>Use this link to reset your password:</p><p><a href="${recoveryLink}">${recoveryLink}</a></p>`,
    };

    try {
      if (typeof transporter.verify === "function") {
        await transporter.verify();
      }
    } catch (err) {
      console.error("Mail transporter verification failed:", err);
      return res.status(503).json({ message: "Email service unavailable" });
    }

    const sendMailPromise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("MAIL_TIMEOUT")), 15000);

      transporter.sendMail(mailOptions, (error, info) => {
        clearTimeout(timer);
        if (error) reject(error);
        else resolve(info);
      });
    });

    try {
      await sendMailPromise;

      console.info("Password recovery email sent:", {
        to: email,
      });

      return res.status(200).json({
        message: "If an account with that email exists, an email will be sent.",
      });
    } catch (err) {
      console.error("Error sending recovery email:", err);
      return res.status(503).json({ message: "Email service unavailable" });
    }
  } catch (err) {
    console.error("Recover-password error:", err);
    return res.status(500).json({ message: "Server error" });
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
