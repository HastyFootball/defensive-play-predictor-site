// ─── SUPABASE ALIAS + SESSION HELPER ─────────────────────────
// Bridges window.aaSupabase (set by supabase-app.js) into the
// short alias `sb` that cloudInit() expects, and provides getSession().
const sb = window.aaSupabase || null;
 
async function getSession() {
  if (!sb) return null;
  try {
    const { data } = await sb.auth.getSession();
    return data?.session || null;
  } catch(e) { return null; }
}
 
// ─── REQUIRE AUTH ─────────────────────────────────────────────
if (typeof requireAuth === 'function') requireAuth();
 
