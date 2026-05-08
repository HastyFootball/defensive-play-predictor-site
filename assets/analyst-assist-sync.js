/* Analyst Assist cloud sync for coach-console.html
   Keeps the unified console from being local-only. Uses Supabase when logged in,
   and falls back to browser storage if the connection/table is not ready. */
(function(){
  const cfg = window.DPP_CONFIG || {};
  const enabled = !!(window.supabase && cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_URL.includes('PASTE_'));
  const client = enabled ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;
  let session = null;
  let team = null;
  let game = null;
  let channel = null;
  let saveTimer = null;
  let applyingRemote = false;

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
  function applyPayload(payload){
    if(!payload || typeof ST === 'undefined') return;
    applyingRemote = true;
    const next = payload.state || {};
    ST = { ...ST, ...next };
    ST.star = { ...(ST.star||{}), ...((next && next.star)||{}) };
    ST.defense = { ...(ST.defense||{}), ...((next && next.defense)||{}) };
    localStorage.setItem('dpp_v4', JSON.stringify(ST));
    applyLayout(payload.layout || {});
    if(typeof renderAll === 'function') renderAll();
    applyingRemote = false;
  }
  async function getSession(){ const {data} = await client.auth.getSession(); return data.session; }
  async function pickTeam(){
    const params = new URLSearchParams(location.search);
    const teamId = params.get('team');
    let query = client.from('teams').select('*').order('created_at',{ascending:false});
    if(teamId) query = client.from('teams').select('*').eq('id', teamId).limit(1);
    const {data, error} = await query.limit ? await query.limit(1) : await query;
    if(error) throw error;
    return data && data[0];
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
    const payload = { state: ST, layout: getLocalLayout(), saved_at: new Date().toISOString() };
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
  }
  function subscribe(){
    if(channel) client.removeChannel(channel);
    channel = client.channel('analyst-assist-state-' + game.id)
      .on('postgres_changes', {event:'*', schema:'public', table:'analyst_assist_state', filter:'game_id=eq.'+game.id}, payload=>{
        const updatedBy = payload.new && payload.new.updated_by;
        if(updatedBy && session && updatedBy === session.user.id) return;
        if(payload.new && payload.new.payload) applyPayload(payload.new.payload);
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
