const createPublicVerificationController =
  (verificationService) => async (req, res) => {
    try {
      const result = await verificationService.getPublicVerification(
        req.params.token,
      );
      if (!result) {
        return res.status(404).json({
          code: "NOT_FOUND",
          message:
            "QR code not recognised. We could not find a product for this code.",
        });
      }
      return res.json(result);
    } catch (error) {
      console.warn("Public QR verification request failed:", error.message);
      return res.status(error.statusCode === 503 ? 503 : 500).json({
        code: error.statusCode === 503 ? "UNAVAILABLE" : "ERROR",
        message:
          error.statusCode === 503
            ? "Product verification is temporarily unavailable."
            : "We could not load this product record. Please try again shortly.",
      });
    }
  };

module.exports = { createPublicVerificationController };
