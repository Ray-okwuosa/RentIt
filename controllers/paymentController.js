const mongoose = require("mongoose");
const Payment = require("../models/Payment");
const Booking = require("../models/Booking");
const AppError = require("../utils/AppError");
const asyncHandler = require("../utils/asyncHandler");
const paystack = require("../services/paystackService");
const { expireStaleBookings, round2 } = require("../services/bookingService");
const {
  toKobo,
  generateReference,
  issueRefund,
  confirmPayment,
  handleWebhookEvent,
} = require("../services/paymentService");

const paginate = (query) => {
  const page = Math.max(parseInt(query.page) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit) || 12, 1), 50);
  return { page, limit, skip: (page - 1) * limit };
};

const isAdmin = (user) => user.role === "admin";

// ---------- renter ----------

// POST /api/payments/initialize   { bookingId }
// Returns a Paystack checkout URL. Redirect the renter there (or open it in a popup).
exports.initializePayment = asyncHandler(async (req, res) => {
  const { bookingId } = req.body;
  if (!mongoose.isValidObjectId(bookingId)) throw new AppError("A valid bookingId is required.", 400);

  await expireStaleBookings();
  const booking = await Booking.findById(bookingId);
  if (!booking) throw new AppError("Booking not found.", 404);
  if (!booking.renter.equals(req.user._id)) throw new AppError("You can only pay for your own bookings.", 403);

  if (booking.status !== "pending_payment") {
    throw new AppError(
      `This booking is ${booking.status.replace(/_/g, " ")} and cannot be paid for.`,
      409
    );
  }

  // Double click or page refresh: hand back the checkout that is already open
  const existing = await Payment.findOne({ booking: booking._id, status: "pending", isDuplicate: false }).sort({
    createdAt: -1,
  });
  if (existing && existing.authorizationUrl && existing.amount === booking.totalAmount) {
    return res.json({
      status: "success",
      data: {
        authorizationUrl: existing.authorizationUrl,
        reference: existing.reference,
        amount: existing.amount,
        currency: existing.currency,
      },
    });
  }

  const reference = generateReference();
  const callbackUrl =
    process.env.PAYSTACK_CALLBACK_URL || (process.env.CLIENT_URL ? `${process.env.CLIENT_URL}/payment/callback` : undefined);

  const tx = await paystack.initializeTransaction({
    email: req.user.email,
    amountKobo: toKobo(booking.totalAmount),
    reference,
    callbackUrl,
    currency: "NGN",
    metadata: { bookingId: booking._id.toString(), payerId: req.user._id.toString() },
  });

  const payment = await Payment.create({
    booking: booking._id,
    payer: req.user._id,
    amount: booking.totalAmount,
    currency: "NGN",
    reference: tx.reference || reference,
    accessCode: tx.access_code,
    authorizationUrl: tx.authorization_url,
  });

  res.status(201).json({
    status: "success",
    data: {
      authorizationUrl: payment.authorizationUrl,
      reference: payment.reference,
      amount: payment.amount,
      currency: payment.currency,
    },
  });
});

// GET /api/payments/verify/:reference
// Call this from the page Paystack redirects back to. It checks the payment with Paystack,
// so the booking updates even if the webhook is delayed.
exports.verifyPayment = asyncHandler(async (req, res) => {
  const payment = await Payment.findOne({ reference: req.params.reference });
  if (!payment) throw new AppError("Payment not found.", 404);
  if (!isAdmin(req.user) && !payment.payer.equals(req.user._id)) {
    throw new AppError("You do not have access to this payment.", 403);
  }

  const updated = await confirmPayment(payment.reference);
  const booking = await Booking.findById(updated.booking).select("status expiresAt totalAmount");

  res.json({ status: "success", data: { payment: updated, booking } });
});

// GET /api/payments/my
exports.getMyPayments = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query);
  const filter = { payer: req.user._id };

  const [payments, total] = await Promise.all([
    Payment.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Payment.countDocuments(filter),
  ]);

  res.json({
    status: "success",
    results: payments.length,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    data: { payments },
  });
});

// GET /api/payments/:id  (the payer or an admin)
exports.getPayment = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new AppError("Payment not found.", 404);

  const payment = await Payment.findById(req.params.id);
  if (!payment) throw new AppError("Payment not found.", 404);
  if (!isAdmin(req.user) && !payment.payer.equals(req.user._id)) {
    throw new AppError("You do not have access to this payment.", 403);
  }

  res.json({ status: "success", data: { payment } });
});

// ---------- admin ----------

// GET /api/payments?status=paid&booking=<id>&payer=<id>
exports.getPayments = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query);

  const filter = {};
  if (Payment.STATUSES.includes(req.query.status)) filter.status = req.query.status;
  if (mongoose.isValidObjectId(req.query.booking)) filter.booking = req.query.booking;
  if (mongoose.isValidObjectId(req.query.payer)) filter.payer = req.query.payer;

  const [payments, total] = await Promise.all([
    Payment.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Payment.countDocuments(filter),
  ]);

  res.json({
    status: "success",
    results: payments.length,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    data: { payments },
  });
});

// POST /api/payments/:id/refund   { amount?, reason }
// Manual refund, e.g. to settle a dispute. Without `amount` it refunds whatever is left.
exports.refundPayment = asyncHandler(async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) throw new AppError("Payment not found.", 404);

  const payment = await Payment.findById(req.params.id);
  if (!payment) throw new AppError("Payment not found.", 404);
  if (!["paid", "partially_refunded"].includes(payment.status)) {
    throw new AppError(`A ${payment.status.replace(/_/g, " ")} payment cannot be refunded.`, 409);
  }

  const reason = typeof req.body.reason === "string" ? req.body.reason.trim().slice(0, 500) : "";
  if (!reason) throw new AppError("Please give a reason for the refund.", 400);

  const remaining = round2(payment.amount - payment.refundedAmount);
  const amount = req.body.amount === undefined ? remaining : Number(req.body.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > remaining) {
    throw new AppError(`Refund amount must be between 0 and ${remaining}.`, 400);
  }

  const result = await issueRefund(payment._id, {
    target: round2(payment.refundedAmount + amount),
    type: "manual",
    reason,
  });
  if (!result) {
    throw new AppError("A refund is already being processed for this payment. Try again in a few minutes.", 409);
  }

  res.json({ status: "success", data: { payment: await Payment.findById(payment._id) } });
});

// ---------- Paystack webhook ----------

// POST /api/payments/webhook   (public, but only accepts requests signed by Paystack)
// Set this URL in your Paystack dashboard: Settings > API Keys & Webhooks.
exports.handleWebhook = async (req, res) => {
  const signature = req.headers["x-paystack-signature"];

  if (!paystack.isValidSignature(req.rawBody, signature)) {
    return res.status(401).send("Invalid signature");
  }

  try {
    await handleWebhookEvent(req.body);
  } catch (err) {
    // A non-200 makes Paystack retry later, which is what we want for temporary failures
    console.error("Webhook processing failed:", err.message);
    return res.status(500).send("Processing failed");
  }

  res.sendStatus(200);
};