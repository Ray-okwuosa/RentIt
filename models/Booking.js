const mongoose = require("mongoose");

const STATUSES = [
  "pending_payment", // created, waiting for the renter to pay (short hold on the dates)
  "pending_approval", // paid, waiting for the owner to approve or reject
  "approved", // owner approved, waiting for pickup
  "rejected", // owner rejected (refund due)
  "in_use", // renter has the equipment
  "returned", // owner confirmed the equipment is back
  "completed", // deposit settled, owner payout can be released
  "cancelled",
  "expired", // unpaid or unanswered until expiresAt
];

const bookingSchema = new mongoose.Schema(
  {
    equipment: { type: mongoose.Schema.Types.ObjectId, ref: "Equipment", required: true },
    renter: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    // Both dates are inclusive and stored as UTC midnight. Mon-Wed = 3 days.
    startDate: { type: Date, required: [true, "Start date is required"] },
    endDate: { type: Date, required: [true, "End date is required"] },
    totalDays: { type: Number, required: true, min: 1 },

    // Prices are snapshotted so later changes to the listing never alter this booking
    dailyRateSnapshot: { type: Number, required: true, min: 0 },
    subtotal: { type: Number, required: true, min: 0 },
    serviceFee: { type: Number, required: true, min: 0 },
    securityDeposit: { type: Number, required: true, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },

    status: { type: String, enum: STATUSES, default: "pending_payment" },
    notes: { type: String, trim: true, maxlength: [500, "Notes cannot exceed 500 characters"] },

    // pending_payment: payment deadline. pending_approval: owner response deadline.
    expiresAt: { type: Date, default: null },

    paidAt: Date,
    respondedAt: Date,
    pickedUpAt: Date,
    returnedAt: Date,
    completedAt: Date,
    cancelledAt: Date,
    expiredAt: Date,

    rejectionReason: { type: String, trim: true, maxlength: 500 },
    cancellationReason: { type: String, trim: true, maxlength: 500 },
    cancelledBy: { type: String, enum: ["renter", "owner", "admin"] },

    lateDays: { type: Number, default: 0, min: 0 },

    // Set when the booking is completed. The payment module uses these for the deposit refund.
    depositDeduction: { type: Number, default: 0, min: 0 },
    depositDeductionReason: { type: String, trim: true, maxlength: 500 },
    depositRefundAmount: { type: Number, min: 0 },
  },
  {
    timestamps: true,
    id: false,
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        delete ret.__v;
        return ret;
      },
    },
  }
);

bookingSchema.index({ equipment: 1, status: 1, startDate: 1, endDate: 1 });
bookingSchema.index({ renter: 1, createdAt: -1 });
bookingSchema.index({ owner: 1, createdAt: -1 });
bookingSchema.index({ status: 1, expiresAt: 1 });

// In use but past the agreed end date
bookingSchema.virtual("isOverdue").get(function () {
  if (this.status !== "in_use" || !this.endDate) return false;
  const now = new Date();
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return this.endDate.getTime() < today;
});

bookingSchema.pre("validate", function () {
  if (this.startDate && this.endDate && this.endDate < this.startDate) {
    this.invalidate("endDate", "End date cannot be before start date");
  }
});

const Booking = mongoose.model("Booking", bookingSchema);

module.exports = Booking;
module.exports.STATUSES = STATUSES;