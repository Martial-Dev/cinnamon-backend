const express = require("express");
const { rateLimit } = require("express-rate-limit");
const publicVerificationService = require("../services/publicVerificationService");
const {
  createPublicVerificationController,
} = require("../controllers/publicVerificationController");

const createPublicVerificationRouter = (
  verificationService = publicVerificationService,
) => {
  const router = express.Router();
  const limiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      code: "RATE_LIMITED",
      message: "Too many verification checks. Please try again shortly.",
    },
  });

  router.get(
    "/:token",
    limiter,
    createPublicVerificationController(verificationService),
  );
  return router;
};

module.exports = { createPublicVerificationRouter };
