/**
 * /api/webhooks/index.js
 * Handles both Paystack and iPayNG webhooks in one function.
 * Replaces: webhooks/paystack.js + webhooks/ipayng.js
 *
 * iPayNG  → identified by header "signed-data"
 * Paystack → identified by header "x-paystack-signature"
 */

const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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

// ── Paystack signature ────────────────────────────────────────────────────────
function verifyPaystack(rawBody, signature) {
  const secret = process.env.PAYSTACK_SECRET_KEY;
  if (!secret || !signature) return false;
  const hash = crypto.createHmac("sha512", secret).update(rawBody).digest("hex");
  return hash === signature;
}

// ── iPayNG signature ──────────────────────────────────────────────────────────
function verifyIpayng(rawBody, signature) {
  const secret = process.env.IPAYNG_SECRET;
  if (!secret) return true;   // no secret configured → allow (validation ping)
  if (!signature) return true; // no sig header → validation ping
  const expected = crypto.createHmac("sha512", secret).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
  } catch { return false; }
}

// ── Call process_deposit RPC ──────────────────────────────────────────────────
async function processDeposit(reference, amount, payload) {
  const { data, error } = await supabase.rpc("process_deposit", {
    p_reference:        reference,
    p_amount:           amount,
    p_provider_payload: payload,
  });
  return { data, error };
}

module.exports = async function handler(req, res) {
  // iPayNG GET validation ping
  if (req.method === "GET") {
    return res.status(200).json({ ok: true, service: "LomaShares Webhook" });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const rawBody = await getRawBody(req);

  // Empty body → validation ping
  if (!rawBody || rawBody.length === 0) {
    return res.status(200).json({ ok: true });
  }

  const paystackSig = req.headers["x-paystack-signature"] || "";
  const ipayngSig   = req.headers["signed-data"] || req.headers["signeddata"] || req.headers["x-ipayng-signature"] || "";

  // ══════════════════════════════════════════════════════
  // PAYSTACK WEBHOOK
  // ══════════════════════════════════════════════════════
  if (paystackSig) {
    if (!verifyPaystack(rawBody, paystackSig)) {
      console.warn("[webhook] Paystack: invalid signature");
      return res.status(401).json({ error: "Invalid Paystack signature" });
    }

    let payload;
    try { payload = JSON.parse(rawBody.toString("utf8")); }
    catch { return res.status(400).json({ error: "Invalid JSON" }); }

    if (payload?.event !== "charge.success") {
      return res.status(200).json({ ok: true, skipped: true });
    }

    const reference = payload?.data?.reference;
    const amount    = (payload?.data?.amount || 0) / 100; // kobo → naira

    if (!reference) return res.status(400).json({ error: "Missing reference" });

    console.log(`[webhook] Paystack ref=${reference} amount=₦${amount}`);
    const { data, error } = await processDeposit(reference, amount, payload);
    if (error) return res.status(500).json({ error: error.message });
    if (!data?.ok) return res.status(200).json({ ok: true, note: data?.error });

    console.log(`[webhook] Paystack ✅ user=${data.user_id}`);
    return res.status(200).json({ ok: true, data });
  }

  // ══════════════════════════════════════════════════════
  // IPAYNG WEBHOOK
  // ══════════════════════════════════════════════════════
  if (!verifyIpayng(rawBody, ipayngSig)) {
    console.warn("[webhook] iPayNG: invalid signature");
    return res.status(401).json({ error: "Invalid iPayNG signature" });
  }

  let payload;
  try { payload = JSON.parse(rawBody.toString("utf8")); }
  catch { return res.status(200).json({ ok: true }); } // non-JSON ping

  const event = payload?.event || payload?.status;
  if (event !== "payment.success" && event !== "successful") {
    return res.status(200).json({ ok: true, skipped: true, event });
  }

  const reference = payload?.data?.reference || payload?.reference;
  const raw       = payload?.data?.amount || payload?.amount || 0;
  const amount    = raw > 100000 ? raw / 100 : raw;

  if (!reference) return res.status(400).json({ error: "Missing reference" });

  console.log(`[webhook] iPayNG ref=${reference} amount=₦${amount}`);
  const { data, error } = await processDeposit(reference, amount, payload);
  if (error) return res.status(500).json({ error: error.message });
  if (!data?.ok) return res.status(200).json({ ok: true, note: data?.error });

  console.log(`[webhook] iPayNG ✅ user=${data.user_id}`);
  return res.status(200).json({ ok: true, data });
};

module.exports.config = { api: { bodyParser: false } };
      
