const express = require("express");
const router = express.Router();
const upload = require("../middleware/Multer");
const checkAuth = require("../middleware/check-auth");
const { validateApplication } = require("../middleware/recruitmentValidation");
const {
  submitApplication,
  getAllApplications,
  getApplicationById,
  updateApplicationStatus,
  deleteApplication,
} = require("../controllers/recruitmentController");

// Public route - Submit application
router.post(
  "/apply",
  upload.single("cv"),
  validateApplication,
  submitApplication,
);

// Admin routes - Protected with authentication
router.get("/applications", checkAuth, getAllApplications);

router.get("/applications/:id", checkAuth, getApplicationById);

router.put("/applications/:id/status", checkAuth, updateApplicationStatus);

router.delete("/applications/:id", checkAuth, deleteApplication);

module.exports = router;
