import mongoose from "mongoose";
import Equipment from "../models/Equipment.js";
import {
  parseDate,
  validateDateRange,
} from "../utils/dateUtils.js";

// CREATE TEST EQUIPMENT
export const createTestEquipment = async (req, res) => {
  try {
    const {
      name,
      pricePerDay,
      securityDeposit,
    } = req.body;

    // Validate the required equipment details.
    if (
      !name ||
      pricePerDay === undefined ||
      securityDeposit === undefined
    ) {
      return res.status(400).json({
        message:
          "name, pricePerDay and securityDeposit are required",
      });
    }

    // The authenticated user's ID determines ownership.
    const ownerId = req.user.id;

    const equipment = await Equipment.create({
      ownerId,
      name,
      pricePerDay,
      securityDeposit,
    });

    return res.status(201).json({
      message: "Test equipment created successfully",
      equipment,
    });
  } catch (error) {
    console.error("Create test equipment error:", error);

    return res.status(500).json({
      message: "Failed to create test equipment",
    });
  }
};

// ADD UNAVAILABLE PERIOD MANUALLY
export const addUnavailablePeriod = async (req, res) => {
  try {
    const { equipmentId } = req.params;
    const { startDate, endDate } = req.body || {};

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

    const equipment = await Equipment.findById(equipmentId);

    if (!equipment) {
      return res.status(404).json({
        message: "Equipment not found",
      });
    }

    // Only the owner may change this equipment's availability.
    if (equipment.ownerId.toString() !== req.user.id) {
      return res.status(403).json({
        message:
          "You are not authorized to change this equipment's availability",
      });
    }

    equipment.unavailablePeriods.push({
      startDate: parsedStartDate,
      endDate: parsedEndDate,
    });

    await equipment.save();

    return res.status(200).json({
      message: "Unavailable period added successfully",
      equipment,
    });
  } catch (error) {
    console.error("Add unavailable period error:", error);

    return res.status(500).json({
      message: "Failed to add unavailable period",
    });
  }
};