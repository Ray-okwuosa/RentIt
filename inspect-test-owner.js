
import "dotenv/config";
import mongoose from "mongoose";
import User from "./src/models/User.js";

const OWNER_ID = "6ac84b2dec385667b69a3eda";

async function main() {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log("Connected to MongoDB.");

    const user = await User.findById(OWNER_ID).select(
      "name email role"
    );

    if (!user) {
      console.log("No user found with the equipment owner ID.");
      return;
    }

    console.log("Existing equipment owner:");
    console.log({
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
    });
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error("Inspection failed:", error.message);
  process.exitCode = 1;
});
