const express = require("express");
const { protect, restrictTo } = require("../middleware/auth");
const {
  initializePayment,
  verifyPayment,
  getMyPayments,
  getPayment,
  getPayments,
  refundPayment,
  handleWebhook,
} = require("../controllers/paymentController");

const router = express.Router();

// Public: called by Paystack's servers, protected by the x-paystack-signature check
router.post("/webhook", handleWebhook);

// Logged-in users (must come before "/:id")
router.post("/initialize", protect, initializePayment);
router.get("/verify/:reference", protect, verifyPayment);
router.get("/my", protect, getMyPayments);

// Admin
router.get("/", protect, restrictTo("admin"), getPayments);
router.post("/:id/refund", protect, restrictTo("admin"), refundPayment);

// The payer or an admin (checked in the controller)
router.get("/:id", protect, getPayment);

module.exports = router;