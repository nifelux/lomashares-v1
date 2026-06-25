/**
 * POST /api/webhooks/paystack
 * Verifies Paystack webhook signature and credits wallet via process_deposit RPC
 */

const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function verifySignature(rawBody, signature) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret) return false;
  const hash = crypto.createHmac("sha512", secret).update(rawBody).digest("hex");
  return hash === signature;
}

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    if (Buffer.isBuffer(req.body)) return resolve(req.body);
    if (typeof req.body === "string") return resolve(Buffer.from(req.body));
    const chunks = [];
    req.on("data", c => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const rawBody  = await getRawBody(req);
  const signature = req.headers["x-paystack-signature"] || "";

  if (!verifySignature(rawBody, signature)) {
    console.warn("[paystack-webhook] Invalid signature");
    return res.status(401).json({ error: "Invalid signature" });
  }

  let payload;
  try { payload = JSON.parse(rawBody.toString("utf8")); }
  catch { return res.status(400).json({ error: "Invalid JSON" }); }

  // Only process successful charge events
  if (payload?.event !== "charge.success") {
    return res.status(200).json({ ok: true, skipped: true });
  }

  const reference = payload?.data?.reference;
  const amountKobo = payload?.data?.amount || 0;
  const amount = amountKobo / 100; // Paystack always sends kobo

  if (!reference) return res.status(400).json({ error: "Missing reference" });

  console.log(`[paystack-webhook] Processing ref=${reference} amount=₦${amount}`);

  const { data, error } = await supabase.rpc("process_deposit", {
    p_reference:        reference,
    p_amount:           amount,
    p_provider_payload: payload,
  });

  if (error) {
    console.error("[paystack-webhook] RPC error:", error.message);
    return res.status(500).json({ error: error.message });
  }

  if (!data?.ok) {
    console.log("[paystack-webhook] Skipped:", data?.error);
    return res.status(200).json({ ok: true, note: data?.error });
  }

  console.log(`[paystack-webhook] ✅ user=${data.user_id} ₦${amount}`);
  return res.status(200).json({ ok: true, data });
};

module.exports.config = { api: { bodyParser: false } };
    
