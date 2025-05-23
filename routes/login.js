const express = require("express");
const router = express.Router();
const loginController = require("../controllers/loginController");

// Route for user login
router.post("/", loginController.loginUser);

module.exports = router;