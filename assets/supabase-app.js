/* Analyst Assist shared staff auth helper.
   Uses Supabase email/password auth. Missing config will not lock you out of the UI; it only disables cloud login. */
(function(){
  const cfg = window.DPP_CONFIG || {};
  const url = String(cfg.SUPABASE_URL || '');
  const key = String(cfg.SUPABASE_ANON_KEY || '');
  const hasConfig = !!(window.supabase && url.startsWith('https://') && key.length > 30 && !url.includes('PASTE') && !key.includes('PASTE'));
  window.aaSupabase = hasConfig ? window.supabase.createClient(url, key) : null;

  window.requireAuth = async function(){
    if(!window.aaSupabase){
      console.warn('Analyst Assist Supabase config missing or placeholder. Cloud login disabled, but local UI remains open.');
      return;
    }
    const { data, error } = await window.aaSupabase.auth.getSession();
    if(error){ console.warn('Auth session check failed:', error.message); return; }
    if(!data.session && !location.pathname.endsWith('/staff-access.html')){
      location.href = 'staff-access.html';
    }
  };

  window.signOut = async function(){
    if(window.aaSupabase) await window.aaSupabase.auth.signOut();
    location.href = 'staff-access.html';
  };
})();
