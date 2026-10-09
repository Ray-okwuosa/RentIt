import express from "express";

import {
  createBooking,
  approveBooking,
  rejectBooking,
  cancelBooking,
  getBookingById,
  getAllBookings,
} from "../controllers/bookingController.js";

import protect from "../middleware/authMiddleware.js";
import authorizeRoles from "../middleware/roleMiddleware.js";

const router = express.Router();

// A logged-in renter can request a booking.
router.post("/", protect, authorizeRoles("renter"), createBooking);

// Logged-in users can request booking information.
// The controller must restrict which bookings each user can see.
router.get("/", protect, getAllBookings);
router.get("/:bookingId", protect, getBookingById);

// Only owners can attempt approval or rejection.
// The controller must also verify ownership of the equipment.
router.patch(
  "/:bookingId/approve",
  protect,
  authorizeRoles("owner"),
  approveBooking
);

router.patch(
  "/:bookingId/reject",
  protect,
  authorizeRoles("owner"),
  rejectBooking
);

// Renters and owners may cancel, subject to ownership and booking rules.
router.patch(
  "/:bookingId/cancel",
  protect,
  authorizeRoles("renter", "owner"),
  cancelBooking
);

export default router;