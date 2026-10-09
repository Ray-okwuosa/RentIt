import express from "express";

import {
  createTestEquipment,
  addUnavailablePeriod,
} from "../controllers/testEquipmentController.js";

import protect from "../middleware/authMiddleware.js";

const router = express.Router();

// A logged-in user can create test equipment.
// The controller assigns ownership using the authenticated user's ID.
router.post("/", protect, createTestEquipment);

// Only the equipment owner can add an unavailable period.
// The controller checks ownership after authentication.
router.patch(
  "/:equipmentId/unavailable",
  protect,
  addUnavailablePeriod
);

export default router;