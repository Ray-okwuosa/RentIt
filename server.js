require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const { connectDB, disconnectDB } = require("./config/db");

const app = express();
const PORT = process.env.PORT || 5000;

// ---------- Middleware ----------
app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL || "*" }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
if (process.env.NODE_ENV !== "production") app.use(morgan("dev"));

// ---------- Health check ----------
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

// The webhook needs the raw request body to check Paystack's signature
app.use(express.json({ limit: "10mb", verify: (req, res, buf) => { req.rawBody = buf; } }));


// ---------- Routes ----------
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/users", require("./routes/userRoutes"));
app.use("/api/categories", require("./routes/categoryRoutes"));
app.use("/api/equipment", require("./routes/equipmentRoutes"));
app.use("/api/bookings", require("./routes/bookingRoutes"));
app.use("/api/payments", require("./routes/paymentRoutes"));
app.use("/api/reviews", require("./routes/reviewRoutes"));
// app.use("/api/notifications", require("./routes/notifications"));


// Inside start(), after app.listen(...): the refund and expiry sweeper
const { processRefunds } = require("./services/paymentService");
setInterval(() => processRefunds().catch((e) => console.error("Refund sweep failed:", e.message)), 60 * 1000).unref();

// ---------- 404 handler ----------
app.use((req, res) => {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
});

// ---------- Error handler ----------
app.use((err, req, res, next) => {
  let status = err.statusCode || 500;
  let message = err.message || "Internal server error";

  // Translate common Mongoose errors into clean responses
  if (err.name === "ValidationError") {
    status = 400;
    message = Object.values(err.errors).map((e) => e.message).join(". ");
  } else if (err.name === "CastError") {
    status = 400;
    message = `Invalid ${err.path}: ${err.value}`;
  } else if (err.code === 11000) {
    status = 409;
    message = `${Object.keys(err.keyValue)[0]} already exists.`;
  }

  if (status === 500) console.error(err);

  res.status(status).json({
    status: status >= 500 ? "error" : "fail",
    message,
    ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
  });
});

// ---------- Start server ----------
let server;

async function start() {
  try {
    await connectDB();
    server = app.listen(PORT, () => {
      console.log(`Server running on port ${PORT} (${process.env.NODE_ENV || "development"})`);
    });
  } catch (err) {
    console.error("Failed to start server:", err.message);
    process.exit(1);
  }
}

// ---------- Graceful shutdown ----------
async function shutdown(signal) {
  console.log(`${signal} received. Shutting down...`);
  if (server) {
    server.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
  } else {
    await disconnectDB();
    process.exit(0);
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled rejection:", reason);
});

start();

module.exports = app;