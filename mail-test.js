const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_FROM || "canelaceylonbycinnamoninc@gmail.com",
    pass: process.env.EMAIL_PASSWORD || "",
  },
});

transporter.verify((err, success) => {
  if (err) {
    console.error("transporter.verify error:", err);
    process.exit(1);
  }
  console.log("transporter OK");
  process.exit(0);
});
