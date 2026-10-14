const mongoose = require("mongoose");

const CONDITIONS = ["new", "like-new", "good", "fair"];
const STATUSES = ["active", "paused", "removed"];

const imageSchema = new mongoose.Schema(
  {
    url: { type: String, required: [true, "Image url is required"], trim: true },
    isPrimary: { type: Boolean, default: false },
  },
  { _id: false }
);

const equipmentSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: [true, "Category is required"],
    },

    title: {
      type: String,
      required: [true, "Title is required"],
      trim: true,
      minlength: [3, "Title must be at least 3 characters"],
      maxlength: [120, "Title cannot exceed 120 characters"],
    },
    description: {
      type: String,
      required: [true, "Description is required"],
      trim: true,
      maxlength: [3000, "Description cannot exceed 3000 characters"],
    },
    brand: { type: String, trim: true, maxlength: 60 },
    model: { type: String, trim: true, maxlength: 60 },
    condition: {
      type: String,
      enum: { values: CONDITIONS, message: `Condition must be one of: ${CONDITIONS.join(", ")}` },
      default: "good",
    },

    // Pricing (amounts in your base currency, e.g. NGN)
    dailyRate: {
      type: Number,
      required: [true, "Daily rate is required"],
      min: [1, "Daily rate must be greater than 0"],
    },
    weeklyRate: { type: Number, min: [1, "Weekly rate must be greater than 0"] },
    securityDeposit: { type: Number, default: 0, min: [0, "Security deposit cannot be negative"] },

    images: {
      type: [imageSchema],
      validate: [(arr) => arr.length <= 10, "You can upload at most 10 images"],
    },

    location: {
      address: { type: String, trim: true },
      city: { type: String, required: [true, "City is required"], trim: true },
      state: { type: String, required: [true, "State is required"], trim: true },
      // GeoJSON point: coordinates are [longitude, latitude]. Optional.
      geo: {
        type: { type: String, enum: ["Point"], default: undefined },
        coordinates: {
          type: [Number],
          default: undefined,
          validate: {
            validator: (v) =>
              !v ||
              (v.length === 2 && Math.abs(v[0]) <= 180 && Math.abs(v[1]) <= 90),
            message: "Coordinates must be [longitude, latitude] within valid ranges",
          },
        },
      },
    },

    status: { type: String, enum: STATUSES, default: "active" },

    // Aggregated from reviews (updated by the review controller later)
    rating: {
      average: { type: Number, default: 0, min: 0, max: 5 },
      count: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

equipmentSchema.index({ status: 1, category: 1, dailyRate: 1 });
equipmentSchema.index({ status: 1, "location.city": 1 });
equipmentSchema.index({ owner: 1, status: 1 });
equipmentSchema.index({ "location.geo": "2dsphere" });

equipmentSchema.pre("validate", function () {
  // Ensure exactly one primary image when there are images
  if (this.images && this.images.length > 0) {
    const firstPrimary = this.images.findIndex((img) => img.isPrimary);
    const primaryIndex = firstPrimary === -1 ? 0 : firstPrimary;
    this.images.forEach((img, i) => {
      img.isPrimary = i === primaryIndex;
    });
  }

  // Drop an incomplete geo object so the 2dsphere index never sees a bad value
  const geo = this.location && this.location.geo;
  if (geo && (!geo.coordinates || geo.coordinates.length !== 2)) {
    this.set("location.geo", undefined);
  }
});

equipmentSchema.set("toJSON", {
  transform: (doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

const Equipment = mongoose.model("Equipment", equipmentSchema);

module.exports = Equipment;
module.exports.CONDITIONS = CONDITIONS;
module.exports.STATUSES = STATUSES;