/*import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const connectDB = async () => {
    await mongoose.connect(process.env.MONGO_URI);
};

export default connectDB;*/

import mongoose from "mongoose";
import dns from "node:dns";
import dotenv from "dotenv";

dotenv.config();

// Temporarily use Google's DNS for this Node.js process
dns.setServers(["8.8.8.8"]);

const connectDB = async () => {
    if (!process.env.MONGO_URI) {
        throw new Error("MONGO_URI is not configured");
    }

    await mongoose.connect(process.env.MONGO_URI);

    console.log("MongoDB connected successfully!");
};

export default connectDB;