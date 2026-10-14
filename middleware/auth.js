const jwt = require("jsonwebtoken");
const User = require("../models/User");
const AppError = require("../utils/AppError");
const asyncHandler = require("../utils/asyncHandler");

// Requires a valid Bearer token and attaches the user to req.user
exports.protect = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    throw new AppError("You are not logged in. Please log in to continue.", 401);
  }

  const token = header.split(" ")[1];

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    throw new AppError("Invalid or expired token. Please log in again.", 401);
  }

  const user = await User.findById(decoded.id);
  if (!user) throw new AppError("The user for this token no longer exists.", 401);
  if (!user.isActive) throw new AppError("This account has been deactivated.", 403);
  if (user.changedPasswordAfter(decoded.iat)) {
    throw new AppError("Password was changed recently. Please log in again.", 401);
  }

  req.user = user;
  next();
});

// Usage: restrictTo("admin") or restrictTo("owner", "admin")
exports.restrictTo =
  (...roles) =>
  (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(new AppError("You do not have permission to perform this action.", 403));
    }
    next();
  };