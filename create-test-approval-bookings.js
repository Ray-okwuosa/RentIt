
import "dotenv/config";
import mongoose from "mongoose";
import Booking from "./src/models/Booking.js";
import Equipment from "./src/models/Equipment.js";

const EQUIPMENT_ID = "6ac9551c93c5d4f19c7d6f91";
const RENTER_ID = "6ac95b2193c5d4f19c7d6f94";
const OWNER_ID = "6ac84b2dec385667b69a3eda";

const startDate = new Date("2026-10-28T00:00:00.000Z");
const endDate = new Date("2026-10-30T00:00:00.000Z");

async function main() {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log("Connected to MongoDB.");

    const equipment = await Equipment.findById(EQUIPMENT_ID);

    if (!equipment) {
      throw new Error("Test equipment was not found.");
    }

    if (equipment.ownerId.toString() !== OWNER_ID) {
      throw new Error("The equipment owner ID does not match.");
    }

    const rentalDays = 3;
    const pricePerDay = equipment.pricePerDay;
    const rentalAmount = pricePerDay * rentalDays;
    const securityDeposit = equipment.securityDeposit;
    const totalAmount = rentalAmount + securityDeposit;

    const bookings = await Booking.create([
      {
        renterId: RENTER_ID,
        ownerId: OWNER_ID,
        equipmentId: EQUIPMENT_ID,
        startDate,
        endDate,
        rentalDays,
        pricePerDay,
        rentalAmount,
        securityDeposit,
        totalAmount,
        status: "pending",
        paymentStatus: "succeeded",
        refundStatus: "not_required",
      },
      {
        renterId: RENTER_ID,
        ownerId: OWNER_ID,
        equipmentId: EQUIPMENT_ID,
        startDate,
        endDate,
        rentalDays,
        pricePerDay,
        rentalAmount,
        securityDeposit,
        totalAmount,
        status: "pending",
        paymentStatus: "succeeded",
        refundStatus: "not_required",
      },
    ]);

    console.log("\nTemporary test bookings created:");
    for (const booking of bookings) {
      console.log({
        id: booking._id.toString(),
        status: booking.status,
        paymentStatus: booking.paymentStatus,
      });
    }

    console.log(
      "\nSave both IDs. Do not use these bookings for real transactions."
    );
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error("Test setup failed:", error.message);
  process.exitCode = 1;
});
