/* Analyst Assist shared staff auth helper.
   Uses Supabase email/password auth. Staff can use one shared team login if that is your preferred workflow. */
(function(){
  const cfg = window.DPP_CONFIG || {};
  const hasConfig = !!(window.supabase && cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && !String(cfg.SUPABASE_URL).includes('PASTE_'));
  window.aaSupabase = hasConfig ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;

  window.requireAuth = async function(){
    if(!window.aaSupabase){ console.warn('Analyst Assist Supabase config missing.'); return; }
    const { data } = await window.aaSupabase.auth.getSession();
    if(!data.session && !location.pathname.endsWith('/staff-access.html')){
      location.href = 'staff-access.html';
    }
  };

  window.signOut = async function(){
    if(window.aaSupabase) await window.aaSupabase.auth.signOut();
    location.href = 'staff-access.html';
  };
})();
