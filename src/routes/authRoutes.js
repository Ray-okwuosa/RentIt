
import express from "express";

import {
  registerUser,
  loginUser,
  updateUserRole,
  getMe,
} from "../controllers/authController.js";

import protect from "../middleware/authMiddleware.js";
import authorizeRoles from "../middleware/roleMiddleware.js";

const router = express.Router();

// Public: create a renter account
router.post("/register", registerUser);

// Public: log in
router.post("/login", loginUser);

// Protected: get the currently logged-in user's details
router.get("/me", protect, getMe);

// Admin only: change a user's role
router.put(
  "/users/role",
  protect,
  authorizeRoles("admin"),
  updateUserRole
);

// Testing routes: useful during development
router.get(
  "/renter-only",
  protect,
  authorizeRoles("renter"),
  (req, res) => {
    res.json({ message: "Welcome renter" });
  }
);

router.get(
  "/owner-only",
  protect,
  authorizeRoles("owner"),
  (req, res) => {
    res.json({ message: "Welcome owner" });
  }
);

router.get(
  "/admin-only",
  protect,
  authorizeRoles("admin"),
  (req, res) => {
    res.json({ message: "Welcome admin" });
  }
);

export default router;