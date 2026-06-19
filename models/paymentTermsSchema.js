const mongoose = require("mongoose");

const paymentTermsSchema = new mongoose.Schema(
  {
    term: String,
    dueDays: Number,
    notes: String,
  },
  { _id: false },
);

module.exports = paymentTermsSchema;
