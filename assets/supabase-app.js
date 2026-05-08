/* Analyst Assist shared staff auth helper.
   Safe mode: missing config will not lock you out while testing.
   To bypass auth intentionally for local/setup testing, click Continue without login on staff-access.html. */
(function(){
  const cfg = window.DPP_CONFIG || {};
  const url = String(cfg.SUPABASE_URL || '');
  const key = String(cfg.SUPABASE_ANON_KEY || '');
  const hasConfig = !!(window.supabase && url.startsWith('https://') && key.length > 30 && !url.includes('PASTE') && !key.includes('PASTE'));
  window.aaSupabase = hasConfig ? window.supabase.createClient(url, key) : null;
  window.aaAuthBypass = function(){
    try { localStorage.setItem('aa_auth_bypass','1'); } catch(e) {}
    location.href = 'coach-console.html';
  };
  window.requireAuth = async function(){
    let bypass = false;
    try { bypass = localStorage.getItem('aa_auth_bypass') === '1'; } catch(e) {}
    if(bypass) return;
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
    try { localStorage.removeItem('aa_auth_bypass'); } catch(e) {}
    if(window.aaSupabase) await window.aaSupabase.auth.signOut();
    location.href = 'staff-access.html';
  };
})();
