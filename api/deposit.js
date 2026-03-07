import { createClient } from "@supabase/supabase-js";

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

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

async function creditDepositIfNeeded(supabase, depositRow, paystackData) {
  if (!depositRow) throw new Error("Deposit record not found");

  if (depositRow.status === "success") {
    return { ok: true, already_processed: true };
  }

  const userId = depositRow.user_id;
  const amount = Number(depositRow.amount);

  const { data: wallet, error: walletError } = await supabase
    .from("wallets")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (walletError) throw new Error(walletError.message);

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
      user_id: userId,
      wallet_id: wallet.id,
      type: "deposit",
      direction: "credit",
      amount,
      balance_before: before,
      balance_after: after,
      reference: txReference,
      source_table: "deposits",
      source_id: depositRow.id,
      description: "Paystack deposit",
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
        verify_response: paystackData || null
      },
      updated_at: new Date().toISOString()
    })
    .eq("id", depositRow.id);

  if (depositUpdateError) throw new Error(depositUpdateError.message);

  return { ok: true, already_processed: false };
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (!["GET", "POST"].includes(req.method)) {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const supabase = getSupabase();
    const reference =
      req.method === "GET"
        ? req.query.reference
        : (typeof req.body === "string" ? JSON.parse(req.body) : req.body)?.reference;

    if (!reference) {
      return res.status(400).json({ ok: false, error: "reference is required" });
    }

    const verifyResp = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        headers: {
          Authorization: `Bearer ${getPaystackSecret()}`
        }
      }
    );

    const verifyData = await verifyResp.json();

    if (!verifyResp.ok || !verifyData.status) {
      return res.status(400).json({
        ok: false,
        error: verifyData.message || "Paystack verify failed"
      });
    }

    const tx = verifyData.data;
    if (tx.status !== "success") {
      return res.status(400).json({
        ok: false,
        error: `Payment not successful: ${tx.status}`
      });
    }

    const { data: depositRow, error: depositError } = await supabase
      .from("deposits")
      .select("*")
      .eq("paystack_reference", reference)
      .single();

    if (depositError) {
      return res.status(404).json({ ok: false, error: "Deposit record not found" });
    }

    const result = await creditDepositIfNeeded(supabase, depositRow, verifyData);

    return res.status(200).json({
      ok: true,
      message: result.already_processed ? "Deposit already processed" : "Deposit verified and credited",
      reference
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || "Server error" });
  }
    }
