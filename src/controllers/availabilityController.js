import mongoose from "mongoose";
import Equipment from "../models/Equipment.js";
import {
  parseDate,
  validateDateRange,
} from "../utils/dateUtils.js";

import {
  checkEquipmentAvailability,
} from "../services/availabilityService.js";

export const getAllEquipment = async (req, res) => {
  try {
    const equipment = await Equipment.find().populate("ownerId", "name email");
    return res.status(200).json({
      success: true,
      count: equipment.length,
      equipment,
    });
  } catch (error) {
    console.error("Failed to retrieve equipment:", error);
    return res.status(500).json({
      message: "Failed to retrieve equipment",
    });
  }
};

export const getEquipmentById = async (req, res) => {
  try {
    const { equipmentId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(equipmentId)) {
      return res.status(400).json({
        message: "Invalid equipment ID",
      });
    }

    const equipment = await Equipment.findById(equipmentId).populate("ownerId", "name email");

    if (!equipment) {
      return res.status(404).json({
        message: "Equipment not found",
      });
    }

    return res.status(200).json({
      success: true,
      equipment,
    });
  } catch (error) {
    console.error("Failed to retrieve equipment:", error);
    return res.status(500).json({
      message: "Failed to retrieve equipment",
    });
  }
};

export const getEquipmentAvailability = async (
  req,
  res
) => {
  try {
    const { equipmentId } = req.params;
    const { startDate, endDate } = req.query;

    if (!mongoose.Types.ObjectId.isValid(equipmentId)) {
      return res.status(400).json({
        message: "Invalid equipment ID",
      });
    }

    if (!startDate || !endDate) {
      return res.status(400).json({
        message: "startDate and endDate are required",
      });
    }

    const parsedStartDate = parseDate(startDate);
    const parsedEndDate = parseDate(endDate);

    const dateValidation = validateDateRange(
      parsedStartDate,
      parsedEndDate
    );

    if (!dateValidation.valid) {
      return res.status(400).json({
        message: dateValidation.message,
      });
    }

    const result = await checkEquipmentAvailability({
      equipmentId,
      startDate: parsedStartDate,
      endDate: parsedEndDate,
    });

    if (result.reason === "EQUIPMENT_NOT_FOUND") {
      return res.status(404).json({
        available: false,
        message: result.message,
      });
    }

    return res.status(200).json({
      available: result.available,
      message: result.message,
      startDate,
      endDate,
    });
  } catch (error) {
    console.error("Availability check failed:", error);

    return res.status(500).json({
      message: "Failed to check equipment availability",
    });
  }

};