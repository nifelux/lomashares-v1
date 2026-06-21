const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

// ── Supabase service-role client ──────────────────────────────────────────────
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── Signature verification ────────────────────────────────────────────────────
function verifySignature(rawBody, signedHeader) {
  const secret = process.env.IPAYNG_SECRET;
  // If no secret configured yet, skip verification (dev mode)
  if (!secret) return true;
  // If iPayNG sends no signature header (e.g. validation ping), allow it
  if (!signedHeader) return true;

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

  // 1. GET ping — instant 200
  if (req.method === "GET") {
    return res.status(200).json({ ok: true, service: "LomaShares Webhook" });
  }

  // 2. Only POST beyond this point
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // 3. Read raw body
  const rawBody = await getRawBody(req);

  // 4. If body is empty — this is iPayNG's POST validation ping, just return 200
  if (!rawBody || rawBody.length === 0) {
    console.log("[ipayng-webhook] Empty body ping — returning 200");
    return res.status(200).json({ ok: true });
  }

  // 5. Verify signature (allows missing header for validation pings)
  const signedHeader =
    req.headers["signed-data"] ||
    req.headers["signeddata"] ||
    req.headers["x-ipayng-signature"] ||
    "";

  if (!verifySignature(rawBody, signedHeader)) {
    console.warn("[ipayng-webhook] Rejected: invalid signature");
    return res.status(401).json({ error: "Invalid signature" });
  }

  // 6. Parse JSON
  let payload;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    // Non-JSON body (another form of ping) — return 200
    console.log("[ipayng-webhook] Non-JSON body — returning 200");
    return res.status(200).json({ ok: true });
  }

  console.log("[ipayng-webhook] Event:", payload?.event || payload?.status);

  // 7. Only process successful payments
  const event = payload?.event || payload?.status;
  if (event !== "payment.success" && event !== "successful") {
    return res.status(200).json({ ok: true, skipped: true, event });
  }

  // 8. Extract reference and amount
  const reference = payload?.data?.reference || payload?.reference;
  const rawAmount = payload?.data?.amount || payload?.amount || 0;
  const amount = rawAmount > 100000 ? rawAmount / 100 : rawAmount;

  if (!reference) {
    console.error("[ipayng-webhook] Missing reference");
    return res.status(400).json({ error: "Missing payment reference" });
  }

  console.log(`[ipayng-webhook] Processing ref=${reference} amount=${amount}`);

  // 9. Call Supabase RPC — atomic + idempotent
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

  console.log(`[ipayng-webhook] SUCCESS user=${data.user_id} amount=${amount}`);
  return res.status(200).json({ ok: true, data });
};

module.exports.config = {
  api: { bodyParser: false },
};
