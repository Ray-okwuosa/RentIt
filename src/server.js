import "dotenv/config";
import express from "express";
import cors from "cors";
import connectDB from "./config/db.js";
import testEquipmentRoutes from "./routes/testEquipmentRoutes.js";
import availabilityRoutes from "./routes/availabilityRoutes.js";
import bookingRoutes from "./routes/bookingRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import categoryRoutes from "./routes/categoryRoutes.js";

import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(cors());
app.use(express.json());

// Serve User & Admin Frontends
const userDashPath = path.resolve(__dirname, "../../RENTHUBUSERDASH");
const adminDashPath = path.resolve(__dirname, "../../RENTHUBADMINDASH");

app.use("/user", express.static(userDashPath));
app.use("/admin", express.static(adminDashPath));

const PORT = process.env.PORT || 3000;

// HOME ROUTE
app.get("/", (req, res) => {
    res.send(`
        <div style="font-family:sans-serif;padding:40px;line-height:1.6;">
            <h1>RentHub Platform Running</h1>
            <p>Backend API & Frontend Dashboards are live:</p>
            <ul>
                <li><strong>User Dashboard:</strong> <a href="/user/renthub-user-equipment-details.html">Equipment Catalog & Details</a></li>
                <li><strong>User Checkout:</strong> <a href="/user/renthub-user-rental-checkout.html">Rental Checkout</a></li>
                <li><strong>User My Rentals:</strong> <a href="/user/renthub-user-my-rentals.html">My Rentals</a></li>
                <li><strong>Admin Dashboard:</strong> <a href="/admin/renthub-admin-rentals.html">Admin Rentals Management</a></li>
            </ul>
        </div>
    `);
});

// API ROUTES
app.use("/api/test/equipment", testEquipmentRoutes);

app.use("/api/equipment", availabilityRoutes);

app.use("/api/bookings", bookingRoutes);

app.use("/api/auth", authRoutes);

app.use("/api/categories", categoryRoutes);

// START SERVER
const startServer = async () => {
    try {
        await connectDB();

        app.listen(PORT, () => {
            console.log(`Server is running on http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error("Failed to start server:", error.message);
    }
};

startServer();