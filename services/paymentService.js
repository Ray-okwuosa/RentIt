const crypto = require("crypto");
const mongoose = require("mongoose");
const Payment = require("../models/Payment");
const Booking = require("../models/Booking");
const AppError = require("../utils/AppError");
const paystack = require("./paystackService");
const { markBookingPaid, expireStaleBookings, daysBetween, round2 } = require("./bookingService");

const REFUND_LOCK_MS = 5 * 60 * 1000;
const REFUNDABLE = ["paid", "partially_refunded"];
const TERMINAL_BOOKING = ["rejected", "cancelled", "expired", "completed"];

const toKobo = (amount) => Math.round(amount * 100);
const generateReference = () => `RH-${Date.now()}-${crypto.randomBytes(5).toString("hex")}`;
const logError = (label) => (err) => console.error(`${label}:`, err.message);

const numberFromEnv = (value, fallback) => {
  const n = Number(value);
  return value !== undefined && Number.isFinite(n) && n >= 0 ? n : fallback;
};

const cancellationPolicy = () => ({
  freeDays: numberFromEnv(process.env.CANCELLATION_FREE_DAYS, 2),
  lateFeePercent: numberFromEnv(process.env.LATE_CANCELLATION_FEE_PERCENT, 50),
});

// ---------- refund policy ----------

// How much the renter should get back in total for a booking in its current state.
// Returns null while the booking is still active.
const refundTarget = (booking) => {
  switch (booking.status) {
    case "rejected":
      return { type: "rejection", amount: booking.totalAmount };

    case "expired":
      return { type: "expiry", amount: booking.totalAmount };

    case "cancelled": {
      let amount = booking.totalAmount;
      // Renter cancels after the owner approved, and the start date is close: keep a
      // percentage of the rental price (subtotal) as a late cancellation fee.
      if (booking.cancelledBy === "renter" && booking.respondedAt) {
        const c = booking.cancelledAt || new Date();
        const cancelDay = new Date(Date.UTC(c.getUTCFullYear(), c.getUTCMonth(), c.getUTCDate()));
        const { freeDays, lateFeePercent } = cancellationPolicy();
        if (daysBetween(cancelDay, booking.startDate) < freeDays) {
          amount = round2(booking.totalAmount - (booking.subtotal * lateFeePercent) / 100);
        }
      }
      return { type: "cancellation", amount };
    }

    case "completed":
      return { type: "deposit", amount: booking.depositRefundAmount || 0 };

    default:
      return null;
  }
};

// ---------- refunds ----------

// Refunds money on a payment so that the total refunded reaches `target`.
// Safe to call repeatedly: it locks the payment, never refunds more than `target`,
// and records the refund before calling Paystack so a crash can't cause a double refund.
const issueRefund = async (paymentId, { target, type, reason, settle = false }) => {
  const now = new Date();

  const payment = await Payment.findOneAndUpdate(
    {
      _id: paymentId,
      status: { $in: REFUNDABLE },
      $or: [{ refundLockedAt: null }, { refundLockedAt: { $lt: new Date(now.getTime() - REFUND_LOCK_MS) } }],
    },
    { refundLockedAt: now },
    { new: true }
  );
  if (!payment) return null; // not refundable, or another process is already on it

  const remaining = round2(Math.min(target, payment.amount) - payment.refundedAmount);
  if (remaining <= 0) {
    await Payment.updateOne({ _id: paymentId }, { refundLockedAt: null, ...(settle && { refundSettled: true }) });
    return null;
  }

  // Record the refund first (reserves the amount)
  const refundId = new mongoose.Types.ObjectId();
  const newTotal = round2(payment.refundedAmount + remaining);
  await Payment.updateOne(
    { _id: paymentId },
    {
      $push: { refunds: { _id: refundId, amount: remaining, type, reason, status: "pending" } },
      $set: {
        refundedAmount: newTotal,
        status: newTotal >= payment.amount ? "refunded" : "partially_refunded",
        ...(settle && { refundSettled: true }),
      },
    }
  );

  try {
    const data = await paystack.createRefund({
      reference: payment.reference,
      amountKobo: toKobo(remaining),
      note: reason || `RentHub refund (${type})`,
    });

    const set = { "refunds.$.status": data.status || "pending" };
    if (data.id != null) set["refunds.$.providerRefundId"] = String(data.id);
    await Payment.updateOne({ _id: paymentId, "refunds._id": refundId }, { $set: set, refundLockedAt: null });

    return { refundId, amount: remaining };
  } catch (err) {
    // Could not create the refund: release the reserved amount. The lock stays in place,
    // so the sweeper retries after REFUND_LOCK_MS.
    await Payment.updateOne(
      { _id: paymentId, "refunds._id": refundId },
      {
        $set: {
          "refunds.$.status": "failed",
          "refunds.$.error": err.message,
          refundedAmount: payment.refundedAmount,
          status: payment.status,
          refundSettled: payment.refundSettled,
        },
      }
    );
    throw err;
  }
};

// Issues whatever refund the booking's current state calls for (full, partial or none)
const refundForBooking = async (bookingId) => {
  const booking = await Booking.findById(bookingId);
  if (!booking) return null;

  const target = refundTarget(booking);
  if (!target) return null;

  const payment = await Payment.findOne({
    booking: booking._id,
    isDuplicate: false,
    refundSettled: false,
    status: { $in: REFUNDABLE },
  }).sort({ paidAt: 1 });
  if (!payment) return null;

  return issueRefund(payment._id, {
    target: target.amount,
    type: target.type,
    reason: `Booking ${booking.status}`,
    settle: true,
  });
};

// Background sweep: expires stale bookings, then issues or retries any refunds that are due.
// Run this every minute (see server.js).
const processRefunds = async () => {
  await expireStaleBookings();
  const lockCutoff = new Date(Date.now() - REFUND_LOCK_MS);

  // 1. Duplicate payments are always refunded in full
  const duplicates = await Payment.find({ isDuplicate: true, status: { $in: REFUNDABLE } }).limit(50);
  for (const p of duplicates) {
    await issueRefund(p._id, { target: p.amount, type: "duplicate", reason: "Duplicate payment", settle: true }).catch(
      logError(`Duplicate refund failed for payment ${p._id}`)
    );
  }

  // 2. Payments whose booking has ended in a refundable state
  const due = await Payment.aggregate([
    {
      $match: {
        isDuplicate: false,
        refundSettled: false,
        status: { $in: REFUNDABLE },
        $or: [{ refundLockedAt: null }, { refundLockedAt: { $lt: lockCutoff } }],
      },
    },
    { $lookup: { from: Booking.collection.name, localField: "booking", foreignField: "_id", as: "b" } },
    { $match: { "b.status": { $in: TERMINAL_BOOKING } } },
    { $limit: 100 },
    { $project: { booking: 1 } },
  ]);

  for (const row of due) {
    await refundForBooking(row.booking).catch(logError(`Refund failed for booking ${row.booking}`));
  }
};

// ---------- confirming payments ----------

// Verifies a transaction with Paystack and updates the payment and booking.
// Safe to call many times and from several places (webhook, redirect page, retries).
const confirmPayment = async (reference) => {
  const payment = await Payment.findOne({ reference });
  if (!payment) throw new AppError("Payment not found.", 404);
  if (!["pending", "failed"].includes(payment.status)) return payment; // already handled

  const tx = await paystack.verifyTransaction(reference);

  if (tx.status === "failed") {
    await Payment.updateOne(
      { _id: payment._id, status: "pending" },
      { status: "failed", failureReason: tx.gateway_response || "Payment failed" }
    );
    return Payment.findById(payment._id);
  }

  if (tx.status !== "success") return payment; // abandoned / ongoing: still waiting for the customer

  // Never trust a payment whose amount or currency differs from what we asked for
  if (Number(tx.amount) !== toKobo(payment.amount) || tx.currency !== payment.currency) {
    console.error(
      `Payment ${reference} amount mismatch: expected ${toKobo(payment.amount)} ${payment.currency}, got ${tx.amount} ${tx.currency}`
    );
    await Payment.updateOne(
      { _id: payment._id },
      { status: "failed", failureReason: "Amount or currency did not match the booking total" }
    );
    return Payment.findById(payment._id);
  }

  const paid = await Payment.findOneAndUpdate(
    { _id: payment._id, status: { $in: ["pending", "failed"] } },
    {
      status: "paid",
      paidAt: new Date(),
      method: tx.channel,
      gatewayResponse: tx.gateway_response,
      failureReason: null,
    },
    { new: true }
  );
  if (!paid) return Payment.findById(payment._id); // another request got there first

  // Paid twice for the same booking? The earlier payment wins; this one is refunded.
  const earlier = await Payment.exists({
    booking: paid.booking,
    _id: { $ne: paid._id },
    isDuplicate: false,
    status: { $in: ["paid", "partially_refunded", "refunded"] },
    $or: [{ paidAt: { $lt: paid.paidAt } }, { paidAt: paid.paidAt, _id: { $lt: paid._id } }],
  });
  if (earlier) {
    await Payment.updateOne({ _id: paid._id }, { isDuplicate: true });
    await issueRefund(paid._id, { target: paid.amount, type: "duplicate", reason: "Duplicate payment", settle: true }).catch(
      logError(`Duplicate refund failed for payment ${paid._id}`)
    );
    return Payment.findById(paid._id);
  }

  try {
    await markBookingPaid(paid.booking);
  } catch (err) {
    // The booking expired or was cancelled while the customer was paying. The money is ours
    // to return: expire anything stale, then refund according to the booking's final state.
    console.warn(`Payment ${reference} received but booking ${paid.booking} could not be activated: ${err.message}`);
    await expireStaleBookings();
    await refundForBooking(paid.booking).catch(logError(`Refund failed for booking ${paid.booking}`));
  }

  return Payment.findById(paid._id);
};

// ---------- webhooks ----------

const REFUND_STATE_RANK = { pending: 0, processing: 1, processed: 2, failed: 2 };

// Keeps our refund records in step with Paystack's refund.* events
const syncRefundEvent = async (event) => {
  const data = event.data || {};
  // Paystack's docs don't spell out the refund payload, so accept the likely shapes
  const reference = data.transaction_reference || (data.transaction && data.transaction.reference);
  if (!reference) return;

  const payment = await Payment.findOne({ reference });
  if (!payment) return;

  const state = event.event.split(".")[1]; // pending | processing | processed | failed
  const providerId = data.id != null ? String(data.id) : undefined;

  const refund =
    (providerId && payment.refunds.find((r) => r.providerRefundId === providerId)) ||
    [...payment.refunds].reverse().find((r) => ["pending", "processing"].includes(r.status));
  if (!refund) return;

  // Events can arrive out of order: never move a refund backwards
  if ((REFUND_STATE_RANK[state] ?? 0) < (REFUND_STATE_RANK[refund.status] ?? 0)) return;

  await Payment.updateOne({ _id: payment._id, "refunds._id": refund._id }, { $set: { "refunds.$.status": state } });

  if (state === "failed") {
    console.warn(`Paystack could not process refund ${refund._id} on payment ${payment.reference}. Needs manual attention.`);
  }
};

const handleWebhookEvent = async (event) => {
  if (!event || !event.event) return;

  if (event.event === "charge.success") {
    const reference = event.data && event.data.reference;
    if (!reference) return;
    try {
      await confirmPayment(reference);
    } catch (err) {
      if (err.statusCode === 404) return; // a Paystack payment that isn't one of ours
      throw err;
    }
    return;
  }

  if (event.event.startsWith("refund.")) {
    await syncRefundEvent(event);
  }
};

module.exports = {
  toKobo,
  generateReference,
  refundTarget,
  issueRefund,
  refundForBooking,
  processRefunds,
  confirmPayment,
  handleWebhookEvent,
};