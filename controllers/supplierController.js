const Supplier = require("../models/Supplier");
const crypto = require("crypto");

// Generate a blockchain-style hash of supplier data
const generateSupplierHash = (supplier) => {
  const dataString = JSON.stringify({
    name: supplier.supplierName,
    email: supplier.email,
    country: supplier.country,
    products: supplier.products,
    timestamp: new Date().toISOString(),
  });
  return crypto.createHash("sha256").update(dataString).digest("hex");
};

exports.createSupplier = async (req, res) => {
  try {
    const supplierData = req.body;

    // Generate blockchain hash
    const hash = generateSupplierHash(supplierData);
    supplierData.blockchainRef = {
      hash,
      network: "pending", // Mark as pending until verified
      recordedAt: new Date(),
    };

    // Set initial verification status
    supplierData.verification = {
      status: "PENDING",
      verificationDate: null,
    };

    supplierData.createdBy = req.user?.id || "system";

    const newSupplier = new Supplier(supplierData);
    const savedSupplier = await newSupplier.save();

    res.status(201).json({
      success: true,
      message: "Supplier created. Awaiting verification.",
      data: savedSupplier,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

exports.getSuppliers = async (req, res) => {
  try {
    const { status, country, search } = req.query;
    let filter = {};

    if (status) filter["verification.status"] = status;
    if (country) filter.country = country;
    if (search) {
      filter.$or = [
        { supplierName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const suppliers = await Supplier.find(filter).select("-bankAccount");
    res.status(200).json({
      success: true,
      count: suppliers.length,
      data: suppliers,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

exports.getSupplierById = async (req, res) => {
  try {
    const supplier = await Supplier.findById(req.params.id);
    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: "Supplier not found",
      });
    }
    res.status(200).json({
      success: true,
      data: supplier,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

exports.updateSupplier = async (req, res) => {
  try {
    const supplierId = req.params.id;
    const updateData = req.body;

    // Regenerate hash if data changed
    const supplier = await Supplier.findById(supplierId);
    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: "Supplier not found",
      });
    }

    Object.assign(supplier, updateData);

    // Regenerate hash for updated data
    supplier.blockchainRef = {
      ...supplier.blockchainRef,
      hash: generateSupplierHash(supplier),
      recordedAt: new Date(),
    };

    supplier.updatedBy = req.user?.id || "system";

    const updatedSupplier = await supplier.save();
    res.status(200).json({
      success: true,
      message: "Supplier updated",
      data: updatedSupplier,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

exports.verifySupplier = async (req, res) => {
  try {
    const { supplierId } = req.params;
    const { status, notes } = req.body; // status: VERIFIED, REJECTED, SUSPENDED

    const supplier = await Supplier.findById(supplierId);
    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: "Supplier not found",
      });
    }

    // Update verification status
    supplier.verification = {
      status: status,
      verifiedBy: req.user?.id || "admin",
      verificationDate: new Date(),
      verificationNotes: notes,
    };

    // If verified, update blockchain status
    if (status === "VERIFIED") {
      supplier.blockchainRef.network = "ethereum"; // Mock network - in production use actual blockchain
      supplier.blockchainRef.txId = `0x${crypto.randomBytes(32).toString("hex")}`; // Mock tx ID
    }

    supplier.updatedBy = req.user?.id || "admin";
    const updatedSupplier = await supplier.save();

    res.status(200).json({
      success: true,
      message: `Supplier ${status.toLowerCase()}`,
      data: updatedSupplier,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

exports.addProductToSupplier = async (req, res) => {
  try {
    const { supplierId } = req.params;
    const productData = req.body;

    const supplier = await Supplier.findById(supplierId);
    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: "Supplier not found",
      });
    }

    supplier.products.push(productData);

    // Regenerate hash for updated data
    supplier.blockchainRef.hash = generateSupplierHash(supplier);
    supplier.blockchainRef.recordedAt = new Date();

    supplier.updatedBy = req.user?.id || "system";
    const updatedSupplier = await supplier.save();

    res.status(200).json({
      success: true,
      message: "Product added to supplier",
      data: updatedSupplier,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

exports.addReview = async (req, res) => {
  try {
    const { supplierId } = req.params;
    const { rating, comment } = req.body;

    if (rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        message: "Rating must be between 1 and 5",
      });
    }

    const supplier = await Supplier.findById(supplierId);
    if (!supplier) {
      return res.status(404).json({
        success: false,
        message: "Supplier not found",
      });
    }

    supplier.reviews.push({
      rating,
      comment,
      reviewedBy: req.user?.id || "user",
    });

    // Update quality rating (average of reviews)
    const avgRating =
      supplier.reviews.reduce((sum, r) => sum + r.rating, 0) /
      supplier.reviews.length;
    supplier.qualityRating = parseFloat(avgRating.toFixed(1));

    const updatedSupplier = await supplier.save();

    res.status(200).json({
      success: true,
      message: "Review added",
      data: updatedSupplier,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

exports.getSupplierByCountry = async (req, res) => {
  try {
    const { country } = req.params;

    const suppliers = await Supplier.find({
      country: country,
      "verification.status": "VERIFIED",
    }).select("supplierName email phone products qualityRating certifications");

    res.status(200).json({
      success: true,
      count: suppliers.length,
      data: suppliers,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

exports.deleteSupplier = async (req, res) => {
  try {
    const deletedSupplier = await Supplier.findByIdAndDelete(req.params.id);
    if (!deletedSupplier) {
      return res.status(404).json({
        success: false,
        message: "Supplier not found",
      });
    }
    res.status(200).json({
      success: true,
      message: "Supplier deleted",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
