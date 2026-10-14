import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "./src/models/User.js";
import Equipment from "./src/models/Equipment.js";

const DEFAULT_ITEMS = [
  { name: "Canon EOS R6", pricePerDay: 45000, securityDeposit: 30000 },
  { name: "Canon EOS R8", pricePerDay: 45000, securityDeposit: 30000 },
  { name: "Bosch Hammer Drill", pricePerDay: 12000, securityDeposit: 20000 },
  { name: "Generator 5KVA", pricePerDay: 35000, securityDeposit: 25000 },
  { name: "Macbook Pro 14", pricePerDay: 60000, securityDeposit: 40000 },
  { name: "Projector", pricePerDay: 25000, securityDeposit: 20000 },
  { name: "Event Tent (10x10)", pricePerDay: 18000, securityDeposit: 15000 },
  { name: "Office Chair", pricePerDay: 8000, securityDeposit: 10000 },
  { name: "DJ Sound System", pricePerDay: 40000, securityDeposit: 30000 },
  { name: "Excavator", pricePerDay: 85000, securityDeposit: 50000 },
  { name: "Cordless Impact Driver", pricePerDay: 10000, securityDeposit: 15000 },
  { name: "Sony Alpha A7 III", pricePerDay: 50000, securityDeposit: 35000 },
  { name: "Godox SL60W Light", pricePerDay: 18000, securityDeposit: 15000 },
  { name: "DJI Mavic 3 Drone", pricePerDay: 45000, securityDeposit: 30000 },
  { name: "LED TV 55-inch", pricePerDay: 20000, securityDeposit: 15000 },
  { name: "3-Seater Sofa", pricePerDay: 12000, securityDeposit: 10000 },
  { name: "Party Lighting Kit", pricePerDay: 15000, securityDeposit: 15000 },
  { name: "Drill Press", pricePerDay: 14000, securityDeposit: 15000 }
];

async function seed() {
  try {
    await mongoose.connect(process.env.MONGO_URL);
    console.log("Connected to MongoDB.");

    const hashedPassword = await bcrypt.hash("RentItTest123!", 10);

    // 1. Ensure test owner
    let owner = await User.findOne({ email: "owner@renthub.com" });
    if (!owner) {
      owner = await User.create({
        name: "Kehinde Ayo",
        email: "owner@renthub.com",
        password: hashedPassword,
        role: "owner",
      });
      console.log("Created test owner: owner@renthub.com");
    }

    // 2. Ensure test renter
    let renter = await User.findOne({ email: "testrenter@example.com" });
    if (!renter) {
      renter = await User.create({
        name: "Test Renter",
        email: "testrenter@example.com",
        password: hashedPassword,
        role: "renter",
      });
      console.log("Created test renter: testrenter@example.com");
    }

    // 3. Ensure test admin
    let admin = await User.findOne({ email: "admin@renthub.com" });
    if (!admin) {
      admin = await User.create({
        name: "RentHub Admin",
        email: "admin@renthub.com",
        password: hashedPassword,
        role: "admin",
      });
      console.log("Created test admin: admin@renthub.com");
    }

    // 4. Upsert default items
    let createdCount = 0;
    for (const item of DEFAULT_ITEMS) {
      const existing = await Equipment.findOne({ name: item.name });
      if (!existing) {
        await Equipment.create({
          ownerId: owner._id,
          name: item.name,
          pricePerDay: item.pricePerDay,
          securityDeposit: item.securityDeposit,
          status: "active",
        });
        createdCount++;
      }
    }

    console.log(`Catalog seeded. Added ${createdCount} new equipment items.`);
    const totalEquipment = await Equipment.countDocuments();
    console.log(`Total equipment in database: ${totalEquipment}`);
  } catch (err) {
    console.error("Seeding error:", err);
  } finally {
    await mongoose.disconnect();
    console.log("Disconnected from MongoDB.");
  }
}

seed();
