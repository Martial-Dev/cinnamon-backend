const mongoose = require("mongoose");

const applicationSchema = new mongoose.Schema(
  {
    fullName: {
      type: String,
      required: [true, "Full name is required"],
      trim: true,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, "Please provide a valid email address"],
    },
    phone: {
      type: String,
      required: [true, "Phone number is required"],
      trim: true,
    },
    position: {
      type: String,
      required: [true, "Position is required"],
      trim: true,
    },
    linkedIn: {
      type: String,
      trim: true,
    },
    motivationStatement: {
      type: String,
      trim: true,
    },
    coverLetter: {
      type: String,
      trim: true,
    },
    cvUrl: {
      type: String,
      trim: true,
    },
    videoUrl: {
      type: String,
      trim: true,
    },
    videoType: {
      type: String,
      enum: ["drive", "youtube", "direct"],
      trim: true,
    },
    consentGiven: {
      type: Boolean,
      default: false,
    },
    adminNotes: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: {
        values: ["pending", "reviewing", "shortlisted", "rejected", "hired"],
        message: "Invalid status value",
      },
      default: "pending",
    },
  },
  {
    timestamps: true,
  },
);

// Indexes for faster queries
applicationSchema.index({ email: 1, createdAt: -1 });
applicationSchema.index({ status: 1, createdAt: -1 });
applicationSchema.index({ position: 1, createdAt: -1 });

module.exports = mongoose.model("Application", applicationSchema);
