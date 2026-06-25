/**
 * POST /api/initiate-manual-deposit
 * Creates a pending manual deposit with a unique narration code
 * Returns the merchant bank account + narration for user to include in transfer
 */

const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Your merchant bank account
const MERCHANT = {
  bank_name:      "OPay",
  account_number: "6556493720",
  account_name:   "OLUWANIFEMI ABDULLAHI OLUDE",
};

function generateNarration(userId) {
  const uid  = userId.replace(/-/g, "").slice(0, 5).toUpperCase();
  const rand = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `LOMA-${uid}-${rand}`;
}

function generateReference(userId) {
  const ts   = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `MAN-${userId.replace(/-/g,"").slice(0,5).toUpperCase()}-${ts}-${rand}`;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { user_id, amount } = req.body;

  if (!user_id || !amount) {
    return res.status(400).json({ error: "user_id and amount are required" });
  }

  const numAmount     = Number(amount);
  const VALID_AMOUNTS = [3000, 6000, 15000, 30000, 70000, 150000];

  if (!VALID_AMOUNTS.includes(numAmount)) {
    return res.status(400).json({ error: "Invalid amount." });
  }

  const narration = generateNarration(user_id);
  const reference = generateReference(user_id);

  const { error: dbErr } = await supabase.from("deposits").insert({
    user_id,
    amount:     numAmount,
    reference,
    narration,
    status:     "pending",
    method:     "manual",
    provider:   "manual",
    created_at: new Date().toISOString(),
  });

  if (dbErr) {
    console.error("[manual-deposit] DB error:", dbErr);
    return res.status(500).json({ error: "Failed to create deposit record." });
  }

  return res.status(200).json({
    ok:             true,
    reference,
    narration,
    amount:         numAmount,
    bank_name:      MERCHANT.bank_name,
    account_number: MERCHANT.account_number,
    account_name:   MERCHANT.account_name,
  });
};
