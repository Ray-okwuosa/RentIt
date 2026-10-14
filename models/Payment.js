const mongoose = require("mongoose");

const STATUSES = ["pending", "paid", "failed", "partially_refunded", "refunded"];
const REFUND_TYPES = ["rejection", "expiry", "cancellation", "deposit", "duplicate", "manual"];

const refundSchema = new mongoose.Schema({
  amount: { type: Number, required: true, min: 0 },
  type: { type: String, enum: REFUND_TYPES, required: true },
  reason: { type: String, trim: true, maxlength: 500 },
  // Paystack's own refund state: pending, processing, processed, failed, needs-attention.
  // "failed" with an `error` means we could not even create the refund (it is retried automatically).
  status: { type: String, default: "pending" },
  providerRefundId: String,
  error: String,
  createdAt: { type: Date, default: Date.now },
});

const paymentSchema = new mongoose.Schema(
  {
    booking: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", required: true },
    payer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    // Amount in naira (major units). Converted to kobo when talking to Paystack.
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "NGN", uppercase: true },
    provider: { type: String, default: "paystack" },

    reference: { type: String, required: true, unique: true },
    accessCode: String,
    authorizationUrl: String,

    status: { type: String, enum: STATUSES, default: "pending" },
    method: String, // card, bank_transfer, ussd, ...
    gatewayResponse: String,
    failureReason: String,
    paidAt: Date,

    refundedAmount: { type: Number, default: 0, min: 0 },
    refunds: [refundSchema],

    // true once the refund owed for this booking has been fully issued (nothing left to do)
    refundSettled: { type: Boolean, default: false },
    // A second successful payment for a booking that was already paid. Always refunded in full.
    isDuplicate: { type: Boolean, default: false },
    // Prevents two processes refunding the same payment at once. After a failed attempt it also
    // delays the retry until the lock expires.
    refundLockedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

paymentSchema.index({ booking: 1, status: 1 });
paymentSchema.index({ payer: 1, createdAt: -1 });
paymentSchema.index({ status: 1, refundSettled: 1 });

paymentSchema.set("toJSON", {
  transform: (doc, ret) => {
    delete ret.__v;
    delete ret.accessCode;
    delete ret.refundLockedAt;
    return ret;
  },
});

const Payment = mongoose.model("Payment", paymentSchema);

module.exports = Payment;
module.exports.STATUSES = STATUSES;
module.exports.REFUND_TYPES = REFUND_TYPES;