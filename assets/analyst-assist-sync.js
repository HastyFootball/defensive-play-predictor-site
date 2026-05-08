/* Analyst Assist cloud sync for coach-console.html
   Keeps the unified console from being local-only. Uses Supabase when logged in,
   and falls back to browser storage if the connection/table is not ready. */
(function(){
  const cfg = window.DPP_CONFIG || {};
  const enabled = !!(window.supabase && cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_URL.includes('PASTE_'));
  const client = enabled ? (window.aaSupabase || window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY)) : null;
  let session = null;
  let team = null;
  let game = null;
  let channel = null;
  let saveTimer = null;
  let applyingRemote = false;
  const deviceId = (()=>{
    let id = localStorage.getItem('aa_device_id');
    if(!id){ id = (crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + '-' + Math.random().toString(16).slice(2); localStorage.setItem('aa_device_id', id); }
    return id;
  })();

  function el(id){ return document.getElementById(id); }
  function status(msg, ok=true){
    let b = el('aaCloudStatus');
    if(!b){
      b = document.createElement('div');
      b.id = 'aaCloudStatus';
      b.style.cssText = 'position:fixed;left:14px;bottom:14px;z-index:9999;padding:8px 11px;border-radius:999px;background:#07111f;color:#e5e7eb;border:1px solid rgba(245,197,66,.35);font:800 11px ui-monospace,Menlo,monospace;box-shadow:0 10px 30px rgba(0,0,0,.25)';
      document.body.appendChild(b);
    }
    b.textContent = msg;
    b.style.borderColor = ok ? 'rgba(34,197,94,.45)' : 'rgba(251,113,133,.55)';
  }
  function safeParse(v, fallback){ try { return JSON.parse(v); } catch(e){ return fallback; } }
  function getLocalLayout(){
    return {
      game: safeParse(localStorage.getItem('dpp_game_layout_v2'), []),
      sideline: safeParse(localStorage.getItem('dpp_sideline_layout_v3'), []),
      minimized: safeParse(localStorage.getItem('dpp_card_minimized_v1'), {}),
      sidelineNoiseHidden: localStorage.getItem('dpp_sideline_noise_hidden_v3') !== '0'
    };
  }
  function applyLayout(layout){
    if(!layout) return;
    if(Array.isArray(layout.game)) localStorage.setItem('dpp_game_layout_v2', JSON.stringify(layout.game));
    if(Array.isArray(layout.sideline)) localStorage.setItem('dpp_sideline_layout_v3', JSON.stringify(layout.sideline));
    if(layout.minimized) localStorage.setItem('dpp_card_minimized_v1', JSON.stringify(layout.minimized));
    localStorage.setItem('dpp_sideline_noise_hidden_v3', layout.sidelineNoiseHidden ? '1' : '0');
    if(typeof loadLayoutOrder === 'function') loadLayoutOrder();
    if(typeof loadSidelineLayoutOrder === 'function') loadSidelineLayoutOrder();
    if(typeof applyCardMinimizeState === 'function') applyCardMinimizeState();
  }

  function captureLiveControls(){
    const ids = ['g-qtr','g-down','g-dist','g-zone','g-score','g-pers','g-form','g-str','g-hash','g-tempo','g-star','g-phase'];
    const out = {};
    ids.forEach(id=>{ const node = el(id); if(node) out[id] = node.value; });
    out.captured_at = new Date().toISOString();
    return out;
  }
  function applyLiveControls(live){
    if(!live || typeof live !== 'object') return;
    Object.entries(live).forEach(([id,value])=>{
      if(id === 'captured_at') return;
      const node = el(id);
      if(node && value != null) node.value = value;
    });
    if(typeof syncSideline === 'function') syncSideline();
  }
  function applyPayload(payload){
    if(!payload || typeof ST === 'undefined') return;
    applyingRemote = true;
    const next = payload.state || {};
    ST = { ...ST, ...next };
    ST.star = { ...(ST.star||{}), ...((next && next.star)||{}) };
    ST.defense = { ...(ST.defense||{}), ...((next && next.defense)||{}) };
    localStorage.setItem('dpp_v4', JSON.stringify(ST));
    applyLiveControls(payload.live || payload.situation || {});
    applyLayout(payload.layout || {});
    if(typeof renderAll === 'function') renderAll();
    if(typeof runPredict === 'function') runPredict();
    if(typeof renderLiveLog === 'function') renderLiveLog();
    applyingRemote = false;
  }
  async function getSession(){ const {data} = await client.auth.getSession(); return data.session; }
  async function pickTeam(){
    const params = new URLSearchParams(location.search);
    const teamId = params.get('team');
    let q = client.from('teams').select('*').order('created_at',{ascending:false}).limit(1);
    if(teamId) q = client.from('teams').select('*').eq('id', teamId).limit(1);
    let {data, error} = await q;
    if(error) throw error;
    if(data && data[0]) return data[0];
    const teamName = (typeof ST !== 'undefined' && ST.teamName) ? ST.teamName : 'Analyst Assist Team';
    const inserted = await client.from('teams').insert({name:teamName, owner_id:session.user.id}).select('*').single();
    if(inserted.error) throw inserted.error;
    return inserted.data;
  }
  async function ensureGame(){
    let {data, error} = await client.from('live_games').select('*').eq('team_id', team.id).eq('status','active').order('created_at',{ascending:false}).limit(1);
    if(error) throw error;
    if(data && data[0]) return data[0];
    const inserted = await client.from('live_games').insert({team_id:team.id, created_by:session.user.id, name:'Analyst Assist Live Game', status:'active'}).select('*').single();
    if(inserted.error) throw inserted.error;
    return inserted.data;
  }
  async function loadCloud(){
    const {data, error} = await client.from('analyst_assist_state').select('*').eq('team_id', team.id).eq('game_id', game.id).maybeSingle();
    if(error) throw error;
    if(data && data.payload) applyPayload(data.payload);
  }
  async function saveCloudNow(){
    if(!client || !session || !team || !game || applyingRemote || typeof ST === 'undefined') return;
    const payload = {
      state: ST,
      live: captureLiveControls(),
      layout: getLocalLayout(),
      saved_at: new Date().toISOString(),
      device_id: deviceId
    };
    const row = { team_id: team.id, game_id: game.id, payload, updated_by: session.user.id, updated_at: new Date().toISOString() };
    const {error} = await client.from('analyst_assist_state').upsert(row, {onConflict:'team_id,game_id'});
    if(error){ status('Cloud sync issue: '+error.message, false); return; }
    status('Supabase sync on');
  }
  function queueSave(){
    if(applyingRemote) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveCloudNow, 650);
  }
  function patchSaveFunctions(){
    const oldSave = window.saveState || saveState;
    const oldSilent = window.silentSave || silentSave;
    window.saveState = function(){ oldSave(); queueSave(); };
    window.silentSave = function(){ oldSilent(); queueSave(); };
    // Also patch lexical/global functions when available.
    try { saveState = window.saveState; silentSave = window.silentSave; } catch(e) {}
    ['saveLayoutOrder','saveSidelineLayoutOrder','saveCardMinState'].forEach(name=>{
      const fn = window[name] || (typeof globalThis[name] === 'function' ? globalThis[name] : null);
      if(!fn) return;
      window[name] = function(){ const out = fn.apply(this, arguments); queueSave(); return out; };
      try { globalThis[name] = window[name]; } catch(e) {}
    });
    const rp = window.runPredict || (typeof globalThis.runPredict === 'function' ? globalThis.runPredict : null);
    if(rp && !rp.__aaCloudPatched){
      const wrappedRunPredict = function(){
        const out = rp.apply(this, arguments);
        queueSave();
        return out;
      };
      wrappedRunPredict.__aaCloudPatched = true;
      window.runPredict = wrappedRunPredict;
      try { globalThis.runPredict = wrappedRunPredict; runPredict = wrappedRunPredict; } catch(e) {}
    }
  }
  function subscribe(){
    if(channel) client.removeChannel(channel);
    channel = client.channel('analyst-assist-state-' + game.id)
      .on('postgres_changes', {event:'*', schema:'public', table:'analyst_assist_state', filter:'game_id=eq.'+game.id}, payload=>{
        const incoming = payload.new && payload.new.payload;
        if(incoming && incoming.device_id && incoming.device_id === deviceId) return;
        if(incoming) applyPayload(incoming);
      })
      .subscribe(state=>{ if(state === 'SUBSCRIBED') status('Supabase sync on'); });
  }
  async function init(){
    if(!enabled){ status('Local mode: Supabase config missing', false); return; }
    try{
      session = await getSession();
      if(!session){ status('Local mode until login', false); return; }
      team = await pickTeam();
      if(!team){ status('Create a team to enable Supabase sync', false); return; }
      game = await ensureGame();
      patchSaveFunctions();
      await loadCloud();
      await saveCloudNow();
      subscribe();
    }catch(e){
      console.warn('Analyst Assist cloud sync failed', e);
      status('Local fallback: run Supabase setup SQL', false);
    }
  }
  window.addEventListener('load', init);
})();
