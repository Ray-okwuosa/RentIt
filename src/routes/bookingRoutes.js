import express from "express";

import {
  createBooking,
  approveBooking,
  rejectBooking,
  cancelBooking,
  completeBooking,
  getBookingById,
  getAllBookings,
} from "../controllers/bookingController.js";

import protect from "../middleware/authMiddleware.js";
import authorizeRoles from "../middleware/roleMiddleware.js";

const router = express.Router();

// A logged-in renter or owner can request a booking for equipment they don't own.
router.post("/", protect, authorizeRoles("renter", "owner"), createBooking);

// Logged-in users can request booking information.
// The controller restricts which bookings each user/role can see.
router.get("/", protect, getAllBookings);
router.get("/:bookingId", protect, getBookingById);

// Owners and Admins can approve or reject bookings.
router.patch(
  "/:bookingId/approve",
  protect,
  authorizeRoles("owner", "admin"),
  approveBooking
);

router.patch(
  "/:bookingId/reject",
  protect,
  authorizeRoles("owner", "admin"),
  rejectBooking
);

// Renters, Owners, and Admins may cancel, subject to business rules.
router.patch(
  "/:bookingId/cancel",
  protect,
  authorizeRoles("renter", "owner", "admin"),
  cancelBooking
);

// Owners and Admins can mark a rental as completed.
router.patch(
  "/:bookingId/complete",
  protect,
  authorizeRoles("owner", "admin"),
  completeBooking
);

export default router;