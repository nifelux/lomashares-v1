const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

// ── Supabase service-role client ──────────────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── Signature verification (POST only) ───────────────────────────────────────
function verifySignature(rawBody, signedHeader) {
  const secret = process.env.IPAYNG_SECRET;
  if (!secret || !signedHeader) return false;

  const expected = crypto
    .createHmac("sha512", secret)
    .update(rawBody)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(signedHeader, "hex")
    );
  } catch {
    return false;
  }
}

// ── Read raw body ─────────────────────────────────────────────────────────────
function getRawBody(req) {
  return new Promise((resolve, reject) => {
    if (Buffer.isBuffer(req.body)) return resolve(req.body);
    if (typeof req.body === "string") return resolve(Buffer.from(req.body));
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

// ── Main handler ──────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {

  // 1. iPayNG URL validation ping — return 200 immediately, no auth needed
  if (req.method === "GET") {
    return res.status(200).json({ ok: true, service: "LomaShares Webhook" });
  }

  // 2. Only accept POST beyond this point
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // 3. Read raw body for signature check
  const rawBody = await getRawBody(req);

  // 4. Verify HMAC-SHA512 signature
  const signedHeader =
    req.headers["signed-data"] ||
    req.headers["signeddata"] ||
    req.headers["x-ipayng-signature"] ||
    "";

  if (!verifySignature(rawBody, signedHeader)) {
    console.warn("[ipayng-webhook] Rejected: invalid signature");
    return res.status(401).json({ error: "Invalid signature" });
  }

  // 5. Parse JSON body
  let payload;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return res.status(400).json({ error: "Invalid JSON body" });
  }

  console.log("[ipayng-webhook] Received event:", payload?.event || payload?.status);

  // 6. Only process successful payments
  const event = payload?.event || payload?.status;
  if (event !== "payment.success" && event !== "successful") {
    return res.status(200).json({ ok: true, skipped: true, event });
  }

  // 7. Extract reference and amount
  const reference = payload?.data?.reference || payload?.reference;
  const rawAmount = payload?.data?.amount || payload?.amount || 0;
  // Normalise: iPayNG may send kobo (e.g. 300000) or naira (e.g. 3000)
  const amount = rawAmount > 100000 ? rawAmount / 100 : rawAmount;

  if (!reference) {
    console.error("[ipayng-webhook] Missing reference in payload");
    return res.status(400).json({ error: "Missing payment reference" });
  }

  console.log(`[ipayng-webhook] Processing reference=${reference} amount=N${amount}`);

  // 8. Call Supabase RPC — atomic, idempotent
  const { data, error } = await supabase.rpc("process_ipayng_deposit", {
    p_reference: reference,
    p_amount: amount,
    p_provider_payload: payload,
  });

  if (error) {
    console.error("[ipayng-webhook] RPC error:", error.message);
    return res.status(500).json({ error: error.message });
  }

  if (!data?.ok) {
    console.log("[ipayng-webhook] RPC skipped:", data?.error);
    return res.status(200).json({ ok: true, note: data?.error });
  }

  console.log(`[ipayng-webhook] SUCCESS — user=${data.user_id} amount=${amount} spins=${data.spins_awarded}`);
  return res.status(200).json({ ok: true, data });
};

// Disable Vercel body parsing so we receive raw buffer for signature verification
module.exports.config = {
  api: {
    bodyParser: false,
  },
};
