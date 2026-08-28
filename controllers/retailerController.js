const Retailer = require("../models/Retailer");

exports.createRetailer = async (req, res) => {
  try {
    const payload = {
      ...req.body,
      verification: {
        status: "PENDING",
      },
      sourceChannel: req.body.sourceChannel || "website",
      createdBy: req.userData?.userId || "public",
      updatedBy: req.userData?.userId || "public",
    };

    const created = await Retailer.create(payload);
    return res.status(201).json({
      success: true,
      message: "Retailer registration submitted for review.",
      data: created,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

exports.getRetailers = async (req, res) => {
  try {
    const { status, businessType, search } = req.query;
    const filter = {};

    if (status) filter["verification.status"] = status;
    if (businessType) filter.businessType = businessType;
    if (search) {
      filter.$or = [
        { companyName: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { contactPerson: { $regex: search, $options: "i" } },
      ];
    }

    const retailers = await Retailer.find(filter).sort({ createdAt: -1 });
    return res.status(200).json({
      success: true,
      count: retailers.length,
      data: retailers,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

exports.getRetailerById = async (req, res) => {
  try {
    const retailer = await Retailer.findById(req.params.id);
    if (!retailer) {
      return res.status(404).json({
        success: false,
        message: "Retailer not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: retailer,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

exports.updateRetailer = async (req, res) => {
  try {
    const updated = await Retailer.findByIdAndUpdate(
      req.params.id,
      {
        ...req.body,
        updatedBy: req.userData?.userId || "system",
      },
      { new: true },
    );

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "Retailer not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Retailer updated",
      data: updated,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

exports.verifyRetailer = async (req, res) => {
  try {
    const { status, notes } = req.body;

    const updated = await Retailer.findByIdAndUpdate(
      req.params.id,
      {
        verification: {
          status,
          notes,
          verifiedBy: req.userData?.userId || "admin",
          verifiedAt: new Date(),
        },
        updatedBy: req.userData?.userId || "admin",
      },
      { new: true },
    );

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "Retailer not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: `Retailer ${status?.toLowerCase() || "updated"}`,
      data: updated,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

exports.deleteRetailer = async (req, res) => {
  try {
    const deleted = await Retailer.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Retailer not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Retailer deleted",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
