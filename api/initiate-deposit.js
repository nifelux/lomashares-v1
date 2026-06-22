/**
 * LomaShares — Initiate Deposit (iPayNG Auto-Manual)
 * POST /api/initiate-deposit
 *
 * Flow:
 *  1. Validate amount
 *  2. Generate unique reference
 *  3. Save pending deposit to Supabase
 *  4. Return your fixed bank account details to the frontend
 *
 * No API call to iPayNG here — user transfers manually,
 * then submits session ID via /api/submit-payment.
 */

const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── Your iPayNG merchant bank accounts ───────────────────────────────────────
// Add ALL your supported bank accounts here.
// Users pick whichever bank they prefer to transfer from.
const BANK_ACCOUNTS = [
  {
    bank_name: "PALMPAY",
    account_number: process.env.IPAYNG_PALMPAY_ACCT   || "YOUR_PALMPAY_NUMBER",
    account_name:   process.env.IPAYNG_ACCOUNT_NAME    || "LomaShares",
  },
  {
    bank_name: "OPAY",
    account_number: process.env.IPAYNG_OPAY_ACCT       || "YOUR_OPAY_NUMBER",
    account_name:   process.env.IPAYNG_ACCOUNT_NAME    || "LomaShares",
  },
  {
    bank_name: "MONNIFY",
    account_number: process.env.IPAYNG_MONNIFY_ACCT    || "YOUR_MONNIFY_NUMBER",
    account_name:   process.env.IPAYNG_ACCOUNT_NAME    || "LomaShares",
  },
  {
    bank_name: "GTBANK-GAPP",
    account_number: process.env.IPAYNG_GTBANK_ACCT     || "YOUR_GTBANK_NUMBER",
    account_name:   process.env.IPAYNG_ACCOUNT_NAME    || "LomaShares",
  },
];

function generateReference(userId) {
  const ts   = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomBytes(4).toString("hex").toUpperCase();
  const uid  = userId.replace(/-/g, "").slice(0, 6).toUpperCase();
  return `LOMA-${uid}-${ts}-${rand}`;
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { user_id, amount, email, full_name } = req.body;

  if (!user_id || !amount) {
    return res.status(400).json({ error: "user_id and amount are required" });
  }

  const numAmount    = Number(amount);
  const VALID_AMOUNTS = [3000, 6000, 15000, 30000, 70000, 150000];

  if (!VALID_AMOUNTS.includes(numAmount)) {
    return res.status(400).json({ error: "Invalid amount." });
  }

  const reference = generateReference(user_id);

  // Save pending deposit
  const { error: dbErr } = await supabase.from("deposits").insert({
    user_id,
    amount:     numAmount,
    reference,
    status:     "pending",
    provider:   "ipayng",
    created_at: new Date().toISOString(),
  });

  if (dbErr) {
    console.error("[initiate-deposit] DB error:", dbErr);
    return res.status(500).json({ error: "Failed to create deposit record." });
  }

  // Return fixed bank accounts + reference
  return res.status(200).json({
    ok:        true,
    reference,
    amount:    numAmount,
    accounts:  BANK_ACCOUNTS,
    // Convenience: first account as default
    bank_name:      BANK_ACCOUNTS[0].bank_name,
    account_number: BANK_ACCOUNTS[0].account_number,
    account_name:   BANK_ACCOUNTS[0].account_name,
  });
};
