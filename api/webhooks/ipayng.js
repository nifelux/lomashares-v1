const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function verifySignature(rawBody, header) {
  const secret = process.env.IPAYNG_SECRET;
  if (!secret) return false;
  const expected = crypto.createHmac("sha512", secret).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(header, "hex"));
  } catch { return false; }
}

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    if (Buffer.isBuffer(req.body)) return resolve(req.body);
    if (typeof req.body === "string") return resolve(Buffer.from(req.body));
    const chunks = [];
    req.on("data", c => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

module.exports = async function handler(req, res) {
  // iPayNG validation ping
  if (req.method === "GET") {
    return res.status(200).json({ ok: true });
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const rawBody = await getRawBody(req);
  const sig = req.headers["signed-data"] || req.headers["signeddata"] || "";

  if (!verifySignature(rawBody, sig)) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  let payload;
  try { payload = JSON.parse(rawBody.toString("utf8")); }
  catch { return res.status(400).json({ error: "Invalid JSON" }); }

  const event = payload?.event || payload?.status;
  if (event !== "payment.success" && event !== "successful") {
    return res.status(200).json({ ok: true, skipped: true });
  }

  const reference = payload?.data?.reference || payload?.reference;
  const raw = payload?.data?.amount || payload?.amount || 0;
  const amount = raw > 10000 ? raw / 100 : raw;

  if (!reference) return res.status(400).json({ error: "Missing reference" });

  const { data, error } = await supabase.rpc("process_ipayng_deposit", {
    p_reference: reference,
    p_amount: amount,
    p_provider_payload: payload,
  });

  if (error) return res.status(500).json({ error: error.message });
  return res.status(200).json({ ok: true, data });
};

module.exports.config = { api: { bodyParser: false } };
