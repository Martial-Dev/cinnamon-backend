const mailer = require("../utils/mailer");

class NotificationService {
  async sendPOToSupplier(po, supplierEmail) {
    try {
      await mailer.sendMail({
        to: supplierEmail,
        subject: `Purchase Order ${po._id}`,
        text: `You have a new purchase order: ${po._id}`,
      });
      return true;
    } catch (err) {
      console.warn("Failed to send PO email", err.message);
      return false;
    }
  }

  async sendPaymentReminder(po, supplierEmail) {
    try {
      await mailer.sendMail({
        to: supplierEmail,
        subject: `Payment reminder for PO ${po._id}`,
        text: `Please settle payment for PO ${po._id}`,
      });
      return true;
    } catch (err) {
      console.warn("Failed to send reminder", err.message);
      return false;
    }
  }
}

module.exports = new NotificationService();
