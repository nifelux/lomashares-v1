import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase environment variables");
  return createClient(url, key);
}

export default async function handler(req, res) {
  try {
    const supabase = getSupabase();

    const { data, error } = await supabase.rpc("credit_daily_profit", {
      p_run_date: new Date().toISOString().slice(0, 10)
    });

    if (error) {
      return res.status(500).json({ ok: false, error: error.message });
    }

    return res.status(200).json({
      ok: true,
      result: data
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || "Cron failed" });
  }
}
