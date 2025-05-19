const express = require("express");
const nodemailer = require("nodemailer");
const router = express.Router();
const transporter = require("../utils/mailer");

router.post("/", async (req, res) => {
  const { name, email, message } = req.body;

  await transporter.sendMail({
    from: "canelaceylonbycinnamoninc@gmail.com", // always your authenticated email
    to: "canelaceylonbycinnamoninc@gmail.com",
    replyTo: email, // so you can reply to the user's email
    subject: `Message from ${name}`,
    text: message,
  });
  res.status(200).json({ message: 'OK' });
});

module.exports = router;
