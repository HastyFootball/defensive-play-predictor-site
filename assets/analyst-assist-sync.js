/* Analyst Assist cloud sync for coach-console.html
   - Uses live_game_state (not analyst_assist_state which has been removed)
   - Reuses window.aaSupabase set by supabase-app.js (no second createClient call)
   - Falls back gracefully to localStorage when offline or Supabase unavailable */
(function(){

  // ── Reuse the client already created by supabase-app.js ──────
  // Never call createClient() again here — that causes the "Multiple GoTrueClient" warning.
  function getClient(){ return window.aaSupabase || null; }

  let session = null;
  let team    = null;
  let game    = null;
  let channel = null;
  let saveTimer = null;
  let applyingRemote = false;

  const deviceId = (()=>{
    let id = localStorage.getItem('aa_device_id');
    if(!id){
      id = (crypto && crypto.randomUUID)
        ? crypto.randomUUID()
        : String(Date.now()) + '-' + Math.random().toString(16).slice(2);
      localStorage.setItem('aa_device_id', id);
    }
    return id;
  })();

  // ── Status badge (bottom-left) ────────────────────────────────
  function status(msg, ok=true){
    let b = document.getElementById('aaCloudStatus');
    if(!b){
      b = document.createElement('div');
      b.id = 'aaCloudStatus';
      b.style.cssText = [
        'position:fixed;left:14px;bottom:14px;z-index:9999',
        'padding:8px 14px;border-radius:999px',
        'background:#07111f;color:#e5e7eb',
        'border:1px solid rgba(245,197,66,.35)',
        'font:800 11px ui-monospace,Menlo,monospace',
        'box-shadow:0 4px 20px rgba(0,0,0,.3)',
        'pointer-events:none'
      ].join(';');
      document.body.appendChild(b);
    }
    b.textContent = msg;
    b.style.borderColor = ok
      ? 'rgba(34,197,94,.5)'
      : 'rgba(251,113,133,.5)';
    b.style.color = ok ? '#86efac' : '#fca5a5';
  }

  // ── Capture / apply the live game situation selects ───────────
  function captureLiveControls(){
    const ids = ['g-qtr','g-down','g-dist','g-zone','g-score',
                 'g-pers','g-form','g-str','g-hash','g-tempo','g-star','g-phase'];
    const out = {};
    ids.forEach(id => {
      const node = document.getElementById(id);
      if(node) out[id] = node.value;
    });
    out.captured_at = new Date().toISOString();
    return out;
  }

  function applyLiveControls(live){
    if(!live || typeof live !== 'object') return;
    Object.entries(live).forEach(([id, value]) => {
      if(id === 'captured_at') return;
      const node = document.getElementById(id);
      if(node && value != null) node.value = value;
    });
    if(typeof syncSideline === 'function') syncSideline();
    if(typeof runPredict  === 'function') runPredict();
  }

  // ── Session / team / game helpers ─────────────────────────────
  async function getSession(){
    const client = getClient(); if(!client) return null;
    const { data } = await client.auth.getSession();
    return data?.session || null;
  }

  async function pickTeam(client){
    const { data, error } = await client
      .from('teams')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1);
    if(error) throw error;
    return data && data[0];
  }

  async function ensureGame(client){
    const { data, error } = await client
      .from('live_games')
      .select('*')
      .eq('team_id', team.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1);
    if(error) throw error;
    if(data && data[0]) return data[0];

    // No active game — create one
    const { data: newGame, error: iErr } = await client
      .from('live_games')
      .insert({
        team_id: team.id,
        created_by: session.user.id,
        name: 'Analyst Assist Live Game',
        status: 'active'
      })
      .select('*')
      .single();
    if(iErr) throw iErr;
    return newGame;
  }

  // ── Load latest state from Supabase ───────────────────────────
  async function loadCloud(client){
    const { data, error } = await client
      .from('live_game_state')
      .select('*')
      .eq('game_id', game.id)
      .maybeSingle();
    if(error) throw error;
    if(data?.state) applyLiveControls(data.state);
  }

  // ── Push current situation to Supabase ────────────────────────
  async function saveCloudNow(){
    const client = getClient();
    if(!client || !session || !team || !game || applyingRemote) return;

    const state = captureLiveControls();
    const row = {
      game_id:    game.id,
      team_id:    team.id,
      state,
      updated_by: session.user.id,
      updated_at: new Date().toISOString()
    };

    const { error } = await client
      .from('live_game_state')
      .upsert(row, { onConflict: 'game_id' });

    if(error){
      // Show error but don't toast — keep it quiet, fall back silently
      status('Local mode (sync unavailable)', false);
      console.warn('Analyst Assist sync error:', error.message);
      return;
    }
    status('Supabase sync · LIVE ●');
  }

  function queueSave(){
    if(applyingRemote) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveCloudNow, 600);
  }

  // ── Patch save functions so every state change queues a push ──
  function patchSaveFunctions(){
    const wrap = (name) => {
      const orig = window[name];
      if(!orig || orig.__aaSynced) return;
      window[name] = function(){
        const out = orig.apply(this, arguments);
        queueSave();
        return out;
      };
      window[name].__aaSynced = true;
      try { eval(name + ' = window.' + name); } catch(e){}
    };
    ['saveState','silentSave'].forEach(wrap);
  }

  // ── Realtime subscription: receive changes from other devices ─
  function subscribe(client){
    if(channel) client.removeChannel(channel);
    channel = client
      .channel('aa-game-state-' + game.id)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'live_game_state',
        filter: 'game_id=eq.' + game.id
      }, payload => {
        const incoming = payload.new?.state;
        if(!incoming) return;
        // Ignore our own pushes
        if(incoming.device_id && incoming.device_id === deviceId) return;
        applyingRemote = true;
        applyLiveControls(incoming);
        applyingRemote = false;
      })
      .subscribe(state => {
        if(state === 'SUBSCRIBED') status('Supabase sync · LIVE ●');
        if(state === 'CHANNEL_ERROR') status('Sync error — local mode', false);
        if(state === 'CLOSED') status('Sync closed — local mode', false);
      });
  }

  // ── Also push whenever any g-* dropdown changes ───────────────
  document.addEventListener('change', e => {
    if(e.target && /^g-/.test(e.target.id || '')) queueSave();
  });

  // ── Main init ─────────────────────────────────────────────────
  async function init(){
    const client = getClient();
    if(!client){
      status('Local mode — configure Supabase to enable sync', false);
      return;
    }

    try {
      session = await getSession();
      if(!session){
        status('Local mode — not logged in', false);
        return;
      }

      team = await pickTeam(client);
      if(!team){
        // This can happen if the auto-create trigger hasn't fired yet.
        // Silently stay in local mode.
        status('Local mode — no team found', false);
        return;
      }

      game = await ensureGame(client);
      patchSaveFunctions();
      await loadCloud(client);
      await saveCloudNow();
      subscribe(client);

    } catch(e) {
      console.warn('Analyst Assist cloud sync failed:', e);
      // Show a quiet local-mode message, NOT an error toast with table names
      status('Local mode (offline or setup needed)', false);
    }
  }

  // Wait for page + supabase-app.js to finish before starting
  window.addEventListener('load', () => setTimeout(init, 400));

})();
