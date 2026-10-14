const express = require("express");
const { protect, restrictTo } = require("../middleware/auth");
const {
  getQuote,
  getAvailability,
  createBooking,
  getMyBookings,
  getReceivedBookings,
  getBooking,
  cancelBooking,
  approveBooking,
  rejectBooking,
  markPickedUp,
  markReturned,
  completeBooking,
  mockPay,
} = require("../controllers/bookingController");

const router = express.Router();

// Public (must come before "/:id")
router.get("/quote", getQuote);
router.get("/availability/:equipmentId", getAvailability);

// Any logged-in user
router.post("/", protect, createBooking);
router.get("/my", protect, getMyBookings);

// Owner / admin
router.get("/received", protect, restrictTo("owner", "admin"), getReceivedBookings);

router.get("/:id", protect, getBooking);
router.patch("/:id/cancel", protect, cancelBooking);

// Owner / admin lifecycle actions (the controller also checks it is YOUR equipment)
router.patch("/:id/approve", protect, restrictTo("owner", "admin"), approveBooking);
router.patch("/:id/reject", protect, restrictTo("owner", "admin"), rejectBooking);
router.patch("/:id/pickup", protect, restrictTo("owner", "admin"), markPickedUp);
router.patch("/:id/return", protect, restrictTo("owner", "admin"), markReturned);
router.patch("/:id/complete", protect, restrictTo("owner", "admin"), completeBooking);

// Development only: simulate a successful payment
if (process.env.NODE_ENV !== "production") {
  router.post("/:id/mock-pay", protect, mockPay);
}

module.exports = router;