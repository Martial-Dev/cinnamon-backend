const mongoose = require("mongoose");
const Review = require("../models/Review");
const User = require("../models/User");
const uploadImageToFirebase = require("../utils/firebase");

const MAX_IMAGES = 5;

const buildFilter = (query) => {
  const filter = { visible: true };
  if (query.productId && mongoose.Types.ObjectId.isValid(query.productId)) {
    filter.productId = mongoose.Types.ObjectId(query.productId);
  }
  if (query.rating) {
    const rating = parseInt(query.rating, 10);
    if (rating >= 1 && rating <= 5) {
      filter.rating = rating;
    }
  }
  return filter;
};

const buildSummary = async (filter) => {
  const [totalReviews, averageResult, breakdownResult] = await Promise.all([
    Review.countDocuments(filter),
    Review.aggregate([
      { $match: filter },
      { $group: { _id: null, averageRating: { $avg: "$rating" } } },
    ]),
    Review.aggregate([
      { $match: filter },
      { $group: { _id: "$rating", count: { $sum: 1 } } },
    ]),
  ]);

  const breakdown = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  breakdownResult.forEach((row) => {
    if (row._id >= 1 && row._id <= 5) {
      breakdown[row._id] = row.count;
    }
  });

  return {
    totalReviews,
    averageRating: averageResult[0]?.averageRating ?? 0,
    breakdown,
  };
};

const formatReview = (review) => {
  return {
    ...review.toObject(),
    replies: review.replies || [],
  };
};

exports.getReviews = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 12, 50);
    const skip = parseInt(req.query.skip, 10) || 0;
    const filter = buildFilter(req.query);

    const reviews = await Review.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const summary = await buildSummary(filter);

    res.json({ reviews: reviews.map(formatReview), summary });
  } catch (error) {
    console.error("Error fetching reviews:", error);
    res.status(500).json({ message: "Could not fetch reviews" });
  }
};

exports.getReviewById = async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) {
      return res.status(404).json({ message: "Review not found" });
    }
    res.json(formatReview(review));
  } catch (error) {
    console.error("Error fetching review:", error);
    res.status(500).json({ message: "Could not fetch the review" });
  }
};

exports.createReview = async (req, res) => {
  try {
    const { comment, rating, productId } = req.body;
    const parsedRating = Number.parseInt(rating, 10);
    if (!comment || !parsedRating || parsedRating < 1 || parsedRating > 5) {
      return res
        .status(400)
        .json({ message: "Rating and comment are required" });
    }

    const user = await User.findById(req.userData.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const images = [];
    if (req.files && req.files.length) {
      if (req.files.length > MAX_IMAGES) {
        return res
          .status(400)
          .json({ message: `You can upload up to ${MAX_IMAGES} images` });
      }
      for (const file of req.files) {
        const url = await uploadImageToFirebase(
          file.buffer,
          file.originalname,
          "reviews"
        );
        images.push({ url });
      }
    }

    const reviewData = {
      authorId: req.userData.userId,
      authorName: `${user.firstName} ${user.lastName}`,
      comment: comment.trim(),
      rating: parsedRating,
      images,
    };

    if (productId && mongoose.Types.ObjectId.isValid(productId)) {
      reviewData.productId = mongoose.Types.ObjectId(productId);
    }

    const review = new Review(reviewData);
    await review.save();

    res.status(201).json(formatReview(review));
  } catch (error) {
    console.error("Error creating review:", error);
    res.status(500).json({ message: "Could not create review" });
  }
};

exports.addReply = async (req, res) => {
  try {
    const { message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ message: "Reply message is required" });
    }

    if (req.userData.role !== "admin") {
      return res
        .status(403)
        .json({ message: "Only admins can reply to reviews" });
    }

    const user = await User.findById(req.userData.userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const review = await Review.findById(req.params.id);
    if (!review) {
      return res.status(404).json({ message: "Review not found" });
    }

    review.replies.unshift({
      userId: req.userData.userId,
      userName: `${user.firstName} ${user.lastName}`,
      message: message.trim(),
    });

    await review.save();
    res.status(201).json(formatReview(review));
  } catch (error) {
    console.error("Error adding reply:", error);
    res.status(500).json({ message: "Could not add reply" });
  }
};

exports.deleteReview = async (req, res) => {
  try {
    const review = await Review.findById(req.params.id);
    if (!review) {
      return res.status(404).json({ message: "Review not found" });
    }

    if (
      review.authorId.toString() !== req.userData.userId &&
      req.userData.role !== "admin"
    ) {
      return res
        .status(403)
        .json({ message: "Not authorized to delete this review" });
    }

    await review.deleteOne();
    res.json({ message: "Review deleted" });
  } catch (error) {
    console.error("Error deleting review:", error);
    res.status(500).json({ message: "Could not delete review" });
  }
};

exports.updateReview = async (req, res) => {
  try {
    const { comment, rating } = req.body;
    const parsedRating = rating ? Number.parseInt(rating, 10) : undefined;

    const review = await Review.findById(req.params.id);
    if (!review) {
      return res.status(404).json({ message: "Review not found" });
    }

    if (
      review.authorId.toString() !== req.userData.userId &&
      req.userData.role !== "admin"
    ) {
      return res
        .status(403)
        .json({ message: "Not authorized to update this review" });
    }

    if (comment) {
      review.comment = comment.trim();
    }
    if (parsedRating && parsedRating >= 1 && parsedRating <= 5) {
      review.rating = parsedRating;
    }

    await review.save();
    res.json(formatReview(review));
  } catch (error) {
    console.error("Error updating review:", error);
    res.status(500).json({ message: "Could not update review" });
  }
};
