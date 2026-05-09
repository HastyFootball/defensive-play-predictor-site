/* Analyst Assist shared staff auth helper. */
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
      console.warn('Analyst Assist: Supabase config missing or placeholder. Cloud login disabled.');
      return;
    }
    const { data, error } = await window.aaSupabase.auth.getSession();
    if(error){ console.warn('Auth session check failed:', error.message); return; }
    if(!data.session && !location.pathname.endsWith('/staff-access.html')){
      location.href = 'login.html';
    }
  };

  window.signOut = async function(){
    try { localStorage.removeItem('aa_auth_bypass'); } catch(e) {}
    if(window.aaSupabase) await window.aaSupabase.auth.signOut();
    location.href = 'login.html';
  };

  /* ── LOGIN ── */
  window.loginCoach = async function(e){
    e.preventDefault();
    const msg = document.getElementById('authMsg');
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    if(!window.aaSupabase){
      msg.style.color = 'var(--red, red)';
      msg.textContent = 'Supabase is not configured. Check assets/config.js.';
      return;
    }

    msg.style.color = 'var(--muted, #888)';
    msg.textContent = 'Signing in…';

    const { data, error } = await window.aaSupabase.auth.signInWithPassword({ email, password });

    if(error){
      msg.style.color = 'var(--red, red)';
      msg.textContent = error.message;
      return;
    }

    if(data.session){
      location.href = 'coach-console.html';
    }
  };

  /* ── SIGNUP ── */
  window.signupCoach = async function(e){
    e.preventDefault();
    const msg = document.getElementById('authMsg');
    const full_name = document.getElementById('full_name').value.trim();
    const team_name = document.getElementById('team_name').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    if(!window.aaSupabase){
      msg.style.color = 'var(--red, red)';
      msg.textContent = 'Supabase is not configured. Check assets/config.js.';
      return;
    }

    msg.style.color = 'var(--muted, #888)';
    msg.textContent = 'Creating account…';

    const { data, error } = await window.aaSupabase.auth.signUp({
      email,
      password,
      options: { data: { full_name, team_name } }
    });

    if(error){
      msg.style.color = 'var(--red, red)';
      msg.textContent = error.message;
      return;
    }

    // Supabase may require email confirmation depending on your project settings.
    // If email confirmation is disabled, data.session will exist immediately.
    if(data.session){
      location.href = 'coach-console.html';
    } else {
      msg.style.color = 'var(--green, green)';
      msg.textContent = 'Account created! Check your email to confirm, then log in.';
    }
  };

})();
