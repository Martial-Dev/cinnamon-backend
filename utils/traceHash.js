const crypto = require("crypto");

const hashData = (value) =>
  crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");

/**
 * Fingerprint of one unit movement. Field order is part of the format: the
 * same object shape is hashed when a movement is recorded and when it is
 * checked, so never reorder these keys.
 */
const movementHashOf = (batchId, unitNumber, movement) =>
  hashData({
    batchId,
    unitNumber,
    status: movement.status,
    assignedShop: movement.assignedShop,
    timestamp: movement.timestamp,
    notes: movement.notes,
  });

module.exports = { hashData, movementHashOf };
