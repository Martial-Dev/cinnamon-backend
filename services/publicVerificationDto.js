const {
  activityCountOf,
  hasUnusualActivity,
} = require("../utils/publicVerification");

// Unit movements shown to customers. "Queued" (record created) is an internal
// system step and is deliberately absent. Warehouse names are never shown;
// retailer names are, because that is where the customer can buy the product.
const MOVEMENT_STAGES = Object.freeze({
  Packed: () => ({ stage: "Packed", detail: "Packed by Canela Ceylon." }),
  Stored: () => ({
    stage: "Stored",
    detail: "Kept in Canela Ceylon storage before distribution.",
  }),
  Assigned: (shop) => ({
    stage: "Dispatched",
    detail: shop ? `Sent to ${shop}.` : "Sent to a retail partner.",
  }),
  Delivered: (shop) => ({
    stage: "Available at retailer",
    detail: shop ? `Received at ${shop}.` : "Received by a retail partner.",
  }),
  Sold: (shop) => ({
    stage: "Sold",
    detail: shop ? `Sold at ${shop}.` : "Sold by a retail partner.",
  }),
});

// Tie-break for events recorded at the same instant.
const STAGE_ORDER = [
  "Harvested",
  "Received by Canela Ceylon",
  "Packed",
  "Stored",
  "Dispatched",
  "Available at retailer",
  "Sold",
];

const DEFAULT_RECALL_MESSAGE =
  "This product has been recalled. Please do not use it and contact Canela Ceylon.";

const publicShopName = (event) => {
  const shop = String(event.assignedShop || "").trim();
  if (!shop || shop.toLowerCase() === "unassigned") return null;
  const city = String(event.retailerCity || "").trim();
  // Skip the town only when the name already ends with it ("Spice Hut, Galle").
  return city && !shop.toLowerCase().endsWith(city.toLowerCase())
    ? `${shop}, ${city}`
    : shop;
};

/** Short "where" phrase, most specific public part first. */
const describePlace = (location) => {
  if (!location) return null;
  const parts = [
    location.village,
    location.district && `${location.district.replace(/\s+district$/i, "")} District`,
    location.province,
  ].filter(Boolean);
  return parts.slice(0, 2).join(", ") || location.country;
};

const getSupplierLocation = (supplier) => {
  if (!supplier?.country) return null;
  const location = { country: supplier.country };
  if (supplier.publicLocationPrecision === "province" && supplier.province) {
    location.province = supplier.province;
  }
  if (
    ["district", "village"].includes(supplier.publicLocationPrecision) &&
    supplier.district
  ) {
    location.district = supplier.district;
    if (supplier.province) location.province = supplier.province;
  }
  if (supplier.publicLocationPrecision === "village" && supplier.village) {
    location.village = supplier.village;
    if (supplier.province) location.province = supplier.province;
  }
  // "exact" is never published; it falls back to country only.
  return location;
};

const getPublicProducer = (supplier) => {
  if (supplier?.publicDisplay === "producerId" && supplier.publicProducerId) {
    return `Producer ID: ${supplier.publicProducerId}`;
  }
  if (
    supplier?.publicIdentificationConsent &&
    ["firstName", "fullName"].includes(supplier.publicDisplay) &&
    supplier.publicName?.trim()
  ) {
    const name = supplier.publicName.trim();
    return supplier.publicDisplay === "firstName" ? name.split(/\s+/)[0] : name;
  }
  return "Canela Ceylon supply partner";
};

const getPublicVerification = (result) => {
  if (result.status === "VERIFIED") {
    return {
      state: "verified",
      label: "Verified record",
      message:
        "The batch traceability record for this product was verified against the blockchain.",
      blockchainVerified: true,
    };
  }
  if (
    result.reason === "DATABASE_HASH_MISMATCH" ||
    result.reason === "ONCHAIN_HASH_MISMATCH"
  ) {
    return {
      state: "attention",
      label: "Verification needs attention",
      message:
        "We could not validate this product record. Please contact Canela Ceylon.",
      blockchainVerified: false,
    };
  }
  if (result.reason === "CHAIN_QUERY_FAILED") {
    return {
      state: "available",
      label: "Traceability record available",
      message:
        "Blockchain verification is temporarily unavailable. The product journey information is still available.",
      blockchainVerified: false,
    };
  }
  if (result.status === "PENDING") {
    return {
      state: "available",
      label: "Traceability record available",
      message: "Blockchain verification for this product is pending.",
      blockchainVerified: false,
    };
  }
  if (result.reason === "RECORDING_FAILED") {
    return {
      state: "available",
      label: "Traceability record available",
      message:
        "Blockchain verification is temporarily unavailable. The product journey information is still available.",
      blockchainVerified: false,
    };
  }
  return {
    state: "available",
    label: "Traceability record available",
    message:
      "Supply-chain information is available for this product. Blockchain verification is currently being introduced.",
    blockchainVerified: false,
  };
};

const isValidDate = (value) =>
  value !== undefined &&
  value !== null &&
  !Number.isNaN(new Date(value).getTime());

const toPublicVerificationDto = ({
  batch,
  unit,
  supplierRecords,
  purchaseOrderRecords = new Map(),
  blockchain,
  // Map from index in unit.history to a per-step result ("verified", ...).
  movementSteps = new Map(),
  env = process.env,
}) => {
  const suppliers = (batch.sourceMaterials || [])
    .map((source) => supplierRecords.get(String(source.supplierId)))
    .filter(Boolean);
  const locations = Array.from(
    new Map(
      suppliers
        .map(getSupplierLocation)
        .filter(Boolean)
        .map((location) => [JSON.stringify(location), location]),
    ).values(),
  );
  const grades = Array.from(
    new Set(
      (batch.sourceMaterials || [])
        .map((source) => source.grade?.trim())
        .filter(Boolean),
    ),
  );
  // Only recorded events are shown; a missing stage is omitted, never inferred.
  const sourceEvents = (batch.sourceMaterials || []).flatMap((source) => {
    const purchaseOrder = purchaseOrderRecords.get(
      String(source.purchaseOrderId),
    );
    const harvestedOn =
      purchaseOrder?.items?.[source.purchaseOrderItemIndex]?.harvestedOn;
    const place = describePlace(
      getSupplierLocation(supplierRecords.get(String(source.supplierId))),
    );
    return [
      ...(isValidDate(harvestedOn)
        ? [
            {
              stage: "Harvested",
              detail: place
                ? `Cinnamon harvested in ${place}.`
                : "Cinnamon harvested by a Canela Ceylon supply partner.",
              date: harvestedOn,
            },
          ]
        : []),
      ...(isValidDate(purchaseOrder?.receivedAt)
        ? [
            {
              stage: "Received by Canela Ceylon",
              detail: "Delivered by the supply partner to Canela Ceylon.",
              date: purchaseOrder.receivedAt,
            },
          ]
        : []),
    ];
  });
  const packedEvent = isValidDate(batch.producedOn)
    ? [
        {
          stage: "Packed",
          detail: "Packed into individual packages by Canela Ceylon.",
          date: batch.producedOn,
          // The production date is part of the anchored batch fingerprint.
          ...(blockchain?.status === "VERIFIED" ? { verified: true } : {}),
        },
      ]
    : [];
  const movementEvents = (unit.history || [])
    .map((event, index) => ({ event, index }))
    .filter(
      ({ event }) =>
        MOVEMENT_STAGES[event.status] &&
        isValidDate(event.timestamp) &&
        !event.voidedAt &&
        // The batch production date already represents packing.
        !(event.status === "Packed" && packedEvent.length),
    )
    .map(({ event, index }) => ({
      ...MOVEMENT_STAGES[event.status](publicShopName(event)),
      date: event.timestamp,
      ...(movementSteps.get(index) === "verified" ? { verified: true } : {}),
    }));
  const journeyTampered = Array.from(movementSteps.values()).includes("tampered");

  const journey = Array.from(
    new Map(
      [...sourceEvents, ...packedEvent, ...movementEvents].map((event) => {
        const entry = { ...event, date: new Date(event.date).toISOString() };
        return [`${entry.stage}|${entry.date}|${entry.detail}`, entry];
      }),
    ).values(),
  ).sort(
    (left, right) =>
      Date.parse(left.date) - Date.parse(right.date) ||
      STAGE_ORDER.indexOf(left.stage) - STAGE_ORDER.indexOf(right.stage),
  );
  const verificationCount = Number(unit.verificationCount || 0);
  const recall = batch.recall?.active
    ? {
        active: true,
        message: batch.recall.publicMessage?.trim() || DEFAULT_RECALL_MESSAGE,
        date: isValidDate(batch.recall.recalledAt)
          ? new Date(batch.recall.recalledAt).toISOString()
          : null,
      }
    : null;

  return {
    recordFound: true,
    product: {
      brand: "Canela Ceylon",
      name: batch.productName,
      ...(grades.length === 1 ? { grade: grades[0] } : {}),
      ...(grades.length > 1 ? { grades } : {}),
      netWeight: `${unit.quantity} ${batch.quantityUnit}`,
    },
    origin: {
      locations,
      producers: Array.from(new Set(suppliers.map(getPublicProducer))),
    },
    journey,
    recall,
    verification: journeyTampered
      ? {
          state: "attention",
          label: "Verification needs attention",
          message:
            "Part of this product's journey record could not be validated. Please contact Canela Ceylon.",
          blockchainVerified: false,
        }
      : getPublicVerification(blockchain),
    scanHistory: {
      firstVerifiedAt: isValidDate(unit.firstVerifiedAt)
        ? new Date(unit.firstVerifiedAt).toISOString()
        : null,
      verificationCount,
      unusualActivity: hasUnusualActivity(activityCountOf(unit), env),
    },
  };
};

module.exports = { toPublicVerificationDto };
