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

function getPaystackSecret() {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("Missing PAYSTACK_SECRET_KEY");
  return key;
}

async function isAdmin(supabase, adminUserId) {
  const { data, error } = await supabase.rpc("is_admin", {
    p_user_id: adminUserId
  });

  if (error) throw new Error(error.message);
  return !!data;
}

async function createRecipient(secret, name, accountNumber, bankCode) {
  const res = await fetch("https://api.paystack.co/transferrecipient", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      type: "nuban",
      name,
      account_number: accountNumber,
      bank_code: bankCode,
      currency: "NGN"
    })
  });

  const data = await res.json();
  return { ok: res.ok && data.status, data };
}

async function sendTransfer(secret, amountNaira, recipientCode, reference, reason) {
  const res = await fetch("https://api.paystack.co/transfer", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      source: "balance",
      amount: Math.round(Number(amountNaira) * 100),
      recipient: recipientCode,
      reference,
      reason,
      currency: "NGN"
    })
  });

  const data = await res.json();
  return { ok: res.ok && data.status, data };
}

export default async function handler(req, res) {
  cors(res);

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const supabase = getSupabase();
    const PAYSTACK_SECRET = getPaystackSecret();
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;

    const { action, admin_user_id } = body || {};

    if (!action || !admin_user_id) {
      return res.status(400).json({ ok: false, error: "action and admin_user_id are required" });
    }

    const adminAllowed = await isAdmin(supabase, admin_user_id);
    if (!adminAllowed) {
      return res.status(403).json({ ok: false, error: "Unauthorized" });
    }

    if (action === "approve_withdrawal") {
      const { withdrawal_id } = body;

      if (!withdrawal_id) {
        return res.status(400).json({ ok: false, error: "withdrawal_id is required" });
      }

      const { data: withdrawal, error: withdrawalError } = await supabase
        .from("withdrawals")
        .select("*")
        .eq("id", withdrawal_id)
        .single();

      if (withdrawalError || !withdrawal) {
        return res.status(404).json({ ok: false, error: "Withdrawal not found" });
      }

      if (withdrawal.status !== "pending") {
        return res.status(400).json({ ok: false, error: "Only pending withdrawals can be approved" });
      }

      if (!withdrawal.bank_code) {
        return res.status(400).json({
          ok: false,
          error: "Missing bank_code for withdrawal"
        });
      }

      if (!withdrawal.account_name || !withdrawal.account_number) {
        return res.status(400).json({
          ok: false,
          error: "Missing bank account details"
        });
      }

      if (withdrawal.payout_reference) {
        return res.status(200).json({
          ok: true,
          message: "Withdrawal already processed",
          payout_reference: withdrawal.payout_reference
        });
      }

      let recipientCode = withdrawal.recipient_code;

      if (!recipientCode) {
        const recipientResult = await createRecipient(
          PAYSTACK_SECRET,
          withdrawal.account_name,
          withdrawal.account_number,
          withdrawal.bank_code
        );

        if (!recipientResult.ok) {
          return res.status(400).json({
            ok: false,
            error: recipientResult.data?.message || "Failed to create transfer recipient"
          });
        }

        recipientCode = recipientResult.data.data.recipient_code;

        const { error: saveRecipientError } = await supabase
          .from("withdrawals")
          .update({
            recipient_code: recipientCode,
            transfer_response: {
              recipient_create: recipientResult.data.data
            }
          })
          .eq("id", withdrawal.id);

        if (saveRecipientError) {
          return res.status(500).json({ ok: false, error: saveRecipientError.message });
        }
      }

      const payoutReference = `loma_wdr_${withdrawal.id}`.toLowerCase();

      const { error: saveRefError } = await supabase
        .from("withdrawals")
        .update({
          payout_reference: payoutReference
        })
        .eq("id", withdrawal.id)
        .is("payout_reference", null);

      if (saveRefError) {
        return res.status(500).json({ ok: false, error: saveRefError.message });
      }

      const transferResult = await sendTransfer(
        PAYSTACK_SECRET,
        withdrawal.amount,
        recipientCode,
        payoutReference,
        "User withdrawal"
      );

      if (!transferResult.ok) {
        await supabase
          .from("withdrawals")
          .update({
            paystack_transfer_status: transferResult.data?.data?.status || "failed",
            transfer_response: transferResult.data || {},
            updated_at: new Date().toISOString()
          })
          .eq("id", withdrawal.id);

        return res.status(400).json({
          ok: false,
          error: transferResult.data?.message || "Paystack transfer failed"
        });
      }

      const paystackTransfer = transferResult.data.data;

      const { error: updateWithdrawalError } = await supabase
        .from("withdrawals")
        .update({
          status: "paid",
          reviewed_by: admin_user_id,
          reviewed_at: new Date().toISOString(),
          paystack_transfer_code: paystackTransfer.transfer_code || null,
          paystack_transfer_reference: paystackTransfer.reference || payoutReference,
          paystack_transfer_status: paystackTransfer.status || "pending",
          transfer_response: paystackTransfer,
          updated_at: new Date().toISOString()
        })
        .eq("id", withdrawal.id);

      if (updateWithdrawalError) {
        return res.status(500).json({ ok: false, error: updateWithdrawalError.message });
      }

      const { error: txUpdateError } = await supabase
        .from("wallet_transactions")
        .update({
          status: "completed"
        })
        .eq("source_table", "withdrawals")
        .eq("source_id", withdrawal.id);

      if (txUpdateError) {
        return res.status(500).json({ ok: false, error: txUpdateError.message });
      }

      await supabase.from("admin_logs").insert({
        admin_user_id,
        action: "approve_withdrawal_auto_payout",
        target_table: "withdrawals",
        target_id: withdrawal.id,
        details: {
          payout_reference: payoutReference,
          paystack_transfer_code: paystackTransfer.transfer_code || null,
          paystack_transfer_status: paystackTransfer.status || null
        }
      });

      return res.status(200).json({
        ok: true,
        withdrawal_id: withdrawal.id,
        status: "paid",
        transfer: paystackTransfer
      });
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

    if (action === "generate_gift_code") {
      const { code, amount, max_redemptions = 1, expires_at = null } = body;

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

    return res.status(400).json({ ok: false, error: "Invalid action" });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || "Server error" });
  }
                               }
