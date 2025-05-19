const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "canelaceylonbycinnamoninc@gmail.com",
    pass: process.env.EMAIL_PASSWORD,
  },
});

module.exports = transporter;