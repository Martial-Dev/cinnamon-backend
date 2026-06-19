const mongoose = require("mongoose");

const partySchema = new mongoose.Schema(
  {
    name: String,
    address: String,
    contact: String,
    email: String,
    taxId: String,
  },
  { _id: false },
);

module.exports = partySchema;