const express = require("express");
const { protect, restrictTo } = require("../middleware/auth");
const {
  getEquipmentReviews,
  getOwnerReviews,
  createReview,
  getMyReviews,
  getBookingReview,
  updateReview,
  deleteReview,
  replyToReview,
  setReviewHidden,
} = require("../controllers/reviewController");

const router = express.Router();

// Public (must come before "/:id")
router.get("/equipment/:equipmentId", getEquipmentReviews);
router.get("/owner/:ownerId", getOwnerReviews);

// Logged-in users
router.post("/", protect, createReview);
router.get("/my", protect, getMyReviews);
router.get("/booking/:bookingId", protect, getBookingReview);

// The author edits or deletes (admins can also delete). Ownership is checked in the controller.
router.patch("/:id", protect, updateReview);
router.delete("/:id", protect, deleteReview);

// The reviewed owner replies
router.post("/:id/reply", protect, restrictTo("owner", "admin"), replyToReview);

// Admin moderation
router.patch("/:id/hide", protect, restrictTo("admin"), setReviewHidden);

module.exports = router;