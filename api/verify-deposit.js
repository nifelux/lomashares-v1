import { createClient } from "@supabase/supabase-js";

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Missing Supabase environment variables");
  }

  return createClient(url, key);
}

function getPaystackSecret() {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("Missing PAYSTACK_SECRET_KEY");
  return key;
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const supabase = getSupabase();
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    const { user_id, email, amount, callback_url } = body || {};

    if (!user_id || !email || !amount) {
      return res.status(400).json({ ok: false, error: "user_id, email and amount are required" });
    }

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ ok: false, error: "Invalid amount" });
    }

    const reference = `DEP-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    const initResp = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getPaystackSecret()}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email,
        amount: Math.round(numericAmount * 100),
        reference,
        callback_url: callback_url || null,
        metadata: {
          user_id,
          deposit_reference: reference
        }
      })
    });

    const initData = await initResp.json();

    if (!initResp.ok || !initData.status) {
      return res.status(400).json({
        ok: false,
        error: initData.message || "Paystack initialize failed"
      });
    }

    const { error: insertError } = await supabase.from("deposits").insert({
      user_id,
      amount: numericAmount,
      payment_method: "paystack",
      paystack_reference: reference,
      paystack_access_code: initData.data?.access_code || null,
      status: "pending",
      metadata: {
        initialize_response: initData.data || null
      }
    });

    if (insertError) {
      return res.status(500).json({ ok: false, error: insertError.message });
    }

    return res.status(200).json({
      ok: true,
      authorization_url: initData.data.authorization_url,
      access_code: initData.data.access_code,
      reference
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || "Server error" });
  }
    }
