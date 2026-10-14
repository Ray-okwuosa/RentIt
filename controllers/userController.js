const User = require("../models/User");
const AppError = require("../utils/AppError");
const asyncHandler = require("../utils/asyncHandler");
const { sendTokenResponse } = require("../utils/token");

// Pick only whitelisted keys from an object
const pick = (obj, allowed) =>
  Object.keys(obj || {})
    .filter((k) => allowed.includes(k))
    .reduce((acc, k) => ({ ...acc, [k]: obj[k] }), {});

// ---------------- Logged-in user ----------------

// GET /api/users/me
exports.getMe = asyncHandler(async (req, res) => {
  res.json({ status: "success", data: { user: req.user } });
});

// PATCH /api/users/me
exports.updateMe = asyncHandler(async (req, res) => {
  if (req.body.password || req.body.role) {
    throw new AppError("Use the dedicated endpoints to change password or role.", 400);
  }

  const updates = pick(req.body, ["name", "phone", "profilePhoto", "address"]);

  // Owner-specific details can only be edited by owners
  if (req.user.role === "owner" && req.body.ownerProfile) {
    const allowed = ["businessName", "bankName", "accountNumber", "accountName"];
    const profile = pick(req.body.ownerProfile, allowed);
    Object.keys(profile).forEach((k) => {
      updates[`ownerProfile.${k}`] = profile[k];
    });
  }

  const user = await User.findByIdAndUpdate(req.user._id, updates, {
    new: true,
    runValidators: true,
  });

  res.json({ status: "success", data: { user } });
});

// PATCH /api/users/me/password
exports.changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    throw new AppError("Please provide current and new password.", 400);
  }

  const user = await User.findById(req.user._id).select("+password");
  if (!(await user.comparePassword(currentPassword))) {
    throw new AppError("Current password is incorrect.", 401);
  }

  user.password = newPassword;
  await user.save(); // triggers hashing + passwordChangedAt

  sendTokenResponse(user, 200, res);
});

// POST /api/users/me/become-owner
exports.becomeOwner = asyncHandler(async (req, res) => {
  if (req.user.role === "admin") {
    throw new AppError("Admins cannot switch roles.", 400);
  }
  if (req.user.role === "owner") {
    throw new AppError("You are already an owner.", 400);
  }

  const profile = pick(req.body, ["businessName", "bankName", "accountNumber", "accountName"]);

  req.user.role = "owner";
  req.user.ownerProfile = { ...(req.user.ownerProfile?.toObject?.() || {}), ...profile };
  await req.user.save();

  res.json({ status: "success", data: { user: req.user } });
});

// DELETE /api/users/me  (deactivates the account)
exports.deactivateMe = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(req.user._id, { isActive: false });
  res.status(204).send();
});

// ---------------- Public ----------------

// GET /api/users/:id  (safe public profile, e.g. for viewing an equipment owner)
exports.getUserProfile = asyncHandler(async (req, res) => {
  const user = await User.findOne({ _id: req.params.id, isActive: true }).select(
    "name profilePhoto role rating isVerified createdAt ownerProfile.businessName address.city address.state"
  );
  if (!user) throw new AppError("User not found.", 404);

  res.json({ status: "success", data: { user } });
});

// ---------------- Admin ----------------

// GET /api/users?role=owner&search=john&page=1&limit=20
exports.getUsers = asyncHandler(async (req, res) => {
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);

  const filter = {};
  if (req.query.role) filter.role = req.query.role;
  if (req.query.isActive) filter.isActive = req.query.isActive === "true";
  if (req.query.search) {
    const regex = new RegExp(req.query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ name: regex }, { email: regex }, { phone: regex }];
  }

  const [users, total] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    User.countDocuments(filter),
  ]);

  res.json({
    status: "success",
    results: users.length,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
    data: { users },
  });
});

// PATCH /api/users/:id  (admin: role, isActive, isVerified, owner ID verification)
exports.adminUpdateUser = asyncHandler(async (req, res) => {
  const updates = pick(req.body, ["role", "isActive", "isVerified"]);
  if (typeof req.body.idVerified === "boolean") {
    updates["ownerProfile.idVerified"] = req.body.idVerified;
  }

  const user = await User.findByIdAndUpdate(req.params.id, updates, {
    new: true,
    runValidators: true,
  });
  if (!user) throw new AppError("User not found.", 404);

  res.json({ status: "success", data: { user } });
});

// DELETE /api/users/:id  (admin: soft delete by deactivating)
exports.adminDeleteUser = asyncHandler(async (req, res) => {
  if (req.params.id === req.user._id.toString()) {
    throw new AppError("You cannot deactivate your own admin account here.", 400);
  }
  const user = await User.findByIdAndUpdate(req.params.id, { isActive: false });
  if (!user) throw new AppError("User not found.", 404);

  res.status(204).send();
});