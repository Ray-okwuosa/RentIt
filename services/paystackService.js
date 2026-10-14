const crypto = require("crypto");
const AppError = require("../utils/AppError");

// Thin wrapper around the Paystack REST API. Amounts are always in kobo (NGN subunit).

const baseUrl = () => process.env.PAYSTACK_BASE_URL || "https://api.paystack.co";

const request = async (method, path, body) => {
  const secret = process.env.PAYSTACK_SECRET_KEY
  if (!secret) throw new AppError("Payments are not configured on the server (PAYSTACK_SECRET_KEY missing).", 500);

  let res;
  try {
    res = await fetch(`${baseUrl()}${path}`, {
      method,
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    throw new AppError("Could not reach the payment provider. Please try again shortly.", 502);
  }

  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.status === false) {
    throw new AppError(json.message || "The payment provider returned an error.", res.status >= 500 ? 502 : 400);
  }
  return json.data;
};

// -> { authorization_url, access_code, reference }
const initializeTransaction = ({ email, amountKobo, reference, callbackUrl, currency, metadata }) =>
  request("POST", "/transaction/initialize", {
    email,
    amount: amountKobo,
    reference,
    callback_url: callbackUrl || undefined,
    currency,
    metadata,
  });

// -> { status: "success" | "failed" | "abandoned" | ..., amount, currency, channel, gateway_response, ... }
const verifyTransaction = (reference) =>
  request("GET", `/transaction/verify/${encodeURIComponent(reference)}`);

// -> { id, status: "pending" | "processing" | "processed" | ..., amount, ... }
const createRefund = ({ reference, amountKobo, note }) =>
  request("POST", "/refund", {
    transaction: reference,
    amount: amountKobo,
    customer_note: note,
    merchant_note: note,
  });

// Paystack signs the RAW request body with HMAC-SHA512 using your secret key
const isValidSignature = (rawBody, signature) => {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret || !rawBody || !signature) return false;

  const expected = Buffer.from(crypto.createHmac("sha512", secret).update(rawBody).digest("hex"));
  const received = Buffer.from(String(signature));
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
};

module.exports = { initializeTransaction, verifyTransaction, createRefund, isValidSignature };