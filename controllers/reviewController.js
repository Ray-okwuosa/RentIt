const mongoose = require("mongoose");
const Review = require("../models/Review");
const Booking = require("../models/Booking");
const AppError = require("../utils/AppError");
const asyncHandler = require("../utils/asyncHandler");
const { oid, summarize, recalculateRatings } = require("../services/reviewService");

const DAY_MS = 24 * 60 * 60 * 1000;

// How long after a booking completes (or after posting) the renter can write or edit a review
const reviewWindowDays = () => {
  const n = Number(process.env.REVIEW_WINDOW_DAYS);
  return Number.isFinite(n) && n > 0 ? n : 30;
};

const SORTS = {
  newest: { createdAt: -1 },
  highest: { rating: -1, createdAt: -1 },
  lowest: { rating: 1, createdAt: -1 },
};

const isAdmin = (user) => user.role === "admin";

const cleanText = (value, max = 1000) =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;

const RATING_FIELDS = ["communicationRating", "reliabilityRating", "equipmentRating"];

const parseRating = (value, field) => {
  const n = Number(value);
  if (value === null || value === "" || !Number.isInteger(n) || n < 1 || n > 5) {
    throw new AppError(`${field} must be a whole number from 1 to 5.`, 400);
  }
  return n;
};

const paginate = (query) => {
  const page = Math.max(parseInt(query.page) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit) || 10, 1), 50);
  return { page, limit, skip: (page - 1) * limit };
};

const loadReview = async (id) => {
  if (!mongoose.isValidObjectId(id)) throw new AppError("Review not found.", 404);
  const review = await Review.findById(id);
  if (!review) throw new AppError("Review not found.", 404);
  return review;
};

const withinWindow = (since) => Date.now() <= new Date(since).getTime() + reviewWindowDays() * DAY_MS;

// Shared by the "reviews for this equipment" and "reviews for this owner" endpoints
const listPublicReviews = async (req, res, field, id) => {
  if (!mongoose.isValidObjectId(id)) throw new AppError("Not found.", 404);
  const { page, limit, skip } = paginate(req.query);

  const filter = { [field]: id, isHidden: false };
  // ?rating=4 -> reviews whose overall rating rounds to 4 stars (3.5 up to, not including, 4.5)
  const stars = parseInt(req.query.rating);
  if (stars >= 1 && stars <= 5) filter.rating = { $gte: stars - 0.5, $lt: stars + 0.5 };

  const sort = { ...(SORTS[req.query.sort] || SORTS.newest), _id: -1 };

  const [reviews, total, summary] = await Promise.all([
    Review.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate("renter", "name profilePhoto")
      .populate("equipment", "title images"),
    Review.countDocuments(filter),
    summarize({ [field]: oid(id) }), // always the overall summary, not just the filtered page
  ]);

  res.json({
    status: "success",
    results: reviews.length,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    data: { summary, reviews },
  });
};

// ---------- public ----------

// GET /api/reviews/equipment/:equipmentId?sort=newest|highest|lowest&rating=5&page=1
exports.getEquipmentReviews = asyncHandler((req, res) =>
  listPublicReviews(req, res, "equipment", req.params.equipmentId)
);

// GET /api/reviews/owner/:ownerId  (every review across that owner's equipment)
exports.getOwnerReviews = asyncHandler((req, res) => listPublicReviews(req, res, "owner", req.params.ownerId));

// ---------- renter ----------

// POST /api/reviews   { booking, communicationRating, reliabilityRating, equipmentRating, comment? }
// Each rating is a whole number from 1 to 5. The overall rating is their average, set by the model.
exports.createReview = asyncHandler(async (req, res) => {
  const { booking: bookingId, comment } = req.body;
  if (!mongoose.isValidObjectId(bookingId)) throw new AppError("A valid booking id is required.", 400);

  const ratings = Object.fromEntries(RATING_FIELDS.map((field) => [field, parseRating(req.body[field], field)]));

  const booking = await Booking.findById(bookingId);
  if (!booking) throw new AppError("Booking not found.", 404);
  if (!booking.renter.equals(req.user._id)) {
    throw new AppError("You can only review bookings you made.", 403);
  }
  if (booking.status !== "completed") {
    throw new AppError("You can review the owner once the booking is completed.", 409);
  }
  if (!withinWindow(booking.completedAt || booking.updatedAt)) {
    throw new AppError(`Reviews must be submitted within ${reviewWindowDays()} days of completion.`, 409);
  }
  if (await Review.exists({ booking: booking._id })) {
    throw new AppError("You have already reviewed this booking.", 409);
  }

  let review;
  try {
    review = await Review.create({
      booking: booking._id,
      equipment: booking.equipment,
      owner: booking.owner,
      renter: req.user._id,
      ...ratings,
      comment: cleanText(comment),
    });
  } catch (err) {
    // Two requests at once: the unique index on `booking` lets only one through
    if (err.code === 11000) throw new AppError("You have already reviewed this booking.", 409);
    throw err;
  }

  await recalculateRatings({ equipment: review.equipment, owner: review.owner });

  res.status(201).json({ status: "success", data: { review } });
});

// GET /api/reviews/my  (reviews I have written, including any an admin has hidden)
exports.getMyReviews = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const filter = { renter: req.user._id };

  const [reviews, total] = await Promise.all([
    Review.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("equipment", "title images")
      .populate("owner", "name profilePhoto"),
    Review.countDocuments(filter),
  ]);

  res.json({
    status: "success",
    results: reviews.length,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    data: { reviews },
  });
});

// GET /api/reviews/booking/:bookingId
// The review for a booking (or null), and whether the current user can still write one.
exports.getBookingReview = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.bookingId)) throw new AppError("Booking not found.", 404);

  const booking = await Booking.findById(req.params.bookingId);
  if (!booking) throw new AppError("Booking not found.", 404);

  const isRenter = booking.renter.equals(req.user._id);
  if (!isAdmin(req.user) && !isRenter && !booking.owner.equals(req.user._id)) {
    throw new AppError("You do not have access to this booking.", 403);
  }

  const review = await Review.findOne({ booking: booking._id }).populate("renter", "name profilePhoto");

  const canReview =
    isRenter &&
    !review &&
    booking.status === "completed" &&
    withinWindow(booking.completedAt || booking.updatedAt);

  res.json({ status: "success", data: { review, canReview } });
});

// PATCH /api/reviews/:id   { communicationRating?, reliabilityRating?, equipmentRating?, comment? }
// (the author, within the review window). Send only what changed; the overall rating is recalculated.
exports.updateReview = asyncHandler(async (req, res) => {
  const review = await loadReview(req.params.id);

  if (!review.renter.equals(req.user._id)) throw new AppError("You can only edit your own review.", 403);
  if (!withinWindow(review.createdAt)) {
    throw new AppError(`Reviews can only be edited within ${reviewWindowDays()} days of posting.`, 409);
  }
  const changedRatings = RATING_FIELDS.filter((field) => req.body[field] !== undefined);
  if (changedRatings.length === 0 && req.body.comment === undefined) {
    throw new AppError("Provide at least one rating or a comment to update.", 400);
  }

  for (const field of changedRatings) review[field] = parseRating(req.body[field], field);
  if (req.body.comment !== undefined) review.comment = cleanText(req.body.comment);
  await review.save();

  await recalculateRatings({ equipment: review.equipment, owner: review.owner });

  res.json({ status: "success", data: { review } });
});

// DELETE /api/reviews/:id  (the author or an admin)
exports.deleteReview = asyncHandler(async (req, res) => {
  const review = await loadReview(req.params.id);

  if (!isAdmin(req.user) && !review.renter.equals(req.user._id)) {
    throw new AppError("You can only delete your own review.", 403);
  }

  await review.deleteOne();
  await recalculateRatings({ equipment: review.equipment, owner: review.owner });

  res.status(204).send();
});

// ---------- owner ----------

// POST /api/reviews/:id/reply   { text }
// The reviewed owner posts a public reply. Posting again replaces the previous reply.
exports.replyToReview = asyncHandler(async (req, res) => {
  const review = await loadReview(req.params.id);

  if (!review.owner.equals(req.user._id)) {
    throw new AppError("Only the reviewed owner can reply to this review.", 403);
  }

  const text = cleanText(req.body.text);
  if (!text) throw new AppError("Reply text is required.", 400);

  review.reply = { text, repliedAt: new Date() };
  await review.save();

  res.json({ status: "success", data: { review } });
});

// ---------- admin ----------

// PATCH /api/reviews/:id/hide   { isHidden: true | false }
exports.setReviewHidden = asyncHandler(async (req, res) => {
  if (typeof req.body.isHidden !== "boolean") {
    throw new AppError("isHidden must be true or false.", 400);
  }

  const review = await loadReview(req.params.id);
  review.isHidden = req.body.isHidden;
  await review.save();

  await recalculateRatings({ equipment: review.equipment, owner: review.owner });

  res.json({ status: "success", data: { review } });
});