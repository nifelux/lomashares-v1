/**
 * LomaShares — Submit Payment to iPayNG
 * POST /api/submit-payment
 *
 * After user transfers money, they submit:
 *   - reference (our internal ref)
 *   - session_id (from their bank app)
 *   - bank_name (which bank they used)
 *   - account_number (merchant account they sent to)
 *   - amount
 *
 * This calls iPayNG's automanual API to register the payment.
 * iPayNG then verifies and fires the webhook when confirmed.
 */

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { reference, session_id, bank_name, account_number, amount } = req.body;

  if (!reference || !session_id || !bank_name || !account_number || !amount) {
    return res.status(400).json({
      error: "reference, session_id, bank_name, account_number and amount are all required"
    });
  }

  // 1. Verify deposit exists and is still pending
  const { data: deposit, error: fetchErr } = await supabase
    .from("deposits")
    .select("id, user_id, amount, status")
    .eq("reference", reference)
    .single();

  if (fetchErr || !deposit) {
    return res.status(404).json({ error: "Deposit not found" });
  }

  if (deposit.status === "completed") {
    return res.status(200).json({ ok: true, note: "already_completed" });
  }

  if (deposit.status !== "pending") {
    return res.status(400).json({ error: "Deposit is not in pending state" });
  }

  // 2. Submit to iPayNG automanual endpoint
  let ipayResponse;
  try {
    const ipayRes = await fetch("https://ipayng.com/api/live/v1/automanual", {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "Accept":        "application/json",
        "Authorization": `Bearer ${process.env.IPAYNG_SECRET_KEY}`,
      },
      body: JSON.stringify({
        accountNo:          account_number,
        sessionIdOrReference: session_id,
        amount:             String(amount),
        bankName:           bank_name,
        reference:          reference,
      }),
    });

    ipayResponse = await ipayRes.json();
    console.log("[submit-payment] iPayNG response:", ipayResponse);

    if (!ipayRes.ok) {
      return res.status(502).json({
        error: ipayResponse?.message || "iPayNG rejected the submission",
        details: ipayResponse,
      });
    }

  } catch (err) {
    console.error("[submit-payment] iPayNG fetch error:", err);
    return res.status(502).json({ error: "Could not reach iPayNG. Try again." });
  }

  // 3. Mark deposit as "submitted" (waiting for webhook to complete it)
  await supabase
    .from("deposits")
    .update({
      status:     "submitted",
      session_id: session_id,
      updated_at: new Date().toISOString(),
    })
    .eq("reference", reference);

  return res.status(200).json({
    ok:      true,
    message: "Payment submitted. Waiting for confirmation.",
    ipay:    ipayResponse,
  });
};
