(function () {
  "use strict";

  const SUPABASE_URL =
    window.SUPABASE_URL ||
    document.body?.getAttribute("data-supabase-url") ||
    document.documentElement?.getAttribute("data-supabase-url");

  const SUPABASE_ANON_KEY =
    window.SUPABASE_ANON_KEY ||
    document.body?.getAttribute("data-supabase-anon") ||
    document.documentElement?.getAttribute("data-supabase-anon");

  if (!window.supabase) {
    console.error("Supabase JS library not loaded.");
    return;
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error("Missing Supabase URL or anon key.");
    return;
  }

  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });

  window.sb = client;
})();
