import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) throw new Error("Missing Supabase environment variables");
  return createClient(url, key);
}

function getPaystackSecret() {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("Missing PAYSTACK_SECRET_KEY");
  return key;
}

function rawBodyToString(req) {
  if (typeof req.body === "string") return req.body;
  return JSON.stringify(req.body || {});
}

async function creditDepositIfNeeded(supabase, reference, eventPayload) {
  const { data: depositRow, error: depositError } = await supabase
    .from("deposits")
    .select("*")
    .eq("paystack_reference", reference)
    .single();

  if (depositError || !depositRow) {
    throw new Error("Deposit record not found");
  }

  if (depositRow.status === "success") {
    return;
  }

  const { data: wallet, error: walletError } = await supabase
    .from("wallets")
    .select("*")
    .eq("user_id", depositRow.user_id)
    .single();

  if (walletError) throw new Error(walletError.message);

  const amount = Number(depositRow.amount);
  const before = Number(wallet.balance || 0);
  const after = before + amount;
  const txReference = `DEPTX-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  const { error: walletUpdateError } = await supabase
    .from("wallets")
    .update({
      balance: after,
      total_deposit: Number(wallet.total_deposit || 0) + amount,
      updated_at: new Date().toISOString()
    })
    .eq("id", wallet.id);

  if (walletUpdateError) throw new Error(walletUpdateError.message);

  const { error: txError } = await supabase
    .from("wallet_transactions")
    .insert({
      user_id: depositRow.user_id,
      wallet_id: wallet.id,
      type: "deposit",
      direction: "credit",
      amount,
      balance_before: before,
      balance_after: after,
      reference: txReference,
      source_table: "deposits",
      source_id: depositRow.id,
      description: "Paystack webhook deposit",
      status: "completed"
    });

  if (txError) throw new Error(txError.message);

  const { error: depositUpdateError } = await supabase
    .from("deposits")
    .update({
      status: "success",
      paid_at: new Date().toISOString(),
      metadata: {
        ...(depositRow.metadata || {}),
        webhook_event: eventPayload || null
      },
      updated_at: new Date().toISOString()
    })
    .eq("id", depositRow.id);

  if (depositUpdateError) throw new Error(depositUpdateError.message);
}

export const config = {
  api: {
    bodyParser: true
  }
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const rawBody = rawBodyToString(req);
    const hash = crypto
      .createHmac("sha512", getPaystackSecret())
      .update(rawBody)
      .digest("hex");

    const signature = req.headers["x-paystack-signature"];

    if (!signature || signature !== hash) {
      return res.status(401).json({ ok: false, error: "Invalid webhook signature" });
    }

    const event = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const supabase = getSupabase();

    if (event?.event === "charge.success") {
      const reference = event.data?.reference;
      if (reference) {
        await creditDepositIfNeeded(supabase, reference, event);
      }
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || "Webhook error" });
  }
    }
