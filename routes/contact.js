const express = require("express");
const nodemailer = require("nodemailer");
const router = express.Router();
const transporter = require("../utils/mailer");
const upload = require("../middleware/Multer");

router.post("/", async (req, res) => {
  const { name, email, message } = req.body;

  await transporter.sendMail({
    from: "canelaceylonbycinnamoninc@gmail.com", // always your authenticated email
    to: "canelaceylonbycinnamoninc@gmail.com",
    replyTo: email, // so you can reply to the user's email
    subject: `Message from ${name}`,
    text: message,
  });
  res.status(200).json({ message: "OK" });
});

router.post("/collaborate", upload.single("file"), async (req, res) => {
  const { name, email, country, collabType, website, message } = req.body;
  const file = req.file;

  // Email to Canela Ceylon
  let mailOptions = {
    from: "canelaceylonbycinnamoninc@gmail.com",
    to: "canelaceylonbycinnamoninc@gmail.com",
    replyTo: email,
    subject: `Collaboration Request from ${name}`,
    text: `
      Name: ${name}
      Email: ${email}
      Country: ${country}
      Collaboration Type: ${collabType}
      Website/Social: ${website}
      Message: ${message}
    `,
    attachments: file
      ? [
          {
            filename: file.originalname,
            content: file.buffer,
          },
        ]
      : [],
  };

  try {
    await transporter.sendMail(mailOptions);

    // Auto-reply to the user
    await transporter.sendMail({
      from: "canelaceylonbycinnamoninc@gmail.com",
      to: email,
      subject: "Thank you for your collaboration interest!",
      text: `Dear ${name},

      Thank you for reaching out to Canela Ceylon by Cinnamon Inc. We have received your collaboration request and will get back to you soon.

      Best regards,
      Canela Ceylon Team
      `,
    });

    res
      .status(200)
      .json({ message: "Collaboration request sent successfully." });
  } catch (err) {
    res
      .status(500)
      .json({ error: "Failed to send email. Please try again later." });
  }
});

module.exports = router;
