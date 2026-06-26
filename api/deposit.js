/**
 * /api/deposit.js
 * Handles ALL deposit-related actions in one function.
 *
 * GET  ?action=method            → returns active deposit method
 * GET  ?action=status&ref=XXX    → returns deposit status
 * POST ?action=initiate-paystack → create pending deposit for Paystack
 * POST ?action=initiate-manual   → create pending deposit for manual transfer
 */

const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const VALID_AMOUNTS = [3000, 6000, 15000, 30000, 70000, 150000];

const MANUAL_ACCOUNT = {
  bank_name:      "OPay",
  account_number: "6556493720",
  account_name:   "OLUWANIFEMI ABDULLAHI OLUDE",
};

function genRef(prefix, userId) {
  const ts   = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomBytes(4).toString("hex").toUpperCase();
  const uid  = userId.replace(/-/g, "").slice(0, 6).toUpperCase();
  return `${prefix}-${uid}-${ts}-${rand}`;
}

function genNarration(userId) {
  const uid  = userId.replace(/-/g, "").slice(0, 5).toUpperCase();
  const rand = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `LOMA-${uid}-${rand}`;
}

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const action = req.query.action;

  // ── GET: active deposit method ────────────────────────────────────────────
  if (req.method === "GET" && action === "method") {
    const { data, error } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "deposit_method")
      .single();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true, method: data?.value || "paystack" });
  }

  // ── GET: deposit status ───────────────────────────────────────────────────
  if (req.method === "GET" && action === "status") {
    const ref = req.query.ref;
    if (!ref) return res.status(400).json({ error: "ref is required" });

    const { data, error } = await supabase
      .from("deposits")
      .select("status, amount, paid_at")
      .eq("reference", ref)
      .single();

    if (error || !data) return res.status(404).json({ error: "Deposit not found" });
    return res.status(200).json({ ok: true, ...data });
  }

  // ── POST actions ──────────────────────────────────────────────────────────
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { user_id, amount, email, full_name } = req.body;

  // ── POST: initiate Paystack deposit ───────────────────────────────────────
  if (action === "initiate-paystack") {
    if (!user_id || !amount) return res.status(400).json({ error: "user_id and amount required" });
    const num = Number(amount);
    if (!VALID_AMOUNTS.includes(num)) return res.status(400).json({ error: "Invalid amount" });

    const reference = genRef("PS", user_id);

    const { error: dbErr } = await supabase.from("deposits").insert({
      user_id, amount: num, reference,
      status: "pending", method: "paystack", provider: "paystack",
      created_at: new Date().toISOString(),
    });
    if (dbErr) return res.status(500).json({ error: dbErr.message });

    return res.status(200).json({
      ok: true, reference, amount: num,
      public_key: process.env.PAYSTACK_PUBLIC_KEY,
    });
  }

  // ── POST: initiate manual deposit ─────────────────────────────────────────
  if (action === "initiate-manual") {
    if (!user_id || !amount) return res.status(400).json({ error: "user_id and amount required" });
    const num = Number(amount);
    if (!VALID_AMOUNTS.includes(num)) return res.status(400).json({ error: "Invalid amount" });

    const reference = genRef("MAN", user_id);
    const narration = genNarration(user_id);

    const { error: dbErr } = await supabase.from("deposits").insert({
      user_id, amount: num, reference, narration,
      status: "pending", method: "manual", provider: "manual",
      created_at: new Date().toISOString(),
    });
    if (dbErr) return res.status(500).json({ error: dbErr.message });

    return res.status(200).json({
      ok: true, reference, narration, amount: num,
      ...MANUAL_ACCOUNT,
    });
  }

  return res.status(400).json({ error: "Unknown action: " + action });
};
  
