const mongoose = require("mongoose");

let isConnected = false;

async function connectDB() {
  if (isConnected) return mongoose.connection;

  const uri = process.env.MONGO_URI || "mongodb://localhost:27017/";
  if (!uri) {
    throw new Error("MONGO_URI is not defined in your environment variables");
  }

  try {
    mongoose.set("strictQuery", true);

    const conn = await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 10000,
      maxPoolSize: 10,
    });

    isConnected = true;
    console.log(`MongoDB connected: ${conn.connection.host}/${conn.connection.name}`);

    mongoose.connection.on("error", (err) => {
      console.error("MongoDB connection error:", err.message);
    });

    mongoose.connection.on("disconnected", () => {
      isConnected = false;
      console.warn("MongoDB disconnected");
    });

    return conn.connection;
  } catch (err) {
    console.error("MongoDB initial connection failed:", err.message);
    throw err;
  }
}

async function disconnectDB() {
  if (!isConnected) return;
  await mongoose.connection.close();
  isConnected = false;
  console.log("MongoDB connection closed");
}

module.exports = { connectDB, disconnectDB };