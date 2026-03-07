(function () {
  "use strict";

  const body = document.body;
  const html = document.documentElement;

  const SUPABASE_URL =
    window.SUPABASE_URL ||
    body?.getAttribute("data-supabase-url") ||
    html?.getAttribute("data-supabase-url");

  const SUPABASE_ANON_KEY =
    window.SUPABASE_ANON_KEY ||
    body?.getAttribute("data-supabase-anon") ||
    html?.getAttribute("data-supabase-anon");

  if (!window.supabase) {
    console.error("Supabase JS library not loaded.");
    return;
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error("Missing Supabase URL or anon key.");
    return;
  }

  window.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
})();
