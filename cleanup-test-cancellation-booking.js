import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "./src/config/db.js";
import Booking from "./src/models/Booking.js";

try {
  await connectDB();

  const testBookingId = "6aca10ee1272f3c1b58bb9ee";

  const deletedBooking = await Booking.findByIdAndDelete(testBookingId);

  if (deletedBooking) {
    console.log("Temporary cancellation test booking removed.");
  } else {
    console.log("Test booking was not found; nothing was deleted.");
  }
} catch (error) {
  console.error("Cleanup failed:", error.message);
} finally {
  await mongoose.disconnect();
}