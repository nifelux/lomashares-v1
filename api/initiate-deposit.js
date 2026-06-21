/**
 * LomaShares — Initiate iPayNG Deposit
 * POST /api/initiate-deposit
 *
 * Called by deposit.html after user submits amount.
 * Returns bank transfer details (account number, bank, reference).
 * Wallet is NEVER credited here — only via webhook.
 */

import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function generateReference(userId) {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomBytes(4).toString("hex").toUpperCase();
  const uid = userId.replace(/-/g, "").slice(0, 6).toUpperCase();
  return `LOMA-${uid}-${ts}-${rand}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { user_id, amount } = req.body;

  // ── Validate ───────────────────────────────────────────────────────────────
  if (!user_id || !amount) {
    return res.status(400).json({ error: "user_id and amount are required" });
  }

  const numAmount = Number(amount);
  const VALID_AMOUNTS = [3000, 6000, 15000, 30000, 70000, 150000];

  if (!VALID_AMOUNTS.includes(numAmount)) {
    return res.status(400).json({
      error: "Invalid amount. Must match a LomaShares investment plan.",
    });
  }

  // ── Generate unique reference ──────────────────────────────────────────────
  const reference = generateReference(user_id);

  // ── Call iPayNG to create a payment link / virtual account ────────────────
  let ipayData;
  try {
    const ipayRes = await fetch("https://api.ipayng.com/v1/payment/initiate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.IPAYNG_SECRET_KEY}`,
      },
      body: JSON.stringify({
        amount: numAmount,
        currency: "NGN",
        reference,
        customer_email: req.body.email || "",
        customer_name: req.body.full_name || "",
        description: `LomaShares Deposit - ${reference}`,
        callback_url: `${process.env.SITE_URL}/deposit-success.html`,
        webhook_url: `${process.env.SITE_URL}/api/webhooks/ipayng`,
      }),
    });

    ipayData = await ipayRes.json();

    if (!ipayRes.ok || !ipayData?.data) {
      console.error("[initiate-deposit] iPayNG error:", ipayData);
      return res.status(502).json({ error: "Payment provider error. Try again." });
    }
  } catch (err) {
    console.error("[initiate-deposit] fetch error:", err);
    return res.status(502).json({ error: "Could not reach payment provider." });
  }

  // ── Save pending deposit to Supabase ──────────────────────────────────────
  const { error: dbErr } = await supabase.from("deposits").insert({
    user_id,
    amount: numAmount,
    reference,
    status: "pending",
    provider: "ipayng",
    created_at: new Date().toISOString(),
  });

  if (dbErr) {
    console.error("[initiate-deposit] DB error:", dbErr);
    return res.status(500).json({ error: "Failed to create deposit record." });
  }

  // ── Return payment info to frontend ───────────────────────────────────────
  return res.status(200).json({
    ok: true,
    reference,
    payment_url: ipayData.data?.payment_url || null,
    bank_name: ipayData.data?.bank_name || null,
    account_number: ipayData.data?.account_number || null,
    account_name: ipayData.data?.account_name || "LomaShares Payments",
    expires_at: ipayData.data?.expires_at || null,
    amount: numAmount,
  });
}
