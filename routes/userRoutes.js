const express = require("express");
const { protect, restrictTo } = require("../middleware/auth");
const {
  getMe,
  updateMe,
  changePassword,
  becomeOwner,
  deactivateMe,
  getUserProfile,
  getUsers,
  adminUpdateUser,
  adminDeleteUser,
} = require("../controllers/userController");

const router = express.Router();

// Logged-in user (these must come before "/:id")
router.get("/me", protect, getMe);
router.patch("/me", protect, updateMe);
router.delete("/me", protect, deactivateMe);
router.patch("/me/password", protect, changePassword);
router.post("/me/become-owner", protect, becomeOwner);

// Admin
router.get("/", protect, restrictTo("admin"), getUsers);
router.patch("/:id", protect, restrictTo("admin"), adminUpdateUser);
router.delete("/:id", protect, restrictTo("admin"), adminDeleteUser);

// Public profile
router.get("/:id", getUserProfile);

module.exports = router;