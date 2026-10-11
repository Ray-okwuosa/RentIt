
import "dotenv/config";
import mongoose from "mongoose";

import connectDB from "./src/config/db.js";
import Booking from "./src/models/Booking.js";
import Equipment from "./src/models/Equipment.js";
import { checkEquipmentAvailability } from "./src/services/availabilityService.js";
import { parseDate } from "./src/utils/dateUtils.js";

const equipmentId = "6ac9551c93c5d4f19c7d6f91";

let temporaryBookingId;

try {
  await connectDB();

  const equipment = await Equipment.findById(equipmentId);

  if (!equipment) {
    throw new Error("Test equipment was not found");
  }

  // Create a temporary approved booking for the test dates.
  const temporaryBooking = await Booking.create({
    renterId: new mongoose.Types.ObjectId(),
    ownerId: equipment.ownerId,
    equipmentId: equipment._id,
    startDate: parseDate("2026-10-18"),
    endDate: parseDate("2026-10-20"),
    rentalDays: 3,
    pricePerDay: equipment.pricePerDay,
    rentalAmount: equipment.pricePerDay * 3,
    securityDeposit: equipment.securityDeposit,
    totalAmount:
      equipment.pricePerDay * 3 + equipment.securityDeposit,
    status: "approved",
    paymentStatus: "succeeded",
  });

  temporaryBookingId = temporaryBooking._id;

  const result = await checkEquipmentAvailability({
    equipmentId,
    startDate: parseDate("2026-10-20"),
    endDate: parseDate("2026-10-22"),
  });

  console.log("Availability result:", result);
  console.log(
    "Conflict detected correctly:",
    result.available === false &&
      result.reason === "BOOKING_CONFLICT"
  );
} catch (error) {
  console.error("Test failed:", error.message);
} finally {
  // Remove the temporary test booking, even if the test fails.
  if (temporaryBookingId) {
    await Booking.findByIdAndDelete(temporaryBookingId);
    console.log("Temporary test booking removed.");
  }

  await mongoose.disconnect();
}
