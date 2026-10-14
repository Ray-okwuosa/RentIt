const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema(
  {
    // One review per booking (enforced by the unique index)
    booking: { type: mongoose.Schema.Types.ObjectId, ref: "Booking", required: true, unique: true },
    equipment: { type: mongoose.Schema.Types.ObjectId, ref: "Equipment", required: true },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // the person being reviewed
    renter: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }, // the reviewer

    rating: {
      type: Number,
      required: [true, "Rating is required"],
      min: [1, "Rating must be at least 1"],
      max: [5, "Rating cannot be more than 5"],
      validate: { validator: Number.isInteger, message: "Rating must be a whole number" },
    },
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

reviewSchema.set("toJSON", {
  transform: (doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model("Review", reviewSchema);