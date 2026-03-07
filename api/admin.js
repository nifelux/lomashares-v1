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

    const { action, admin_user_id } = body || {};

    if (!action || !admin_user_id) {
      return res.status(400).json({ ok: false, error: "action and admin_user_id are required" });
    }

    if (action === "approve_withdrawal") {
      const { withdrawal_id, paystack_transfer_code = null } = body;

      const { data, error } = await supabase.rpc("approve_withdrawal", {
        p_admin_user_id: admin_user_id,
        p_withdrawal_id: withdrawal_id,
        p_paystack_transfer_code: paystack_transfer_code
      });

      if (error) return res.status(400).json({ ok: false, error: error.message });
      return res.status(data?.ok ? 200 : 400).json(data);
    }

    if (action === "reject_withdrawal") {
      const { withdrawal_id, reason = null } = body;

      const { data, error } = await supabase.rpc("reject_withdrawal", {
        p_admin_user_id: admin_user_id,
        p_withdrawal_id: withdrawal_id,
        p_reason: reason
      });

      if (error) return res.status(400).json({ ok: false, error: error.message });
      return res.status(data?.ok ? 200 : 400).json(data);
    }

    if (action === "mark_withdrawal_paid") {
      const { withdrawal_id, paystack_transfer_code = null } = body;

      const { data, error } = await supabase.rpc("mark_withdrawal_paid", {
        p_admin_user_id: admin_user_id,
        p_withdrawal_id: withdrawal_id,
        p_paystack_transfer_code: paystack_transfer_code
      });

      if (error) return res.status(400).json({ ok: false, error: error.message });
      return res.status(data?.ok ? 200 : 400).json(data);
    }

    if (action === "generate_gift_code") {
      const {
        code,
        amount,
        max_redemptions = 1,
        expires_at = null
      } = body;

      const { data, error } = await supabase.rpc("admin_generate_gift_code", {
        p_admin_user_id: admin_user_id,
        p_code: code,
        p_amount: Number(amount),
        p_max_redemptions: Number(max_redemptions),
        p_expires_at: expires_at
      });

      if (error) return res.status(400).json({ ok: false, error: error.message });
      return res.status(data?.ok ? 200 : 400).json(data);
    }

    if (action === "deactivate_gift_code") {
      const { gift_code_id } = body;

      const { data, error } = await supabase.rpc("admin_deactivate_gift_code", {
        p_admin_user_id: admin_user_id,
        p_gift_code_id: gift_code_id
      });

      if (error) return res.status(400).json({ ok: false, error: error.message });
      return res.status(data?.ok ? 200 : 400).json(data);
    }

    if (action === "create_plan") {
      const payload = {
        name: body.name,
        code: String(body.code || "").trim().toUpperCase(),
        price: Number(body.price),
        daily_profit: Number(body.daily_profit),
        duration_days: Number(body.duration_days),
        total_return: Number(body.total_return),
        is_active: body.is_active !== false,
        sort_order: Number(body.sort_order || 0),
        description: body.description || null
      };

      const { data: adminCheck, error: adminCheckError } = await supabase.rpc("is_admin", {
        p_user_id: admin_user_id
      });

      if (adminCheckError) {
        return res.status(400).json({ ok: false, error: adminCheckError.message });
      }

      if (!adminCheck) {
        return res.status(403).json({ ok: false, error: "Unauthorized" });
      }

      const { data, error } = await supabase
        .from("investment_plans")
        .insert(payload)
        .select()
        .single();

      if (error) return res.status(400).json({ ok: false, error: error.message });

      await supabase.from("admin_logs").insert({
        admin_user_id,
        action: "create_plan",
        target_table: "investment_plans",
        target_id: data.id,
        details: payload
      });

      return res.status(200).json({ ok: true, plan: data });
    }

    return res.status(400).json({ ok: false, error: "Invalid action" });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || "Server error" });
  }
    }
