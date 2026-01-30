const nodemailer = require("nodemailer");

const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

let transporter = null;

if (SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465, // secure for 465
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });
  console.log("✅ SMTP configured");
} else {
  console.warn("⚠️ SMTP not configured - email functionality disabled");
}

module.exports = transporter;
