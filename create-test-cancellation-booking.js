
import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "./src/config/db.js";
import Booking from "./src/models/Booking.js";
import Equipment from "./src/models/Equipment.js";
import { parseDate } from "./src/utils/dateUtils.js";

try {
  await connectDB();

  const equipmentId = "6ac9551c93c5d4f19c7d6f91";
  const renterId = "6ac95b2193c5d4f19c7d6f94";

  const equipment = await Equipment.findById(equipmentId);

  if (!equipment) {
    throw new Error("Test equipment not found");
  }

  const booking = await Booking.create({
    renterId,
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
    refundStatus: "not_required",
  });

  console.log("Temporary booking created.");
  console.log("Booking ID:", booking._id.toString());
  console.log("Renter ID:", booking.renterId.toString());
} catch (error) {
  console.error("Test setup failed:", error.message);
} finally {
  await mongoose.disconnect();
}
