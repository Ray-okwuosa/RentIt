const mongoose = require("mongoose");
const Booking = require("../models/Booking");
const Equipment = require("../models/Equipment");
const User = require("../models/User");
const AppError = require("../utils/AppError");
const asyncHandler = require("../utils/asyncHandler");
const {
  config,
  round2,
  todayUTC,
  daysBetween,
  validateRange,
  calculatePricing,
  findConflict,
  findEarlierConflict,
  getBlockedRanges,
  expireStaleBookings,
  markBookingPaid,
} = require("../services/bookingService");
const { refundForBooking } = require("../services/paymentService");

const POPULATE = [
  { path: "equipment", select: "title images dailyRate location.city location.state status" },
  { path: "renter", select: "name profilePhoto rating isVerified" },
  { path: "owner", select: "name profilePhoto rating isVerified ownerProfile.businessName" },
];

const cleanText = (value, max = 500) =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;

const paginate = (query) => {
  const page = Math.max(parseInt(query.page) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit) || 12, 1), 50);
  return { page, limit, skip: (page - 1) * limit };
};

// ---------- helpers ----------

const loadBooking = async (id) => {
  if (!mongoose.isValidObjectId(id)) throw new AppError("Booking not found.", 404);
  await expireStaleBookings(); // so an overdue request shows as expired right away
  const booking = await Booking.findById(id);
  if (!booking) throw new AppError("Booking not found.", 404);
  return booking;
};

const isAdmin = (user) => user.role === "admin";
const isRenter = (booking, user) => booking.renter.equals(user._id);
const isOwnerSide = (booking, user) => isAdmin(user) || booking.owner.equals(user._id);

const requireOwnerSide = (booking, user) => {
  if (!isOwnerSide(booking, user)) {
    throw new AppError("Only the equipment owner can perform this action.", 403);
  }
};

const requireStatus = (booking, allowed, action) => {
  if (!allowed.includes(booking.status)) {
    throw new AppError(
      `You cannot ${action} a booking that is ${booking.status.replace(/_/g, " ")}.`,
      409
    );
  }
};

// Atomic status change: only succeeds if the booking is still in one of the `from` statuses.
// Stops two people (or a double click) from acting on the same booking twice.
const transition = async (booking, from, update) => {
  const updated = await Booking.findOneAndUpdate(
    { _id: booking._id, status: { $in: from } },
    update,
    { new: true, runValidators: true }
  );
  if (!updated) {
    throw new AppError("This booking was just updated by someone else. Please refresh and try again.", 409);
  }
  return updated;
};

// Refunds run in the background so the response isn't delayed. If one fails, the refund
// sweeper (processRefunds in paymentService) retries it a few minutes later.
const triggerRefund = (bookingId) =>
  refundForBooking(bookingId).catch((err) => console.error(`Refund failed for booking ${bookingId}:`, err.message));

const respond = (res, booking, statusCode = 200) =>
  res.status(statusCode).json({ status: "success", data: { booking } });

const listBookings = async (req, res, base) => {
  await expireStaleBookings();
  const { page, limit, skip } = paginate(req.query);

  const filter = { ...base };
  if (req.query.status && Booking.STATUSES.includes(req.query.status)) {
    filter.status = req.query.status;
  }

  const [bookings, total] = await Promise.all([
    Booking.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate(POPULATE),
    Booking.countDocuments(filter),
  ]);

  res.json({
    status: "success",
    results: bookings.length,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    data: { bookings },
  });
};

// ---------- public ----------

// GET /api/bookings/quote?equipment=<id>&startDate=2026-11-03&endDate=2026-11-05
exports.getQuote = asyncHandler(async (req, res) => {
  const { equipment: equipmentId, startDate, endDate } = req.query;
  if (!mongoose.isValidObjectId(equipmentId)) throw new AppError("A valid equipment id is required.", 400);

  const { start, end, totalDays } = validateRange(startDate, endDate);

  const equipment = await Equipment.findOne({ _id: equipmentId, status: "active" });
  if (!equipment) throw new AppError("Equipment not found.", 404);

  const available = !(await findConflict(equipment._id, start, end));

  res.json({
    status: "success",
    data: {
      quote: {
        equipment: equipment._id,
        startDate: start,
        endDate: end,
        totalDays,
        available,
        ...calculatePricing(equipment, totalDays),
      },
    },
  });
});

// GET /api/bookings/availability/:equipmentId -> date ranges that are already taken
exports.getAvailability = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.equipmentId)) throw new AppError("Equipment not found.", 404);

  const blocked = await getBlockedRanges(req.params.equipmentId);
  res.json({ status: "success", results: blocked.length, data: { blocked } });
});

// ---------- renter ----------

// POST /api/bookings   { equipment, startDate, endDate, notes? }
exports.createBooking = asyncHandler(async (req, res) => {
  const { equipment: equipmentId, startDate, endDate } = req.body;
  if (!mongoose.isValidObjectId(equipmentId)) throw new AppError("A valid equipment id is required.", 400);

  const { start, end, totalDays } = validateRange(startDate, endDate);

  const equipment = await Equipment.findOne({ _id: equipmentId, status: "active" });
  if (!equipment) throw new AppError("Equipment not found or not available for rent.", 404);

  if (equipment.owner.equals(req.user._id)) {
    throw new AppError("You cannot book your own equipment.", 400);
  }
  if (!(await User.exists({ _id: equipment.owner, isActive: true }))) {
    throw new AppError("This equipment is currently unavailable.", 409);
  }

  if (await findConflict(equipment._id, start, end)) {
    throw new AppError("This equipment is not available for the selected dates.", 409);
  }

  const { paymentWindowMinutes } = config();

  const booking = await Booking.create({
    equipment: equipment._id,
    renter: req.user._id,
    owner: equipment.owner,
    startDate: start,
    endDate: end,
    totalDays,
    ...calculatePricing(equipment, totalDays),
    notes: cleanText(req.body.notes),
    status: "pending_payment",
    expiresAt: new Date(Date.now() + paymentWindowMinutes * 60 * 1000),
  });

  // Two people may have booked the same dates at the same moment. The earlier one keeps it.
  if (await findEarlierConflict(booking)) {
    await booking.deleteOne();
    throw new AppError("This equipment was just booked for those dates. Please choose other dates.", 409);
  }

  respond(res, booking, 201);
});

// GET /api/bookings/my  (bookings I made)
exports.getMyBookings = asyncHandler((req, res) => listBookings(req, res, { renter: req.user._id }));

// GET /api/bookings/received  (bookings on my equipment)
exports.getReceivedBookings = asyncHandler((req, res) => listBookings(req, res, { owner: req.user._id }));

// GET /api/bookings/:id  (renter, owner or admin)
exports.getBooking = asyncHandler(async (req, res) => {
  const booking = await loadBooking(req.params.id);

  if (!isAdmin(req.user) && !isRenter(booking, req.user) && !booking.owner.equals(req.user._id)) {
    throw new AppError("You do not have access to this booking.", 403);
  }

  await booking.populate(POPULATE);
  respond(res, booking);
});

// PATCH /api/bookings/:id/cancel  { reason? }
// Renter: pending_payment, pending_approval or approved. Owner: approved only. Admin: any of these.
// If the booking was paid, the refund follows the cancellation policy (see refundTarget in paymentService).
exports.cancelBooking = asyncHandler(async (req, res) => {
  const booking = await loadBooking(req.params.id);
  const renter = isRenter(booking, req.user);
  const ownerSide = isOwnerSide(booking, req.user);

  if (!renter && !ownerSide) throw new AppError("You do not have access to this booking.", 403);

  const allowed =
    isAdmin(req.user) || renter ? ["pending_payment", "pending_approval", "approved"] : ["approved"];
  requireStatus(booking, allowed, "cancel");

  const updated = await transition(booking, allowed, {
    status: "cancelled",
    cancelledAt: new Date(),
    cancelledBy: isAdmin(req.user) ? "admin" : renter ? "renter" : "owner",
    cancellationReason: cleanText(req.body.reason),
    expiresAt: null,
  });

  triggerRefund(updated._id);
  respond(res, updated);
});

// ---------- owner ----------

// PATCH /api/bookings/:id/approve
exports.approveBooking = asyncHandler(async (req, res) => {
  const booking = await loadBooking(req.params.id);
  requireOwnerSide(booking, req.user);
  requireStatus(booking, ["pending_approval"], "approve");

  const updated = await transition(booking, ["pending_approval"], {
    status: "approved",
    respondedAt: new Date(),
    expiresAt: null,
  });

  respond(res, updated);
});

// PATCH /api/bookings/:id/reject  { reason? }
// The renter is refunded in full.
exports.rejectBooking = asyncHandler(async (req, res) => {
  const booking = await loadBooking(req.params.id);
  requireOwnerSide(booking, req.user);
  requireStatus(booking, ["pending_approval"], "reject");

  const updated = await transition(booking, ["pending_approval"], {
    status: "rejected",
    respondedAt: new Date(),
    rejectionReason: cleanText(req.body.reason),
    expiresAt: null,
  });

  triggerRefund(updated._id);
  respond(res, updated);
});

// PATCH /api/bookings/:id/pickup  (owner hands the equipment over)
// TODO (condition reports): require a pickup ConditionReport before allowing this.
exports.markPickedUp = asyncHandler(async (req, res) => {
  const booking = await loadBooking(req.params.id);
  requireOwnerSide(booking, req.user);
  requireStatus(booking, ["approved"], "mark as picked up");

  const today = todayUTC();
  if (booking.startDate > today) {
    throw new AppError(
      `Pickup is not allowed before the rental start date (${booking.startDate.toISOString().slice(0, 10)}).`,
      409
    );
  }
  if (booking.endDate < today) {
    throw new AppError("The rental period has already ended. Cancel this booking instead.", 409);
  }

  const updated = await transition(booking, ["approved"], {
    status: "in_use",
    pickedUpAt: new Date(),
  });

  respond(res, updated);
});

// PATCH /api/bookings/:id/return  (owner confirms the equipment is back)
// TODO (condition reports): require a return ConditionReport before allowing this.
exports.markReturned = asyncHandler(async (req, res) => {
  const booking = await loadBooking(req.params.id);
  requireOwnerSide(booking, req.user);
  requireStatus(booking, ["in_use"], "mark as returned");

  const lateDays = Math.max(0, daysBetween(booking.endDate, todayUTC()));

  const updated = await transition(booking, ["in_use"], {
    status: "returned",
    returnedAt: new Date(),
    lateDays,
  });

  respond(res, updated);
});

// PATCH /api/bookings/:id/complete  { depositDeduction?, depositDeductionReason? }
// Settles the deposit and closes the booking: the renter's deposit (minus any deduction) is refunded.
// TODO (payouts): release the owner's payout from here.
exports.completeBooking = asyncHandler(async (req, res) => {
  const booking = await loadBooking(req.params.id);
  requireOwnerSide(booking, req.user);
  requireStatus(booking, ["returned"], "complete");

  const deduction = req.body.depositDeduction === undefined ? 0 : Number(req.body.depositDeduction);
  if (!Number.isFinite(deduction) || deduction < 0 || deduction > booking.securityDeposit) {
    throw new AppError(`Deposit deduction must be between 0 and ${booking.securityDeposit}.`, 400);
  }

  const reason = cleanText(req.body.depositDeductionReason);
  if (deduction > 0 && !reason) {
    throw new AppError("Please give a reason for the deposit deduction.", 400);
  }

  const updated = await transition(booking, ["returned"], {
    status: "completed",
    completedAt: new Date(),
    depositDeduction: round2(deduction),
    depositDeductionReason: deduction > 0 ? reason : undefined,
    depositRefundAmount: round2(booking.securityDeposit - deduction),
  });

  triggerRefund(updated._id);
  respond(res, updated);
});

// ---------- development helper ----------

// POST /api/bookings/:id/mock-pay
// Simulates a successful payment so you can test the lifecycle before the payment module exists.
// Only registered when NODE_ENV is not "production". Replace with the real payment webhook later.
exports.mockPay = asyncHandler(async (req, res) => {
  const booking = await loadBooking(req.params.id);
  if (!isRenter(booking, req.user) && !isAdmin(req.user)) {
    throw new AppError("Only the renter can pay for this booking.", 403);
  }

  const updated = await markBookingPaid(booking._id);
  respond(res, updated);
});