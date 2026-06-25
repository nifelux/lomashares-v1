/**
 * POST /api/initiate-paystack-deposit
 * Creates pending deposit record, returns reference + public key for frontend popup
 */

const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function generateReference(userId) {
  const ts   = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomBytes(4).toString("hex").toUpperCase();
  const uid  = userId.replace(/-/g, "").slice(0, 6).toUpperCase();
  return `PS-${uid}-${ts}-${rand}`;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { user_id, amount, email } = req.body;

  if (!user_id || !amount) {
    return res.status(400).json({ error: "user_id and amount are required" });
  }

  const numAmount     = Number(amount);
  const VALID_AMOUNTS = [3000, 6000, 15000, 30000, 70000, 150000];

  if (!VALID_AMOUNTS.includes(numAmount)) {
    return res.status(400).json({ error: "Invalid amount." });
  }

  const reference = generateReference(user_id);

  const { error: dbErr } = await supabase.from("deposits").insert({
    user_id,
    amount:     numAmount,
    reference,
    status:     "pending",
    method:     "paystack",
    provider:   "paystack",
    created_at: new Date().toISOString(),
  });

  if (dbErr) {
    console.error("[initiate-paystack] DB error:", dbErr);
    return res.status(500).json({ error: "Failed to create deposit record." });
  }

  return res.status(200).json({
    ok:         true,
    reference,
    amount:     numAmount,
    public_key: process.env.PAYSTACK_PUBLIC_KEY,
  });
};
    
