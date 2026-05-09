/* Analyst Assist cloud sync for coach-console.html
   - Uses live_game_state (not analyst_assist_state which has been removed)
   - Reuses window.aaSupabase set by supabase-app.js (no second createClient call)
   - Falls back gracefully to localStorage when offline or Supabase unavailable
   - Updates the nav sync badge to show LOCAL vs LIVE accurately */
(function(){

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

  // ── Updates both the nav badge and the bottom-left pill ───────
  function setSyncStatus(online) {
    const badge = document.getElementById('syncBadge');
    const dot   = document.getElementById('syncDot');
    const label = document.getElementById('syncLabel');
    if(badge) {
      if(online) {
        badge.classList.remove('offline');
        if(dot)   dot.style.background = 'var(--green, #34d399)';
        if(label) label.textContent = 'LIVE';
      } else {
        badge.classList.add('offline');
        if(dot)   dot.style.background = '#fb7185';
        if(label) label.textContent = 'LOCAL';
      }
    }
    let pill = document.getElementById('aaCloudStatus');
    if(!pill) {
      pill = document.createElement('div');
      pill.id = 'aaCloudStatus';
      pill.style.cssText = 'position:fixed;left:14px;bottom:14px;z-index:9999;padding:6px 12px;border-radius:999px;background:#07111f;color:#e5e7eb;border:1px solid rgba(245,197,66,.35);font:800 11px ui-monospace,Menlo,monospace;box-shadow:0 4px 20px rgba(0,0,0,.3);pointer-events:none;transition:all .3s';
      document.body.appendChild(pill);
    }
    if(online) {
      pill.textContent = 'Supabase sync · LIVE ●';
      pill.style.borderColor = 'rgba(34,197,94,.5)';
      pill.style.color = '#86efac';
    } else {
      pill.textContent = 'Local mode — no sync';
      pill.style.borderColor = 'rgba(251,113,133,.5)';
      pill.style.color = '#fca5a5';
    }
  }

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

  async function getSession(){
    const client = getClient(); if(!client) return null;
    const { data } = await client.auth.getSession();
    return data?.session || null;
  }

  async function pickTeam(client){
    const { data, error } = await client
      .from('teams').select('*')
      .order('created_at', { ascending: false }).limit(1);
    if(error) throw error;
    return data && data[0];
  }

  async function ensureGame(client){
    const { data, error } = await client
      .from('live_games').select('*')
      .eq('team_id', team.id).eq('status','active')
      .order('created_at', { ascending: false }).limit(1);
    if(error) throw error;
    if(data && data[0]) return data[0];
    const { data: newGame, error: iErr } = await client
      .from('live_games')
      .insert({ team_id: team.id, created_by: session.user.id, name: 'Analyst Assist Live Game', status: 'active' })
      .select('*').single();
    if(iErr) throw iErr;
    return newGame;
  }

  async function loadCloud(client){
    const { data, error } = await client
      .from('live_game_state').select('*')
      .eq('game_id', game.id).maybeSingle();
    if(error) throw error;
    if(data?.state) applyLiveControls(data.state);
  }

  async function saveCloudNow(){
    const client = getClient();
    if(!client || !session || !team || !game || applyingRemote) return;
    const { error } = await client
      .from('live_game_state')
      .upsert({
        game_id: game.id, team_id: team.id,
        state: captureLiveControls(),
        updated_by: session.user.id,
        updated_at: new Date().toISOString()
      }, { onConflict: 'game_id' });
    if(error){ setSyncStatus(false); console.warn('Sync error:', error.message); return; }
    setSyncStatus(true);
  }

  function queueSave(){
    if(applyingRemote) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveCloudNow, 600);
  }

  function patchSaveFunctions(){
    ['saveState','silentSave'].forEach(name => {
      const orig = window[name];
      if(!orig || orig.__aaSynced) return;
      window[name] = function(){ const out = orig.apply(this, arguments); queueSave(); return out; };
      window[name].__aaSynced = true;
      try { eval(name + ' = window.' + name); } catch(e){}
    });
  }

  function subscribe(client){
    if(channel) client.removeChannel(channel);
    channel = client.channel('aa-game-state-' + game.id)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'live_game_state',
        filter: 'game_id=eq.' + game.id
      }, payload => {
        const incoming = payload.new?.state;
        if(!incoming) return;
        if(incoming.device_id && incoming.device_id === deviceId) return;
        applyingRemote = true;
        applyLiveControls(incoming);
        applyingRemote = false;
      })
      .subscribe(state => {
        if(state === 'SUBSCRIBED')    setSyncStatus(true);
        if(state === 'CHANNEL_ERROR') setSyncStatus(false);
        if(state === 'CLOSED')        setSyncStatus(false);
      });
  }

  document.addEventListener('change', e => {
    if(e.target && /^g-/.test(e.target.id || '')) queueSave();
  });

  async function init(){
    const client = getClient();
    if(!client){ setSyncStatus(false); return; }
    try {
      session = await getSession();
      if(!session){ setSyncStatus(false); return; }
      team = await pickTeam(client);
      if(!team){ setSyncStatus(false); return; }
      game = await ensureGame(client);
      patchSaveFunctions();
      await loadCloud(client);
      await saveCloudNow();
      subscribe(client);
    } catch(e) {
      console.warn('Analyst Assist cloud sync failed:', e);
      setSyncStatus(false);
    }
  }

  window.setSyncStatus = setSyncStatus;

  window.addEventListener('load', () => {
    setSyncStatus(false); // start LOCAL, upgrade to LIVE if sync works
    setTimeout(init, 400);
  });

})();
