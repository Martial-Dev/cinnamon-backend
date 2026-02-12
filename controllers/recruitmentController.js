const Application = require("../models/Application");
const transporter = require("../utils/mailer");
const uploadImageToFirebase = require("../utils/firebase");

/**
 * Submit a new recruitment application
 * POST /api/recruitment/apply
 */
exports.submitApplication = async (req, res) => {
  try {
    const {
      fullName,
      email,
      phone,
      roleAppliedFor,
      position,
      linkedIn,
      motivationStatement,
      coverLetter,
      videoUrl,
      videoType,
      consentGiven,
    } = req.body;

    // Accept either roleAppliedFor or position (for backwards compatibility)
    const appliedPosition = roleAppliedFor || position;

    // Validate required fields
    if (!fullName || !email || !phone || !appliedPosition) {
      return res.status(400).json({
        success: false,
        message:
          "Missing required fields: fullName, email, phone, roleAppliedFor",
      });
    }

    // Upload CV to Firebase if provided
    let cvUrl = null;
    if (req.file) {
      cvUrl = await uploadImageToFirebase(
        req.file.buffer,
        req.file.originalname,
        "recruitment/cvs",
      );
      console.log(`CV uploaded to Firebase: ${cvUrl}`);
    }

    // Create application record
    const application = new Application({
      fullName,
      email,
      phone,
      position: appliedPosition,
      linkedIn: linkedIn || "",
      motivationStatement: motivationStatement || "",
      coverLetter: coverLetter || "",
      cvUrl,
      videoUrl: videoUrl || "",
      videoType: videoType || null,
      consentGiven: consentGiven === true || consentGiven === "true",
      status: "pending",
    });

    await application.save();

    // Log the submission
    console.log(
      `[${new Date().toISOString()}] New application submitted - Email: ${email}, Position: ${appliedPosition}`,
    );

    // Send confirmation email to applicant
    const applicantMailOptions = {
      from: process.env.SMTP_USER,
      to: email,
      subject: "Application Received - Canela Ceylon",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #8B4513;">Thank you for your application!</h2>
          <p>Dear ${fullName},</p>
          <p>We have received your application for the position of <strong>${appliedPosition}</strong>.</p>
          <p>Our recruitment team will review your application and get back to you soon.</p>
          <br/>
          <p>Best regards,</p>
          <p><strong>Canela Ceylon Recruitment Team</strong></p>
        </div>
      `,
    };

    // Send notification email to company
    const companyMailOptions = {
      from: process.env.SMTP_USER,
      to: process.env.SMTP_USER,
      replyTo: email,
      subject: `New Job Application - ${appliedPosition}`,
      html: `
        <div style="font-family: Arial, sans-serif;">
          <h2 style="color: #8B4513;">New Job Application Received</h2>
          <table style="border-collapse: collapse; width: 100%; max-width: 600px;">
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd; background: #f5f5f5;"><strong>Position:</strong></td>
              <td style="padding: 8px; border: 1px solid #ddd;">${appliedPosition}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd; background: #f5f5f5;"><strong>Name:</strong></td>
              <td style="padding: 8px; border: 1px solid #ddd;">${fullName}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd; background: #f5f5f5;"><strong>Email:</strong></td>
              <td style="padding: 8px; border: 1px solid #ddd;">${email}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd; background: #f5f5f5;"><strong>Phone:</strong></td>
              <td style="padding: 8px; border: 1px solid #ddd;">${phone}</td>
            </tr>
            ${
              linkedIn
                ? `
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd; background: #f5f5f5;"><strong>LinkedIn:</strong></td>
              <td style="padding: 8px; border: 1px solid #ddd;"><a href="${linkedIn}" style="color: #8B4513;">View Profile</a></td>
            </tr>
            `
                : ""
            }
            ${
              cvUrl
                ? `
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd; background: #f5f5f5;"><strong>CV:</strong></td>
              <td style="padding: 8px; border: 1px solid #ddd;"><a href="${cvUrl}" style="color: #8B4513;">View CV</a></td>
            </tr>
            `
                : ""
            }
            ${
              videoUrl
                ? `
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd; background: #f5f5f5;"><strong>Intro Video:</strong></td>
              <td style="padding: 8px; border: 1px solid #ddd;"><a href="${videoUrl}" style="color: #8B4513;">Watch Video (${videoType || 'link'})</a></td>
            </tr>
            `
                : ""
            }
          </table>
          ${
            motivationStatement
              ? `
          <div style="margin-top: 20px;">
            <h3 style="color: #8B4513;">Motivation Statement:</h3>
            <p style="white-space: pre-wrap; padding: 15px; background: #f9f9f9; border-left: 4px solid #8B4513;">${motivationStatement}</p>
          </div>
          `
              : ""
          }
          ${
            coverLetter
              ? `
          <div style="margin-top: 20px;">
            <h3 style="color: #8B4513;">Cover Letter:</h3>
            <p style="white-space: pre-wrap; padding: 15px; background: #f9f9f9; border-left: 4px solid #8B4513;">${coverLetter}</p>
          </div>
          `
              : ""
          }
        </div>
      `,
    };

    // Send emails (non-blocking)
    Promise.all([
      transporter.sendMail(applicantMailOptions),
      transporter.sendMail(companyMailOptions),
    ]).catch((err) => console.error("Email sending failed:", err));

    res.status(201).json({
      success: true,
      message: "Application submitted successfully",
      applicationId: application._id,
    });
  } catch (error) {
    console.error("Application submission error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to submit application",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Get all applications (Admin only)
 * GET /api/recruitment/applications
 */
exports.getAllApplications = async (req, res) => {
  try {
    const { status, position, page = 1, limit = 10 } = req.query;

    const filter = {};
    if (status) filter.status = status;
    if (position) filter.position = position;

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [applications, total] = await Promise.all([
      Application.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Application.countDocuments(filter),
    ]);

    res.status(200).json({
      success: true,
      data: applications,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    console.error("Get applications error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve applications",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Get single application by ID (Admin only)
 * GET /api/recruitment/applications/:id
 */
exports.getApplicationById = async (req, res) => {
  try {
    const application = await Application.findById(req.params.id);

    if (!application) {
      return res.status(404).json({
        success: false,
        message: "Application not found",
      });
    }

    res.status(200).json({
      success: true,
      data: application,
    });
  } catch (error) {
    console.error("Get application error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve application",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Update application status (Admin only)
 * PUT /api/recruitment/applications/:id/status
 */
exports.updateApplicationStatus = async (req, res) => {
  try {
    const { status, adminNotes } = req.body;

    if (
      !status ||
      !["pending", "reviewing", "shortlisted", "rejected", "hired"].includes(
        status,
      )
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid status value",
      });
    }

    const updateData = { status };
    if (adminNotes !== undefined) {
      updateData.adminNotes = adminNotes;
    }

    const application = await Application.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true },
    );

    if (!application) {
      return res.status(404).json({
        success: false,
        message: "Application not found",
      });
    }

    // Log the action
    console.log(
      `[${new Date().toISOString()}] Application status updated - ID: ${req.params.id}, Status: ${status}, Admin: ${req.userData?.userId || "unknown"}`,
    );

    // Send status update email to applicant
    const statusMessages = {
      reviewing: "Your application is currently under review.",
      shortlisted:
        "Congratulations! You have been shortlisted. We will contact you soon.",
      rejected:
        "Thank you for your interest. Unfortunately, we have decided to move forward with other candidates.",
      hired:
        "Congratulations! We are pleased to offer you the position. We will contact you with further details.",
    };

    if (status !== "pending" && statusMessages[status]) {
      const mailOptions = {
        from: process.env.SMTP_USER,
        to: application.email,
        subject: `Application Status Update - ${application.position}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #8B4513;">Application Status Update</h2>
            <p>Dear ${application.fullName},</p>
            <p>${statusMessages[status]}</p>
            <p>Position: <strong>${application.position}</strong></p>
            <p>Status: <strong style="text-transform: uppercase; color: #8B4513;">${status}</strong></p>
            <br/>
            <p>Best regards,</p>
            <p><strong>Canela Ceylon Recruitment Team</strong></p>
          </div>
        `,
      };

      transporter
        .sendMail(mailOptions)
        .catch((err) => console.error("Status update email failed:", err));
    }

    res.status(200).json({
      success: true,
      message: "Application status updated successfully",
      data: application,
    });
  } catch (error) {
    console.error("Update application status error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update application status",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Delete application (Admin only)
 * DELETE /api/recruitment/applications/:id
 */
exports.deleteApplication = async (req, res) => {
  try {
    const application = await Application.findByIdAndDelete(req.params.id);

    if (!application) {
      return res.status(404).json({
        success: false,
        message: "Application not found",
      });
    }

    // Log the deletion
    console.log(
      `[${new Date().toISOString()}] Application deleted - ID: ${req.params.id}, Email: ${application.email}, Admin: ${req.userData?.userId || "unknown"}`,
    );

    res.status(200).json({
      success: true,
      message: "Application deleted successfully",
    });
  } catch (error) {
    console.error("Delete application error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete application",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};
