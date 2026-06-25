/**
 * GET /api/get-deposit-method
 * Returns the currently active deposit method from site_settings
 */

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { data, error } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", "deposit_method")
    .single();

  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({ ok: true, method: data?.value || "paystack" });
};
