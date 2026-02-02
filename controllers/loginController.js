const User = require("../models/User");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

exports.loginUser = async (req, res) => {
  const { username, password } = req.body;
  console.log("Login attempt with username:", username);
  try {
    const user = await User.findOne({ userName: username });
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      {
        expiresIn: "1h",
      }
    );

    res.json({
      auth: true,
      token,
      userId: user._id,
      role: user.role,
      expiresIn: 3600,
      email: user.email,
      phone: user.contactNo || user.phone || "",
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      userName: user.userName,
    });
    console.log(res);
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Server error" });
  }
};
