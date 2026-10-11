
import "dotenv/config";
import mongoose from "mongoose";

import connectDB from "./src/config/db.js";
import Booking from "./src/models/Booking.js";
import Equipment from "./src/models/Equipment.js";
import { parseDate } from "./src/utils/dateUtils.js";

const equipmentId = "6ac9551c93c5d4f19c7d6f91";
let temporaryBookingId;

try {
  await connectDB();

  const equipment = await Equipment.findById(equipmentId);

  if (!equipment) {
    throw new Error("Test equipment was not found");
  }

  const temporaryBooking = await Booking.create({
    renterId: new mongoose.Types.ObjectId(),
    ownerId: equipment.ownerId,
    equipmentId: equipment._id,
    startDate: parseDate("2026-10-28"),
    endDate: parseDate("2026-10-29"),
    rentalDays: 2,
    pricePerDay: equipment.pricePerDay,
    rentalAmount: equipment.pricePerDay * 2,
    securityDeposit: equipment.securityDeposit,
    totalAmount:
      equipment.pricePerDay * 2 + equipment.securityDeposit,
    status: "pending",
    paymentStatus: "pending",
  });

  temporaryBookingId = temporaryBooking._id;

  // Test the model's cancellation-state transition.
  temporaryBooking.status = "cancelled";
  temporaryBooking.cancellationReason = "Automated test";

  await temporaryBooking.save();

  const savedBooking = await Booking.findById(temporaryBookingId);

  console.log("Cancellation status:", savedBooking.status);
  console.log(
    "Cancellation reason:",
    savedBooking.cancellationReason
  );
  console.log(
    "Cancellation state saved correctly:",
    savedBooking.status === "cancelled" &&
      savedBooking.cancellationReason === "Automated test"
  );
} catch (error) {
  console.error("Test failed:", error.message);
} finally {
  if (temporaryBookingId) {
    await Booking.findByIdAndDelete(temporaryBookingId);
    console.log("Temporary test booking removed.");
  }

  await mongoose.disconnect();
}
