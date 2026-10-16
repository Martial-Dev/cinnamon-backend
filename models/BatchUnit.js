const mongoose = require("mongoose");
const movementSchema = require("./movementSchema");
const { UNIT_STATUSES } = require("./movementSchema");

const Schema = mongoose.Schema;

/**
 * One physical package. Each unit is its own document, so batch size is not
 * limited by MongoDB's 16 MB document cap, scans update one small document,
 * and staff scanning different units never write to the same document.
 */
const batchUnitSchema = new Schema(
  {
    batch: { type: Schema.Types.ObjectId, ref: "Batch", required: true },
    batchId: { type: String, required: true, trim: true },
    unitNumber: { type: Number, required: true, min: 1 },
    qrCode: { type: String, required: true },
    verificationToken: { type: String, match: /^[a-f0-9]{64}$/ },
    qrGeneratedAt: Date,
    verificationCount: { type: Number, default: 0, min: 0 },
    // Snapshot when the unit is sold; checks after a sale are measured from it.
    verificationCountAtSale: { type: Number, min: 0 },
    firstVerifiedAt: Date,
    lastVerifiedAt: Date,
    quantity: { type: Number, required: true, min: 0.001 },
    status: { type: String, enum: UNIT_STATUSES, default: "Queued" },
    assignedShop: { type: String, default: "Unassigned" },
    timestamp: { type: Date, default: Date.now },
    history: { type: [movementSchema], default: [] },
  },
  { timestamps: true },
);

batchUnitSchema.index({ batchId: 1, unitNumber: 1 }, { unique: true });
batchUnitSchema.index({ batchId: 1, status: 1 });
batchUnitSchema.index({ qrCode: 1 }, { unique: true });
batchUnitSchema.index({ verificationToken: 1 }, { unique: true, sparse: true });
// Lets the anchoring job find waiting movements without scanning everything.
batchUnitSchema.index({ "history.anchor.status": 1 });
batchUnitSchema.index({ "history.anchor.root": 1 });

module.exports = mongoose.model("BatchUnit", batchUnitSchema);
