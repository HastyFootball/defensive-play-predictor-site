/* Analyst Assist full cloud sync for coach-console.html
   - Supabase live_game_state is the authoritative cross-device game/workspace state.
   - Syncs the FULL Coaching Console state: film, live plays, opponent/week,
     concepts, formations, setup, reports inputs, plus the current live controls.
   - localStorage remains a fast offline cache/fallback.
   - Migrates safely from the older controls-only live_game_state payload.
   - Reuses window.aaSupabase from supabase-app.js. */
(function(){
  'use strict';

  function getClient(){ return window.aaSupabase || null; }

  let session = null;
  let team = null;
  let game = null;
  let channel = null;
  let saveTimer = null;
  let applyingRemote = false;
  let initialized = false;

  const LOCAL_STATE_KEY = 'dpp_v4';
  const LOCAL_SYNC_TIME_KEY = 'aa_full_state_updated_at';
  const SCHEMA_VERSION = 2;

  const deviceId = (()=>{
    let id = localStorage.getItem('aa_device_id');
    if(!id){
      id = (window.crypto && window.crypto.randomUUID)
        ? window.crypto.randomUUID()
        : String(Date.now()) + '-' + Math.random().toString(16).slice(2);
      localStorage.setItem('aa_device_id', id);
    }
    return id;
  })();

  function clone(value){
    if(value == null) return value;
    return JSON.parse(JSON.stringify(value));
  }

  function nowIso(){ return new Date().toISOString(); }

  function setLocalSyncTime(iso){
    localStorage.setItem(LOCAL_SYNC_TIME_KEY, iso || nowIso());
  }

  function getLocalSyncTime(){
    return Date.parse(localStorage.getItem(LOCAL_SYNC_TIME_KEY) || '') || 0;
  }

  function hasLocalState(){
    return !!localStorage.getItem(LOCAL_STATE_KEY);
  }

  function hasMeaningfulLocalData(){
    if(typeof ST === 'undefined') return false;
    return !!(
      (Array.isArray(ST.film) && ST.film.length) ||
      (Array.isArray(ST.live) && ST.live.length) ||
      (Array.isArray(ST.customConcepts) && ST.customConcepts.length) ||
      (Array.isArray(ST.customFormations) && ST.customFormations.length) ||
      (ST.opp && ST.opp !== 'Opponent') ||
      ST.week
    );
  }

  function setSyncStatus(online, detail='') {
    const badge = document.getElementById('syncBadge');
    const dot   = document.getElementById('syncDot');
    const label = document.getElementById('syncLabel');
    if(badge) {
      if(online) {
        badge.classList.remove('offline');
        if(dot) dot.style.background = 'var(--green, #34d399)';
        if(label) label.textContent = 'LIVE';
      } else {
        badge.classList.add('offline');
        if(dot) dot.style.background = '#fb7185';
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
      pill.textContent = 'Supabase sync · LIVE ●' + (detail ? ' · ' + detail : '');
      pill.style.borderColor = 'rgba(34,197,94,.5)';
      pill.style.color = '#86efac';
    } else {
      pill.textContent = 'Local mode — no sync' + (detail ? ' · ' + detail : '');
      pill.style.borderColor = 'rgba(251,113,133,.5)';
      pill.style.color = '#fca5a5';
    }
  }

  function captureLiveControls(){
    const ids = ['g-qtr','g-down','g-dist','g-zone','g-score','g-pers','g-form','g-str','g-hash','g-tempo','g-star','g-phase'];
    const out = {};
    ids.forEach(id => {
      const node = document.getElementById(id);
      if(node) out[id] = node.value;
    });
    out.captured_at = nowIso();
    return out;
  }

  function captureAppState(){
    if(typeof ST === 'undefined') return {};
    return clone(ST);
  }

  function captureCloudPayload(){
    const savedAt = nowIso();
    return {
      schema_version: SCHEMA_VERSION,
      device_id: deviceId,
      saved_at: savedAt,
      app_state: captureAppState(),
      controls: captureLiveControls()
    };
  }

  function isFullPayload(state){
    return !!(state && typeof state === 'object' && state.app_state && typeof state.app_state === 'object');
  }

  function normalizeAppState(){
    if(typeof ST === 'undefined') return;
    if(!Array.isArray(ST.film)) ST.film = [];
    if(!Array.isArray(ST.live)) ST.live = [];
    if(!Array.isArray(ST.active)) ST.active = [];
    if(!Array.isArray(ST.customConcepts)) ST.customConcepts = [];
    if(!Array.isArray(ST.deletedConcepts)) ST.deletedConcepts = [];
    if(!Array.isArray(ST.customFormations)) ST.customFormations = [];
    if(!Array.isArray(ST.deletedFormations)) ST.deletedFormations = [];
    if(!Array.isArray(ST.activeFormations)) ST.activeFormations = [];
    if(!Array.isArray(ST.importTemplates)) ST.importTemplates = [];
    ST.star = { ...(ST.star || {}) };
    if(!Array.isArray(ST.star.touch)) ST.star.touch = [];
    ST.defense = { ...(ST.defense || {}) };
    ST.defense.personnel = { vs10:'', vs11:'', vs12:'', vsempty:'', ...(ST.defense.personnel || {}) };
    ST.defense.staff = { dc:'', lb:'', sec:'', qc:'', ...(ST.defense.staff || {}) };
    if(!Array.isArray(ST.defense.identity)) ST.defense.identity = [];
    if(!Array.isArray(ST.defense.weaknesses)) ST.defense.weaknesses = [];
  }

  function rebuildConceptList(){
    if(typeof CONCEPTS === 'undefined' || typeof DEFAULT_CONCEPTS === 'undefined' || typeof ST === 'undefined') return;
    CONCEPTS.length = 0;
    DEFAULT_CONCEPTS.forEach(c => CONCEPTS.push([...c]));
    (ST.customConcepts || []).forEach(c => {
      if(!c || !c.name) return;
      if(!CONCEPTS.some(x => String(x[0]).toLowerCase() === String(c.name).toLowerCase())) {
        CONCEPTS.push([c.name, c.type || 'Run']);
      }
    });
  }

  function applyLiveControls(live){
    if(!live || typeof live !== 'object') return;
    Object.entries(live).forEach(([id, value]) => {
      if(id === 'captured_at') return;
      const node = document.getElementById(id);
      if(node && value != null) node.value = value;
    });
    if(typeof syncSideline === 'function') syncSideline();
    if(typeof syncTouchBox === 'function') syncTouchBox();
    if(typeof runPredict === 'function') runPredict();
  }

  function applyFullPayload(payload, rowUpdatedAt){
    if(!isFullPayload(payload) || typeof ST === 'undefined') return;
    applyingRemote = true;
    try {
      const incoming = clone(payload.app_state);
      ST = { ...ST, ...incoming };
      ST.star = { ...(ST.star || {}), ...(incoming.star || {}) };
      ST.defense = { ...(ST.defense || {}), ...(incoming.defense || {}) };
      normalizeAppState();
      rebuildConceptList();

      // Keep an offline cache of exactly what was restored from Supabase.
      localStorage.setItem(LOCAL_STATE_KEY, JSON.stringify(ST));
      setLocalSyncTime(payload.saved_at || rowUpdatedAt || nowIso());

      if(typeof renderAll === 'function') renderAll();
      if(payload.controls) applyLiveControls(payload.controls);

      const opponentInput = document.getElementById('p-opp');
      const weekInput = document.getElementById('p-week');
      if(opponentInput) opponentInput.value = ST.opp === 'Opponent' ? '' : (ST.opp || '');
      if(weekInput) weekInput.value = ST.week || '';
    } finally {
      applyingRemote = false;
    }
  }

  async function getSession(){
    const client = getClient();
    if(!client) return null;
    const { data, error } = await client.auth.getSession();
    if(error) throw error;
    return data?.session || null;
  }

  async function pickTeam(client){
    const { data, error } = await client.from('teams').select('*').order('created_at', { ascending:false }).limit(1);
    if(error) throw error;
    return data && data[0] ? data[0] : null;
  }

  async function ensureGame(client){
    const { data, error } = await client
      .from('live_games').select('*')
      .eq('team_id', team.id).eq('status','active')
      .order('created_at', { ascending:false }).limit(1);
    if(error) throw error;
    if(data && data[0]) return data[0];

    const { data:newGame, error:iErr } = await client
      .from('live_games')
      .insert({ team_id:team.id, created_by:session.user.id, name:'Analyst Assist Coaching Workspace', status:'active' })
      .select('*').single();
    if(iErr) throw iErr;
    return newGame;
  }

  async function fetchCloudRow(client){
    const { data, error } = await client
      .from('live_game_state').select('*')
      .eq('game_id', game.id).maybeSingle();
    if(error) throw error;
    return data || null;
  }

  async function saveCloudNow(){
    const client = getClient();
    if(!client || !session || !team || !game || applyingRemote) return;

    const payload = captureCloudPayload();
    const { error } = await client
      .from('live_game_state')
      .upsert({
        game_id: game.id,
        team_id: team.id,
        state: payload,
        updated_by: session.user.id,
        updated_at: payload.saved_at
      }, { onConflict:'game_id' });

    if(error){
      setSyncStatus(false, 'save failed');
      console.warn('Full-state sync error:', error.message);
      return;
    }
    setLocalSyncTime(payload.saved_at);
    setSyncStatus(true, `${(ST.film||[]).length} film · ${(ST.live||[]).length} live`);
  }

  function queueSave(){
    if(applyingRemote || !initialized) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveCloudNow, 650);
  }

  function flushSave(){
    if(applyingRemote || !initialized) return Promise.resolve();
    clearTimeout(saveTimer);
    saveTimer = null;
    return saveCloudNow();
  }

  function markLocalUpdated(){
    if(applyingRemote) return;
    setLocalSyncTime(nowIso());
  }

  function patchSaveFunctions(){
    ['saveState','silentSave'].forEach(name => {
      const orig = window[name];
      if(!orig || orig.__aaFullSynced) return;
      window[name] = function(){
        markLocalUpdated();
        const out = orig.apply(this, arguments);
        queueSave();
        return out;
      };
      window[name].__aaFullSynced = true;
      try { eval(name + ' = window.' + name); } catch(e){}
    });
  }

  async function loadOrCreateCloudState(client){
    const row = await fetchCloudRow(client);
    const remote = row?.state || null;
    const remoteTime = Date.parse(remote?.saved_at || row?.updated_at || '') || 0;
    const localTime = getLocalSyncTime();

    if(!row || !remote){
      await saveCloudNow();
      return;
    }

    // Upgrade from the old controls-only sync. If this device has the actual film/live
    // library, migrate it into Supabase instead of replacing it with a tiny legacy payload.
    if(!isFullPayload(remote)){
      if(hasMeaningfulLocalData()){
        await saveCloudNow();
      } else {
        applyLiveControls(remote);
        setSyncStatus(true, 'legacy controls loaded');
      }
      return;
    }

    // Fresh/new computer: cloud wins. Existing computer with a newer unsynced cache: local wins.
    if(!hasLocalState() || localTime === 0 || remoteTime >= localTime){
      applyFullPayload(remote, row.updated_at);
    } else {
      await saveCloudNow();
    }
  }

  function subscribe(client){
    if(channel) client.removeChannel(channel);
    channel = client.channel('aa-full-game-state-' + game.id)
      .on('postgres_changes', {
        event:'*', schema:'public', table:'live_game_state', filter:'game_id=eq.' + game.id
      }, payload => {
        const row = payload.new;
        const incoming = row?.state;
        if(!incoming) return;
        if(incoming.device_id && incoming.device_id === deviceId) return;

        if(isFullPayload(incoming)){
          const remoteTime = Date.parse(incoming.saved_at || row?.updated_at || '') || 0;
          const localTime = getLocalSyncTime();
          if(remoteTime >= localTime) applyFullPayload(incoming, row?.updated_at);
        } else {
          applyingRemote = true;
          try { applyLiveControls(incoming); }
          finally { applyingRemote = false; }
        }
      })
      .subscribe(state => {
        if(state === 'SUBSCRIBED') setSyncStatus(true, `${(ST.film||[]).length} film · ${(ST.live||[]).length} live`);
        if(state === 'CHANNEL_ERROR' || state === 'CLOSED') setSyncStatus(false);
      });
  }

  document.addEventListener('change', e => {
    if(e.target && /^g-/.test(e.target.id || '')){
      markLocalUpdated();
      queueSave();
    }
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
      initialized = true;
      patchSaveFunctions();
      await loadOrCreateCloudState(client);
      subscribe(client);
      setSyncStatus(true, `${(ST.film||[]).length} film · ${(ST.live||[]).length} live`);
    } catch(e){
      console.warn('Analyst Assist full cloud sync failed:', e);
      initialized = false;
      setSyncStatus(false);
    }
  }

  window.setSyncStatus = setSyncStatus;
  window.queueFullStateCloudSave = queueSave;
  window.flushFullStateCloudSave = flushSave;
  window.aaFullCloudSyncReady = () => initialized;

  window.addEventListener('online', () => initialized ? queueSave() : init());
  window.addEventListener('beforeunload', () => { if(initialized && !applyingRemote) saveCloudNow(); });
  window.addEventListener('load', () => {
    setSyncStatus(false);
    setTimeout(init, 400);
  });
})();
