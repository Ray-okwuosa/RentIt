const mongoose = require("mongoose");

// A whole number from 1 to 5
const ratingField = (label) => ({
  type: Number,
  required: [true, `${label} is required`],
  min: [1, `${label} must be at least 1`],
  max: [5, `${label} cannot be more than 5`],
  validate: { validator: Number.isInteger, message: `${label} must be a whole number` },
});

const reviewSchema = new mongoose.Schema(
  {
    // One review per booking (enforced by the unique index)
    booking: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", required: true, unique: true },
    equipment: { type: mongoose.Schema.Types.ObjectId, ref: "Equipment", required: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // the person being reviewed
    renter: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // the reviewer

    // The three ratings the renter gives
    communicationRating: ratingField("Communication rating"),
    reliabilityRating: ratingField("Reliability rating"),
    equipmentRating: ratingField("Equipment rating"),

    // Overall rating = average of the three above (e.g. 5, 4, 4 -> 4.33).
    // Calculated automatically before every save. It cannot be set directly.
    rating: { type: Number, min: 1, max: 5 },

    comment: { type: String, trim: true, maxlength: [1000, "Comment cannot exceed 1000 characters"] },

    // The owner's public response
    reply: {
      text: { type: String, trim: true, maxlength: [1000, "Reply cannot exceed 1000 characters"] },
      repliedAt: Date,
    },

    // Set by an admin to remove an abusive review from public view and from the averages
    isHidden: { type: Boolean, default: false },
  },
  { timestamps: true }
);

reviewSchema.index({ equipment: 1, isHidden: 1, createdAt: -1 });
reviewSchema.index({ owner: 1, isHidden: 1, createdAt: -1 });
reviewSchema.index({ renter: 1, createdAt: -1 });

// Overall rating is always derived from the three category ratings
reviewSchema.pre("validate", function () {
  const scores = [this.communicationRating, this.reliabilityRating, this.equipmentRating];
  if (scores.every(Number.isFinite)) {
    this.rating = Math.round(((scores[0] + scores[1] + scores[2]) / 3) * 100) / 100;
  }
});

reviewSchema.set("toJSON", {
  transform: (doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model("Review", reviewSchema);