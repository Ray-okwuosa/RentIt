const mongoose = require("mongoose");
const Equipment = require("../models/Equipment");
const Category = require("../models/Category");
const AppError = require("../utils/AppError");
const asyncHandler = require("../utils/asyncHandler");
const pick = require("../utils/pick");

const WRITABLE_FIELDS = [
  "category",
  "title",
  "description",
  "brand",
  "model",
  "condition",
  "dailyRate",
  "weeklyRate",
  "securityDeposit",
  "images",
  "location",
];

// Only expose safe owner details publicly (never bank details)
const OWNER_PUBLIC_FIELDS = "name profilePhoto rating isVerified ownerProfile.businessName address.city address.state";

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const SORTS = {
  newest: { createdAt: -1 },
  price_asc: { dailyRate: 1 },
  price_desc: { dailyRate: -1 },
  rating: { "rating.average": -1, "rating.count": -1 },
};

// Accepts a category id or slug and returns [category + its direct sub-categories]
const resolveCategoryIds = async (value) => {
  const category = mongoose.isValidObjectId(value)
    ? await Category.findById(value)
    : await Category.findOne({ slug: String(value).toLowerCase() });
  if (!category) return [];
  const children = await Category.find({ parent: category._id }).select("_id");
  return [category._id, ...children.map((c) => c._id)];
};

// Normalises location input into the schema shape. Accepts latitude/longitude (or an existing geo).
const buildLocation = (input) => {
  const { address, city, state, latitude, longitude, geo } = input || {};
  const location = { address, city, state };

  if (latitude != null && longitude != null && latitude !== "" && longitude !== "") {
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      throw new AppError("Invalid latitude or longitude.", 400);
    }
    location.geo = { type: "Point", coordinates: [lng, lat] };
  } else if (geo && Array.isArray(geo.coordinates) && geo.coordinates.length === 2) {
    location.geo = { type: "Point", coordinates: geo.coordinates };
  }
  return location;
};

const assertActiveCategory = async (id) => {
  if (!mongoose.isValidObjectId(id) || !(await Category.exists({ _id: id, isActive: true }))) {
    throw new AppError("Category not found or inactive.", 400);
  }
};

// Loads equipment and makes sure the current user owns it (admins can manage any)
const findOwned = async (req) => {
  const equipment = await Equipment.findOne({ _id: req.params.id, status: { $ne: "removed" } });
  if (!equipment) throw new AppError("Equipment not found.", 404);

  if (req.user.role !== "admin" && !equipment.owner.equals(req.user._id)) {
    throw new AppError("You can only manage your own equipment.", 403);
  }
  return equipment;
};

const paginate = (query) => {
  const page = Math.max(parseInt(query.page) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit) || 12, 1), 50);
  return { page, limit, skip: (page - 1) * limit };
};

// POST /api/equipment  (owner, admin)
exports.createEquipment = asyncHandler(async (req, res) => {
  const data = pick(req.body, WRITABLE_FIELDS);

  await assertActiveCategory(data.category);
  data.location = buildLocation(data.location);
  data.owner = req.user._id;

  const equipment = await Equipment.create(data);
  res.status(201).json({ status: "success", data: { equipment } });
});

// GET /api/equipment  (public search)
// ?q=excavator &category=<id|slug> &city=Lagos &state=Lagos &minPrice=5000 &maxPrice=50000
// &condition=good,like-new &owner=<id> &sort=newest|price_asc|price_desc|rating
// &lat=6.52&lng=3.37&radius=25 (km) &page=1&limit=12
exports.getEquipments = asyncHandler(async (req, res) => {
  const { q, category, city, state, minPrice, maxPrice, condition, owner, sort, lat, lng, radius } = req.query;
  const { page, limit, skip } = paginate(req.query);

  const filter = { status: "active" };

  if (q) {
    const regex = new RegExp(escapeRegex(q), "i");
    filter.$or = [{ title: regex }, { brand: regex }, { model: regex }, { description: regex }];
  }

  if (category) filter.category = { $in: await resolveCategoryIds(category) };
  if (city) filter["location.city"] = new RegExp(`^${escapeRegex(city)}$`, "i");
  if (state) filter["location.state"] = new RegExp(`^${escapeRegex(state)}$`, "i");

  const min = parseFloat(minPrice);
  const max = parseFloat(maxPrice);
  if (!Number.isNaN(min) || !Number.isNaN(max)) {
    filter.dailyRate = {};
    if (!Number.isNaN(min)) filter.dailyRate.$gte = min;
    if (!Number.isNaN(max)) filter.dailyRate.$lte = max;
  }

  if (condition) {
    const wanted = String(condition).split(",").map((c) => c.trim());
    filter.condition = { $in: wanted.filter((c) => Equipment.CONDITIONS.includes(c)) };
  }

  if (owner && mongoose.isValidObjectId(owner)) filter.owner = owner;

  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lng);
  if (!Number.isNaN(latNum) && !Number.isNaN(lngNum)) {
    const radiusKm = Math.min(parseFloat(radius) || 25, 500);
    filter["location.geo"] = {
      $geoWithin: { $centerSphere: [[lngNum, latNum], radiusKm / 6378.1] },
    };
  }

  const sortBy = { ...(SORTS[sort] || SORTS.newest), _id: -1 };

  const [equipments, total] = await Promise.all([
    Equipment.find(filter)
      .sort(sortBy)
      .skip(skip)
      .limit(limit)
      .populate("owner", OWNER_PUBLIC_FIELDS)
      .populate("category", "name slug"),
    Equipment.countDocuments(filter),
  ]);

  res.json({
    status: "success",
    results: equipments.length,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    data: { equipments },
  });
});

// GET /api/equipment/mine  (owner, admin) - all of my listings, including paused
exports.getMyEquipments = asyncHandler(async (req, res) => {
  const { page, limit, skip } = paginate(req.query);

  const filter = { owner: req.user._id, status: { $ne: "removed" } };
  if (["active", "paused"].includes(req.query.status)) filter.status = req.query.status;

  const [equipments, total] = await Promise.all([
    Equipment.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("category", "name slug"),
    Equipment.countDocuments(filter),
  ]);

  res.json({
    status: "success",
    results: equipments.length,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    data: { equipments },
  });
});

// GET /api/equipment/:id  (public)
exports.getEquipment = asyncHandler(async (req, res) => {
  const equipment = await Equipment.findOne({ _id: req.params.id, status: { $ne: "removed" } })
    .populate("owner", OWNER_PUBLIC_FIELDS)
    .populate("category", "name slug");
  if (!equipment) throw new AppError("Equipment not found.", 404);

  res.json({ status: "success", data: { equipment } });
});

// PATCH /api/equipment/:id  (owner of the listing, admin)
// Set status to "paused" to hide it from search, "active" to show it again.
exports.updateEquipment = asyncHandler(async (req, res) => {
  const equipment = await findOwned(req);
  const updates = pick(req.body, [...WRITABLE_FIELDS, "status"]);

  if (updates.status && !["active", "paused"].includes(updates.status)) {
    throw new AppError('Status must be "active" or "paused". Use DELETE to remove a listing.', 400);
  }
  if (updates.category) await assertActiveCategory(updates.category);

  if (updates.location) {
    const existing = equipment.toObject().location || {};
    updates.location = buildLocation({ ...existing, ...updates.location });
  }

  equipment.set(updates);
  await equipment.save();

  res.json({ status: "success", data: { equipment } });
});

// DELETE /api/equipment/:id  (owner of the listing, admin) - soft delete
exports.deleteEquipment = asyncHandler(async (req, res) => {
  const equipment = await findOwned(req);

  // TODO: once the Booking model exists, block removal while the equipment has
  // bookings in PENDING_APPROVAL / APPROVED / IN_USE status.

  equipment.status = "removed";
  await equipment.save({ validateBeforeSave: false });

  res.status(204).send();
});