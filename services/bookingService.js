const Booking = require("../models/Booking");
const AppError = require("../utils/AppError");

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_RENTAL_DAYS = 90;

const numberFromEnv = (value, fallback) => {
  const n = Number(value);
  return value !== undefined && Number.isFinite(n) && n >= 0 ? n : fallback;
};

// Read at call time so changes to .env are picked up on restart
const config = () => ({
  serviceFeePercent: numberFromEnv(process.env.SERVICE_FEE_PERCENT, 10),
  paymentWindowMinutes: numberFromEnv(process.env.PAYMENT_WINDOW_MINUTES, 30),
  ownerResponseHours: numberFromEnv(process.env.OWNER_RESPONSE_HOURS, 24),
});

const round2 = (n) => Math.round(n * 100) / 100;

// ---------- Dates ----------

const todayUTC = () => {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
};

const daysBetween = (from, to) => Math.round((to.getTime() - from.getTime()) / DAY_MS);

// "YYYY-MM-DD" -> Date at UTC midnight
const parseDay = (value, label) => {
  const invalid = new AppError(`${label} must be a valid date in YYYY-MM-DD format.`, 400);
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw invalid;

  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    throw invalid;
  }
  return date;
};

// Validates a rental period. Both dates are inclusive.
const validateRange = (startDate, endDate) => {
  const start = parseDay(startDate, "startDate");
  const end = parseDay(endDate, "endDate");

  if (start < todayUTC()) throw new AppError("Start date cannot be in the past.", 400);
  if (end < start) throw new AppError("End date cannot be before the start date.", 400);

  const totalDays = daysBetween(start, end) + 1;
  if (totalDays > MAX_RENTAL_DAYS) {
    throw new AppError(`A single booking cannot exceed ${MAX_RENTAL_DAYS} days.`, 400);
  }
  return { start, end, totalDays };
};

// ---------- Pricing ----------

const calculatePricing = (equipment, totalDays) => {
  const { serviceFeePercent } = config();

  let base = totalDays * equipment.dailyRate;
  if (equipment.weeklyRate) {
    const weeks = Math.floor(totalDays / 7);
    const remainingDays = totalDays % 7;
    // The weekly rate is only used when it is actually cheaper
    base = Math.min(base, weeks * equipment.weeklyRate + remainingDays * equipment.dailyRate);
  }

  const subtotal = round2(base);
  const serviceFee = round2((subtotal * serviceFeePercent) / 100);
  const securityDeposit = equipment.securityDeposit || 0;

  return {
    dailyRateSnapshot: equipment.dailyRate,
    subtotal,
    serviceFee,
    securityDeposit,
    totalAmount: round2(subtotal + serviceFee + securityDeposit),
  };
};

// ---------- Availability ----------

// Statuses that hold the dates. Unpaid/unanswered requests only hold them until expiresAt.
const holdingClause = (now = new Date()) => [
  { status: { $in: ["approved", "in_use"] } },
  { status: { $in: ["pending_payment", "pending_approval"] }, expiresAt: { $gt: now } },
];

const overlapFilter = (equipmentId, start, end, now = new Date()) => ({
  equipment: equipmentId,
  startDate: { $lte: end },
  endDate: { $gte: start },
  $or: holdingClause(now),
});

const findConflict = (equipmentId, start, end) => Booking.exists(overlapFilter(equipmentId, start, end));

// After inserting a booking, check whether an OLDER booking holds overlapping dates.
// If two requests race, the one created first wins and the other backs off. This gives
// double-booking protection without needing database transactions (replica sets).
const findEarlierConflict = (booking) =>
  Booking.exists({
    $and: [
      overlapFilter(booking.equipment, booking.startDate, booking.endDate),
      { _id: { $ne: booking._id } },
      {
        $or: [
          { createdAt: { $lt: booking.createdAt } },
          { createdAt: booking.createdAt, _id: { $lt: booking._id } },
        ],
      },
    ],
  });

// Date ranges that are currently taken (for calendar views)
const getBlockedRanges = (equipmentId) =>
  Booking.find({
    equipment: equipmentId,
    endDate: { $gte: todayUTC() },
    $or: holdingClause(),
  })
    .select("startDate endDate -_id")
    .sort({ startDate: 1 })
    .lean();

// ---------- Lifecycle helpers ----------

// Marks unpaid / unanswered bookings as expired. Called on reads and (optionally) on a timer.
// TODO (payments): refund any payment on bookings that expire while pending_approval.
const expireStaleBookings = () =>
  Booking.updateMany(
    { status: { $in: ["pending_payment", "pending_approval"] }, expiresAt: { $lt: new Date() } },
    { status: "expired", expiredAt: new Date(), expiresAt: null }
  );

// Called by the payment module once a payment is confirmed (webhook / verify endpoint)
const markBookingPaid = async (bookingId) => {
  const now = new Date();
  const { ownerResponseHours } = config();

  const booking = await Booking.findOneAndUpdate(
    { _id: bookingId, status: "pending_payment", expiresAt: { $gt: now } },
    {
      status: "pending_approval",
      paidAt: now,
      expiresAt: new Date(now.getTime() + ownerResponseHours * 60 * 60 * 1000),
    },
    { new: true }
  );

  if (!booking) {
    throw new AppError(
      "This booking is no longer awaiting payment. It may have expired or already been paid.",
      409
    );
  }
  return booking;
};

module.exports = {
  config,
  round2,
  todayUTC,
  daysBetween,
  parseDay,
  validateRange,
  calculatePricing,
  findConflict,
  findEarlierConflict,
  getBlockedRanges,
  expireStaleBookings,
  markBookingPaid,
};