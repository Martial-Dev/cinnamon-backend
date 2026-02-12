/**
 * Validation middleware for job application submission
 */
const validateApplication = (req, res, next) => {
  const { fullName, email, phone, position, roleAppliedFor } = req.body;

  // Accept either roleAppliedFor or position for backwards compatibility
  const appliedPosition = roleAppliedFor || position;

  // Validate required fields
  if (!fullName || !email || !phone || !appliedPosition) {
    return res.status(400).json({
      success: false,
      message:
        "Missing required fields: fullName, email, phone, roleAppliedFor",
    });
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({
      success: false,
      message: "Invalid email format",
    });
  }

  // Validate phone format (basic)
  const phoneRegex = /^[\d\s\-\+\(\)]+$/;
  if (!phoneRegex.test(phone)) {
    return res.status(400).json({
      success: false,
      message: "Invalid phone format",
    });
  }

  // Validate CV file if present
  if (req.file) {
    const allowedTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ];
    const maxSize = 5 * 1024 * 1024; // 5MB

    if (!allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({
        success: false,
        message: "Only PDF and Word documents are allowed for CV",
      });
    }

    if (req.file.size > maxSize) {
      return res.status(400).json({
        success: false,
        message: "CV file size must be less than 5MB",
      });
    }
  }

  next();
};

module.exports = { validateApplication };
