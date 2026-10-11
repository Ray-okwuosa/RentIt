
import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "./src/models/User.js";

const email = "testrenter@example.com";

// Temporary password for local testing.
// Change this value before running the script.
const newPassword = "RentItTest123!";

async function resetPassword() {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log("Connected to MongoDB.");

    const user = await User.findOne({ email });

    if (!user) {
      console.log("User not found:", email);
      return;
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    user.password = hashedPassword;
    await user.save();

    console.log("Password reset successfully.");
    console.log("Email:", user.email);
    console.log("Role:", user.role);
    console.log("You can now log in with the new password.");
  } catch (error) {
    console.error("Password reset failed:", error.message);
  } finally {
    await mongoose.disconnect();
  }
}

resetPassword();
