import { createClient } from "@supabase/supabase-js";

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
}

function getPaystackSecret() {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("Missing PAYSTACK_SECRET_KEY");
  return key;
}

export default async function handler(req, res) {
  cors(res);

  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const paystackRes = await fetch("https://api.paystack.co/bank?country=nigeria", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${getPaystackSecret()}`
      }
    });

    const paystackData = await paystackRes.json();

    if (!paystackRes.ok || !paystackData.status) {
      return res.status(400).json({
        ok: false,
        error: paystackData.message || "Failed to fetch banks"
      });
    }

    const wantedNames = [
      "OPay",
      "PalmPay",
      "Moniepoint",
      "Kuda",
      "Paga"
    ];

    const aliases = {
      opay: ["OPay", "Paycom", "Paycom (Opay)", "Paycom(Opay)"],
      palmpay: ["PalmPay", "Palmpay"],
      moniepoint: ["Moniepoint", "Moniepoint MFB", "Moniepoint Microfinance Bank"],
      kuda: ["Kuda", "Kuda Bank", "Kuda Microfinance Bank"],
      paga: ["Paga"]
    };

    const normalized = paystackData.data.map((bank) => ({
      name: bank.name,
      code: bank.code,
      slug: String(bank.name || "").toLowerCase()
    }));

    function findFirst(aliasList) {
      return normalized.find((b) =>
        aliasList.some((alias) => b.slug.includes(alias.toLowerCase()))
      );
    }

    const result = [
      findFirst(aliases.opay),
      findFirst(aliases.palmpay),
      findFirst(aliases.moniepoint),
      findFirst(aliases.kuda),
      findFirst(aliases.paga)
    ].filter(Boolean);

    return res.status(200).json({
      ok: true,
      banks: result
    });
  } catch (err) {
    return res.status(500).json({
      ok: false,
      error: err.message || "Server error"
    });
  }
}
