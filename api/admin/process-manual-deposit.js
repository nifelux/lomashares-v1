/**
 * POST /api/admin/process-manual-deposit
 * Body: { deposit_id, action: "approve"|"reject", admin_id }
 *
 * Approve → calls process_deposit RPC (credits wallet + referral + spins)
 * Reject  → marks deposit as rejected
 */

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { deposit_id, action, admin_id } = req.body;

  if (!deposit_id || !action || !admin_id) {
    return res.status(400).json({ error: "deposit_id, action, and admin_id are required" });
  }

  if (!["approve", "reject"].includes(action)) {
    return res.status(400).json({ error: "action must be approve or reject" });
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

  // Fetch deposit
  const { data: deposit, error: fetchErr } = await supabase
    .from("deposits")
    .select("*")
    .eq("id", deposit_id)
    .single();

  if (fetchErr || !deposit) {
    return res.status(404).json({ error: "Deposit not found" });
  }

  if (deposit.status === "completed") {
    return res.status(200).json({ ok: true, note: "already_completed" });
  }

  if (deposit.status === "rejected") {
    return res.status(200).json({ ok: true, note: "already_rejected" });
  }

  // ── REJECT ──────────────────────────────────────────────────────────────────
  if (action === "reject") {
    await supabase.from("deposits").update({
      status:      "rejected",
      approved_by: admin_id,
      approved_at: new Date().toISOString(),
      updated_at:  new Date().toISOString(),
    }).eq("id", deposit_id);

    return res.status(200).json({ ok: true, action: "rejected" });
  }

  // ── APPROVE ─────────────────────────────────────────────────────────────────
  // Mark approved_by before calling RPC (RPC will set status to completed)
  await supabase.from("deposits").update({
    approved_by: admin_id,
    approved_at: new Date().toISOString(),
    updated_at:  new Date().toISOString(),
  }).eq("id", deposit_id);

  const { data, error: rpcErr } = await supabase.rpc("process_deposit", {
    p_reference:        deposit.reference,
    p_amount:           deposit.amount,
    p_provider_payload: { source: "manual_admin_approval", admin_id, deposit_id },
  });

  if (rpcErr) {
    console.error("[process-manual-deposit] RPC error:", rpcErr.message);
    return res.status(500).json({ error: rpcErr.message });
  }

  if (!data?.ok) {
    return res.status(200).json({ ok: true, note: data?.error });
  }

  return res.status(200).json({
    ok:     true,
    action: "approved",
    data,
  });
};
