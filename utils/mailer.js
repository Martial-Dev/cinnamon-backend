const nodemailer = require("nodemailer");

const emailUser = process.env.EMAIL_FROM || "martialdev2023@gmail.com";
const emailPass = process.env.EMAIL_PASSWORD || "";

let transporter;
if (!emailPass) {
  // Development fallback: use JSON transport so emails are not actually sent
  // but the app can continue to function and you can inspect the message payload.
  console.warn(
    "EMAIL_PASSWORD is not set — using JSON transport for development (no real emails will be sent)."
  );
  transporter = nodemailer.createTransport({ jsonTransport: true });
} else {
  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: emailUser,
      pass: emailPass,
    },
  });
}

module.exports = transporter;
