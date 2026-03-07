import { createClient } from "@supabase/supabase-js";

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

export default async function handler(req, res) {

  cors(res);

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "Method not allowed"
    });
  }

  try {

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SERVICE_ROLE) {
      return res.status(500).json({
        ok: false,
        error: "Missing Supabase environment variables"
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    const body = typeof req.body === "string"
      ? JSON.parse(req.body)
      : req.body;

    const {
      user_id,
      amount,
      bank_name,
      account_name,
      account_number
    } = body || {};

    if (!user_id || !amount || !bank_name || !account_name || !account_number) {
      return res.status(400).json({
        ok: false,
        error: "Missing required fields"
      });
    }

    const { data, error } = await supabase.rpc(
      "request_withdrawal",
      {
        p_user_id: user_id,
        p_amount: Number(amount),
        p_bank_name: bank_name,
        p_account_name: account_name,
        p_account_number: account_number
      }
    );

    if (error) {
      return res.status(400).json({
        ok: false,
        error: error.message
      });
    }

    return res.status(200).json(data);

  } catch (err) {

    console.error("Withdraw API error:", err);

    return res.status(500).json({
      ok: false,
      error: err.message || "Server error"
    });
  }
}
