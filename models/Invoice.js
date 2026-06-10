const mongoose = require("mongoose");

const InvoiceItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
  productName: { type: String, required: true },
  quantity: { type: Number, required: true },
  price: { type: Number, required: true },
  lineNumber: { type: Number },
  hsCode: { type: String },
  quantityUnit: { type: String },
  netWeight: { type: Number },
  grossWeight: { type: Number },
  grade: { type: String },
  batchId: { type: String },
  lineTotal: { type: Number, required: true },
});

const blockchainRefSchema = new mongoose.Schema(
  {
    txId: String,
    network: String,
    explorerUrl: String,
  },
  { _id: false },
);

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

const paymentTermsSchema = new mongoose.Schema(
  {
    term: String,
    dueDays: Number,
    notes: String,
  },
  { _id: false },
);

const invoiceSchema = new mongoose.Schema(
  {
    documentId: { type: String, index: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: "Order" },
    date: { type: Date, default: Date.now },
    dueDate: { type: Date },
    items: { type: [InvoiceItemSchema], default: [] },
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
