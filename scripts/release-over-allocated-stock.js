// Returns cinnamon that a batch reserved but does not use to its purchase
// order, so it shows up again as available stock.
//
//   node scripts/release-over-allocated-stock.js B-1003           (dry run)
//   node scripts/release-over-allocated-stock.js B-1003 --apply
//
// The batch's source quantities are part of its integrity hash, so the hash is
// recalculated. Batches already anchored on chain are refused: changing them
// would make their blockchain check fail.
require("dotenv").config();
const mongoose = require("mongoose");

const MASS_TOLERANCE_GRAMS = 0.01;
const round = (value) => Number(value.toFixed(6));

/** Works out how much to give back from each source, last source first. */
const planRelease = (batch, massToGrams) => {
  // Output plus any declared processing loss is what the batch really used.
  const producedGrams =
    massToGrams(batch.totalUnits * batch.quantityPerUnit, batch.quantityUnit) /
    (1 - Number(batch.processingLossPercent || 0) / 100);
  const sourcedGrams = batch.sourceMaterials.reduce(
    (sum, source) => sum + massToGrams(source.quantity, source.unit),
    0,
  );
  let excessGrams = sourcedGrams - producedGrams;
  if (excessGrams <= MASS_TOLERANCE_GRAMS) return [];

  const releases = [];
  for (let index = batch.sourceMaterials.length - 1; index >= 0; index -= 1) {
    if (excessGrams <= MASS_TOLERANCE_GRAMS) break;
    const source = batch.sourceMaterials[index];
    const gramsPerUnit = massToGrams(1, source.unit);
    const releaseGrams = Math.min(
      excessGrams,
      source.quantity * gramsPerUnit,
    );
    const release = round(releaseGrams / gramsPerUnit);
    if (release <= 0) continue;
    releases.push({
      sourceIndex: index,
      purchaseOrderId: String(source.purchaseOrderId),
      itemIndex: source.purchaseOrderItemIndex,
      unit: source.unit,
      from: source.quantity,
      to: round(source.quantity - release),
      release,
    });
    excessGrams -= releaseGrams;
  }
  return releases;
};

const main = async () => {
  const [batchId, flag] = process.argv.slice(2);
  if (!batchId) {
    console.error("Usage: node scripts/release-over-allocated-stock.js <batchId> [--apply]");
    process.exit(1);
  }
  const apply = flag === "--apply";
  const Batch = require("../models/Batch");
  const PurchaseOrder = require("../models/PurchaseOrder");
  const batchService = require("../services/batchService");

  await mongoose.connect(process.env.MONGODB_URI);
  try {
    const batch = await Batch.findOne({ batchId });
    if (!batch) throw new Error(`Batch ${batchId} not found.`);
    const raw = await Batch.collection.findOne({ batchId }, { projection: { units: 1 } });
    if (raw?.units?.length) {
      throw new Error(
        "Run scripts/migrate-units-to-collection.js --apply first, so the batch fingerprint is calculated from the unit collection.",
      );
    }
    if (["recorded", "pending"].includes(batch.blockchainRef?.status)) {
      throw new Error(
        `Batch ${batchId} is anchored on chain (${batch.blockchainRef.status}); its sources cannot be changed.`,
      );
    }

    const releases = planRelease(batch, batchService.massToGrams);
    if (releases.length === 0) {
      console.log(`Batch ${batchId} does not hold more cinnamon than it uses.`);
      return;
    }
    for (const r of releases) {
      console.log(
        `PO ${r.purchaseOrderId} line ${r.itemIndex}: ${r.from} → ${r.to} ${r.unit} (release ${r.release} ${r.unit})`,
      );
    }
    if (!apply) {
      console.log("Dry run only. Re-run with --apply to save.");
      return;
    }

    for (const r of releases) {
      const purchaseOrder = await PurchaseOrder.findById(r.purchaseOrderId);
      const item = purchaseOrder?.items?.[r.itemIndex];
      const allocation = item?.allocations?.find((a) => a.batchId === batchId);
      if (!item || !allocation) {
        throw new Error(`PO ${r.purchaseOrderId} line ${r.itemIndex} has no allocation for ${batchId}.`);
      }
      item.allocatedQuantity = round(Math.max(item.allocatedQuantity - r.release, 0));
      allocation.quantity = round(allocation.quantity - r.release);
      await purchaseOrder.save();
      batch.sourceMaterials[r.sourceIndex].quantity = r.to;
    }
    batch.dataHash = await batchService.calculateStoredHash(batch.toObject());
    await batch.save();
    console.log(`Released. Batch ${batchId} hash recalculated.`);
  } finally {
    await mongoose.disconnect();
  }
};

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { planRelease };
