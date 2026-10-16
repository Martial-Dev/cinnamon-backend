// Moves units from inside batch documents into the `batchunits` collection,
// so a batch can have any number of units without reaching MongoDB's 16 MB
// document limit.
//
//   node scripts/migrate-units-to-collection.js            (dry run)
//   node scripts/migrate-units-to-collection.js --apply
//   node scripts/migrate-units-to-collection.js --apply --force   (also batches whose hash does not match)
//
// For each batch it recomputes the batch fingerprint from the embedded units
// and compares it with the stored one before moving anything. The embedded
// copy is removed only after every unit is confirmed in the new collection.
// Safe to run more than once.
require("dotenv").config();
const crypto = require("crypto");
const mongoose = require("mongoose");

const planBatch = (batch, existingUnitNumbers, calculateHash) => {
  const units = batch.units || [];
  const calculatedHash = calculateHash(batch, units);
  const missing = units.filter((unit) => !existingUnitNumbers.has(unit.unitNumber));
  return {
    batchId: batch.batchId,
    units: units.length,
    alreadyMoved: units.length - missing.length,
    toMove: missing.length,
    tokensToIssue: missing.filter((unit) => !unit.verificationToken).length,
    hashMatches: !batch.dataHash || calculatedHash === batch.dataHash,
    missing,
  };
};

const toUnitDocument = (batch, unit, now) => ({
  ...unit,
  batch: batch._id,
  batchId: batch.batchId,
  verificationToken: unit.verificationToken || crypto.randomBytes(32).toString("hex"),
  qrGeneratedAt: unit.qrGeneratedAt || now,
});

const main = async () => {
  const apply = process.argv.includes("--apply");
  const force = process.argv.includes("--force");
  const Batch = require("../models/Batch");
  const BatchUnit = require("../models/BatchUnit");
  const batchService = require("../services/batchService");

  await mongoose.connect(process.env.MONGODB_URI);
  try {
    if (apply) {
      await Batch.dropLegacyUnitIndexes();
      await BatchUnit.syncIndexes();
    }
    // Read raw documents: the Batch model no longer has a `units` field.
    const batches = await Batch.collection
      .find({ "units.0": { $exists: true } })
      .toArray();
    if (!batches.length) {
      console.log("Nothing to migrate: no batch stores units inside it.");
      return;
    }

    let moved = 0;
    for (const batch of batches) {
      const existing = await BatchUnit.find({ batchId: batch.batchId })
        .select("unitNumber")
        .lean();
      const plan = planBatch(
        batch,
        new Set(existing.map((unit) => unit.unitNumber)),
        (data, units) => batchService.calculateHash(data, units),
      );
      console.log(
        `${plan.batchId}: ${plan.units} units, ${plan.toMove} to move, ` +
          `${plan.alreadyMoved} already moved, ${plan.tokensToIssue} need tokens, ` +
          `fingerprint ${plan.hashMatches ? "matches" : "DOES NOT MATCH"}`,
      );
      if (!plan.hashMatches && !force) {
        console.log("  Skipped. Investigate the mismatch, or re-run with --force.");
        continue;
      }
      if (!apply) continue;

      const now = new Date();
      if (plan.missing.length) {
        await BatchUnit.insertMany(
          plan.missing.map((unit) => toUnitDocument(batch, unit, now)),
          { ordered: false },
        );
      }
      const count = await BatchUnit.countDocuments({ batchId: batch.batchId });
      if (count !== plan.units) {
        console.log(`  Stopped: expected ${plan.units} unit documents, found ${count}. Batch left unchanged.`);
        continue;
      }
      await Batch.collection.updateOne({ _id: batch._id }, { $unset: { units: "" } });
      moved += 1;
      console.log("  Moved.");
    }
    console.log(apply ? `Done. ${moved} batch(es) migrated.` : "Dry run only. Re-run with --apply to migrate.");
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

module.exports = { planBatch, toUnitDocument };
