/**
 * POST /api/admin/set-deposit-method
 * Body: { method: "paystack" | "manual" | "ipayng", admin_id }
 */

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { method, admin_id } = req.body;

  if (!method || !["paystack", "manual", "ipayng"].includes(method)) {
    return res.status(400).json({ error: "Invalid method. Must be paystack, manual, or ipayng." });
  }

  // Verify admin
  const { data: profile, error: profErr } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", admin_id)
    .single();

  if (profErr || !profile?.is_admin) {
    return res.status(403).json({ error: "Unauthorized" });
  }

  const { error } = await supabase
    .from("site_settings")
    .upsert({ key: "deposit_method", value: method, updated_at: new Date().toISOString() });

  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({ ok: true, method });
};
