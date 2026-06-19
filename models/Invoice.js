const mongoose = require("mongoose");
const partySchema = require("./partySchema");
const paymentTermsSchema = require("./paymentTermsSchema");
const invoiceItemSchema = require("./InvoiceItemSchema");
const blockchainRefSchema = require("./blockchainRefSchema");

const invoiceSchema = new mongoose.Schema(
  {
    documentId: { type: String, index: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
    date: { type: Date, default: Date.now },
    dueDate: { type: Date },
    items: { type: [invoiceItemSchema], default: [] },
    total: { type: Number, default: 0 },
    paymentStatus: {
      type: String,
      enum: ["unpaid", "paid", "pending", "failed"],
      default: "unpaid",
    },
    type: {
      type: String,
      enum: ["PROFORMA", "COMMERCIAL"],
      default: "PROFORMA",
    },
    currency: { type: String, default: "USD" },
    incoterm: { type: String },
    incotermNamedPlace: { type: String },
    portOfLoading: { type: String },
    portOfDischarge: { type: String },
    seller: { type: partySchema },
    buyer: { type: partySchema },
    paymentTerms: { type: paymentTermsSchema },
    amountInWords: { type: String },
    countryOfOrigin: { type: String },
    blockchainRef: { type: blockchainRefSchema },
    pdfUrl: { type: String },
    createdBy: { type: String },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Invoice", invoiceSchema);
