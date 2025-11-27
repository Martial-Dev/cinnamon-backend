const express = require("express");
const router = express.Router();
const upload = require("../middleware/Multer");
const reviewController = require("../controllers/reviewController");
const checkAuth = require("../middleware/check-auth");

router.get("/", reviewController.getReviews);
router.get("/:id", reviewController.getReviewById);
router.post(
  "/",
  checkAuth,
  upload.array("images", 5),
  reviewController.createReview
);
router.post("/:id/replies", checkAuth, reviewController.addReply);
router.put("/:id", checkAuth, reviewController.updateReview);
router.delete("/:id", checkAuth, reviewController.deleteReview);

module.exports = router;
