/**
 * LomaShares — Check Deposit Status
 * GET /api/deposit-status?reference=LOMA-xxx
 *
 * Frontend polls this every 5 seconds after user pays.
 * Returns { status: "pending"|"completed"|"failed" }
 */

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { reference } = req.query;

  if (!reference) {
    return res.status(400).json({ error: "reference is required" });
  }

  const { data, error } = await supabase
    .from("deposits")
    .select("status, amount, paid_at, user_id")
    .eq("reference", reference)
    .single();

  if (error || !data) {
    return res.status(404).json({ error: "Deposit not found" });
  }

  return res.status(200).json({
    ok: true,
    status: data.status,
    amount: data.amount,
    paid_at: data.paid_at,
  });
}
