const User = require("../models/User");
const AppError = require("../utils/AppError");
const asyncHandler = require("../utils/asyncHandler");
const { sendTokenResponse } = require("../utils/token");

// POST /api/auth/register
exports.register = asyncHandler(async (req, res) => {
  const { name, email, phone, password, role } = req.body;

  // Users may sign up as renter or owner. Admins are created manually.
  const safeRole = role === "owner" ? "owner" : "renter";

  const existing = await User.findOne({ email: email?.toLowerCase() });
  if (existing) throw new AppError("An account with this email already exists.", 409);

  const user = await User.create({ name, email, phone, password, role: safeRole });

  sendTokenResponse(user, 201, res);
});

// POST /api/auth/login
exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    throw new AppError("Please provide email and password.", 400);
  }

  const user = await User.findOne({ email: email.toLowerCase() }).select("+password");
  if (!user || !(await user.comparePassword(password))) {
    throw new AppError("Incorrect email or password.", 401);
  }
  if (!user.isActive) throw new AppError("This account has been deactivated.", 403);

  user.lastLoginAt = new Date();
  await user.save({ validateBeforeSave: false });

  sendTokenResponse(user, 200, res);
});