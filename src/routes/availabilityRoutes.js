import express from "express";

import {
  getAllEquipment,
  getEquipmentById,
  getEquipmentAvailability,
} from "../controllers/availabilityController.js";

const router = express.Router();

router.get("/", getAllEquipment);
router.get("/:equipmentId", getEquipmentById);
router.get(
  "/:equipmentId/availability",
  getEquipmentAvailability
);

export default router;