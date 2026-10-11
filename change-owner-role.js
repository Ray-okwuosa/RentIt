
import "dotenv/config";
import mongoose from "mongoose";
import User from "./src/models/User.js";

const email = "testrenter@example.com";

async function changeUserRole() {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log("Connected to MongoDB.");

    const user = await User.findOne({ email });

    if (!user) {
      console.log("User not found:", email);
      return;
    }

    console.log("User found:", user.name);
    console.log("Current role:", user.role);

    if (user.role === "owner") {
      console.log("This user is already an owner.");
      return;
    }

    user.role = "owner";
    await user.save();

    console.log("Role updated successfully.");
    console.log("Email:", user.email);
    console.log("New role:", user.role);
  } catch (error) {
    console.error("Error:", error.message);
  } finally {
    await mongoose.disconnect();
  }
}

changeUserRole();

