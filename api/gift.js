import { createClient } from "@supabase/supabase-js";

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase environment variables");
  return createClient(url, key);
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

    const { user_id, code } = body || {};

    if (!user_id || !code) {
      return res.status(400).json({ ok: false, error: "user_id and code are required" });
    }

    const { data, error } = await supabase.rpc("redeem_gift_code", {
      p_user_id: user_id,
      p_code: code
    });

    if (error) {
      return res.status(400).json({ ok: false, error: error.message });
    }

    if (!data?.ok) {
      return res.status(400).json({ ok: false, error: data?.error || "Gift redemption failed" });
    }

    return res.status(200).json(data);
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || "Server error" });
  }
  }
