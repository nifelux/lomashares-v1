/**
 * LomaShares — iPayNG Webhook Handler
 * POST /api/webhooks/ipayng
 *
 * This is the ONLY place money is ever credited.
 * The frontend never touches the wallet directly.
 *
 * Flow:
 *  1. Verify signedData header (HMAC-SHA512 of raw body using IPAYNG_SECRET)
 *  2. Confirm event === "payment.success"
 *  3. Look up pending deposit by payment reference → get user_id + amount
 *  4. Idempotency check: skip if deposit already "completed"
 *  5. Call Supabase RPC process_ipayng_deposit(...)
 *     which atomically:
 *       a. marks deposit completed
 *       b. credits wallet + inserts wallet_transaction
 *       c. awards referral reward (10% to upline) if first investment pending
 *       d. awards spin(s) for deposit and referral if applicable
 *  6. Return 200
 */

import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

// ── Supabase service-role client (bypasses RLS) ──────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── Helpers ──────────────────────────────────────────────────────────────────
function verifySignature(rawBody, signedDataHeader) {
  const secret = process.env.IPAYNG_SECRET;
  if (!secret) throw new Error("IPAYNG_SECRET env var not set");

  const expected = crypto
    .createHmac("sha512", secret)
    .update(rawBody)
    .digest("hex");

  // constant-time comparison
  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(signedDataHeader, "hex")
    );
  } catch {
    return false;
  }
}

// ── Main handler ─────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // 1. Read raw body for signature verification
  const rawBody = await getRawBody(req);
  const signedDataHeader = req.headers["signed-data"] || req.headers["signeddata"] || "";

  // 2. Verify signature — reject immediately if invalid
  if (!verifySignature(rawBody, signedDataHeader)) {
    console.warn("[ipayng-webhook] Invalid signature rejected");
    return res.status(401).json({ error: "Invalid signature" });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return res.status(400).json({ error: "Invalid JSON" });
  }

  // 3. Only handle successful payments
  const event = payload?.event || payload?.status;
  if (event !== "payment.success" && event !== "successful") {
    // Acknowledge other events without processing
    return res.status(200).json({ ok: true, skipped: true });
  }

  // 4. Extract payment reference and amount
  const reference = payload?.data?.reference || payload?.reference;
  const amountKobo = payload?.data?.amount || payload?.amount; // iPayNG may send kobo or naira
  const amountNaira = amountKobo > 10000 ? amountKobo / 100 : amountKobo; // normalise

  if (!reference) {
    console.error("[ipayng-webhook] Missing reference in payload", payload);
    return res.status(400).json({ error: "Missing reference" });
  }

  console.log(`[ipayng-webhook] Processing reference=${reference} amount=₦${amountNaira}`);

  // 5. Delegate all DB work to the RPC (atomic, idempotent)
  const { data, error } = await supabase.rpc("process_ipayng_deposit", {
    p_reference: reference,
    p_amount: amountNaira,
    p_provider_payload: payload,
  });

  if (error) {
    console.error("[ipayng-webhook] RPC error:", error);
    // Return 500 so iPayNG retries — do NOT return 200 on unhandled errors
    return res.status(500).json({ error: error.message });
  }

  if (!data?.ok) {
    // e.g. already processed (idempotent skip)
    console.log("[ipayng-webhook] RPC returned not-ok:", data?.error);
    return res.status(200).json({ ok: true, note: data?.error });
  }

  console.log(`[ipayng-webhook] ✅ Deposit processed for user=${data.user_id} ₦${amountNaira}`);
  return res.status(200).json({ ok: true });
}

// ── Read raw body from Node IncomingMessage ───────────────────────────────────
function getRawBody(req) {
  return new Promise((resolve, reject) => {
    // Vercel already provides req.body as Buffer when bodyParser is disabled
    if (Buffer.isBuffer(req.body)) return resolve(req.body);
    if (typeof req.body === "string") return resolve(Buffer.from(req.body));

    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// Disable Vercel body parsing so we get the raw buffer for signature verification
export const config = {
  api: {
    bodyParser: false,
  },
};
