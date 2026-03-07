import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {

const supabase = createClient(
process.env.SUPABASE_URL,
process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data, error } = await supabase.rpc("credit_daily_profit");

if(error){
return res.status(500).json(error);
}

res.status(200).json(data);

}
