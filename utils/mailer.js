const sgMail = require('@sendgrid/mail');

const apiKey = process.env.EMAIL_PASSWORD;
if (!apiKey) {
  throw new Error("EMAIL_PASSWORD (SendGrid API key) is not set");
}

sgMail.setApiKey(apiKey);

// Create a transporter-like object for compatibility
const transporter = {
  sendMail: async (mailOptions) => {
    const msg = {
      to: mailOptions.to,
      from: mailOptions.from,
      subject: mailOptions.subject,
      text: mailOptions.text,
      html: mailOptions.html,
    };

    try {
      const result = await sgMail.send(msg);
      return { messageId: result[0].headers['x-message-id'] };
    } catch (error) {
      throw new Error(`SendGrid error: ${error.message}`);
    }
  },
  // Mock verify for compatibility
  verify: async () => {
    // SendGrid API doesn't have a direct verify, but we can check if API key works
    try {
      await sgMail.send({
        to: 'test@example.com', // dummy
        from: process.env.EMAIL_FROM || 'test@example.com',
        subject: 'Verify',
        text: 'Verify',
        mail_settings: {
          sandbox_mode: {
            enable: true, // SendGrid sandbox mode for testing
          },
        },
      });
      return true;
    } catch (error) {
      throw new Error(`Verification failed: ${error.message}`);
    }
  },
};

module.exports = transporter;
