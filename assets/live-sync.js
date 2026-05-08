let liveTeam = null;
let liveGame = null;
let liveState = null;
let liveRows = [];
let liveChannel = null;
let gameView = localStorage.getItem('dpp_game_view') || 'sideline';
const distLabel = {short:'1-3', normal:'4-6', long:'7-10', xlong:'11+'};
const zoneLabel = {own:'Own side', mid:'Midfield', hrz:'High red zone', rz:'Red zone', gl:'Goal line'};

function liveEl(id){ return document.getElementById(id); }
function liveMsg(msg, type='notice'){
  const el = liveEl('liveStatus');
  if(!el) return;
  el.className = type === 'error' ? 'notice error-notice' : 'notice';
  el.textContent = msg;
}
function setGameView(view){
  gameView = view;
  localStorage.setItem('dpp_game_view', view);
  document.body.classList.toggle('sideline-view', view === 'sideline');
  document.body.classList.toggle('box-view', view === 'box');
  liveEl('boxModeBtn')?.classList.toggle('primary', view === 'box');
  liveEl('sidelineModeBtn')?.classList.toggle('primary', view === 'sideline');
  liveEl('modeHelp').innerHTML = view === 'sideline'
    ? '<b>Sideline Mode:</b> built for the coach calling the defense. Tap Run, Pass, RPO, or Screen. Update down and distance only when needed. No explanations, no clutter.'
    : '<b>Box Mode:</b> built for the coach upstairs. Update situation details and chart the play family. The sideline iPad refreshes automatically.';
}
async function initLiveMode(){
  setGameView(gameView);
  const session = await requireAuth();
  if(!session) return;
  if(!sb){ liveMsg('Site setup issue. Supabase is not connected.', 'error'); return; }
  liveMsg('Loading your live game workspace...');
  const {data:teams,error:teamErr} = await sb.from('teams').select('*').order('created_at',{ascending:false}).limit(1);
  if(teamErr){ liveMsg('Could not load teams. Run the Supabase schema if you have not yet.', 'error'); return; }
  if(!teams || !teams.length){ liveMsg('Create a team on the dashboard first, then return to Game Mode.', 'error'); return; }
  liveTeam = teams[0];
  await ensureLiveGame(session.user.id);
  await loadLiveData();
  subscribeLive();
  liveMsg('Live sync is on. Open this page on another device and changes will update there too.');
}
async function ensureLiveGame(userId){
  const {data,error} = await sb.from('live_games').select('*').eq('team_id', liveTeam.id).eq('status','active').order('created_at',{ascending:false}).limit(1);
  if(error){ liveMsg('Live Game tables are missing. Run the new live sync SQL in Supabase.', 'error'); throw error; }
  if(data && data.length){ liveGame = data[0]; return; }
  const {data:newGame,error:insErr} = await sb.from('live_games').insert({team_id:liveTeam.id, created_by:userId, name:'Friday Night Live'}).select('*').single();
  if(insErr){ liveMsg('Could not create live game. Run the live sync SQL in Supabase.', 'error'); throw insErr; }
  liveGame = newGame;
  const defaultState = defaultLiveState();
  await sb.from('live_game_state').insert({game_id:liveGame.id, team_id:liveTeam.id, state:defaultState, updated_by:userId});
}
function defaultLiveState(){
  return {down:'1', distance:'normal', zone:'mid', hash:'mid', personnel:'11', formation:'3x1', tempo:'normal', score:'close', drive:1, play_number:1, updated_at:new Date().toISOString()};
}
async function loadLiveData(){
  const {data:stateRows,error:stateErr} = await sb.from('live_game_state').select('*').eq('game_id',liveGame.id).order('updated_at',{ascending:false}).limit(1);
  if(stateErr){ liveMsg('Could not load live state.', 'error'); return; }
  liveState = stateRows && stateRows[0] ? stateRows[0].state : defaultLiveState();
  const {data:logs} = await sb.from('live_play_log').select('*').eq('game_id',liveGame.id).order('created_at',{ascending:false}).limit(12);
  liveRows = logs || [];
  renderLive();
}
function subscribeLive(){
  if(liveChannel) sb.removeChannel(liveChannel);
  liveChannel = sb.channel('dpp-live-game-' + liveGame.id)
    .on('postgres_changes',{event:'*',schema:'public',table:'live_game_state',filter:'game_id=eq.' + liveGame.id}, payload => {
      liveState = payload.new.state;
      renderLive(true);
    })
    .on('postgres_changes',{event:'*',schema:'public',table:'live_play_log',filter:'game_id=eq.' + liveGame.id}, async () => {
      await loadLiveData();
    })
    .subscribe(status => {
      const dot = liveEl('syncDot');
      if(dot) dot.classList.toggle('on', status === 'SUBSCRIBED');
      if(liveEl('syncLabel')) liveEl('syncLabel').textContent = status === 'SUBSCRIBED' ? 'Live sync on' : 'Connecting...';
    });
}
function renderLive(flash=false){
  if(!liveState) return;
  const down = liveState.down || '1';
  const distance = liveState.distance || 'normal';
  const zone = liveState.zone || 'mid';
  const situation = `${ordinal(down)} & ${distLabel[distance] || distance}`;
  if(liveEl('situationBig')) liveEl('situationBig').textContent = situation;
  if(liveEl('situationSub')) liveEl('situationSub').textContent = `${zoneLabel[zone] || zone} · ${liveState.formation || 'formation'} · ${liveState.personnel || '11'} personnel`;
  if(liveEl('gameMeta')) liveEl('gameMeta').textContent = `${liveTeam?.name || 'Team'} · Drive ${liveState.drive || 1} · Play ${liveState.play_number || 1}`;
  ['Down','Distance','Zone','Hash','Personnel','Formation','Tempo','Score'].forEach(k=>{
    const el = liveEl('live'+k); if(el) el.value = liveState[k.toLowerCase()] || el.value;
  });
  const prediction = calculateQuickPrediction();
  liveEl('runPct').textContent = prediction.Run + '%';
  liveEl('passPct').textContent = prediction.Pass + '%';
  liveEl('rpoPct').textContent = prediction.RPO + '%';
  liveEl('screenPct').textContent = prediction.Screen + '%';
  liveEl('topPlays').innerHTML = prediction.top.map((p,i)=>`<div class="top-play"><span>#${i+1}</span><b>${p.name}</b><em>${p.pct}%</em></div>`).join('');
  renderLog();
  if(flash){
    document.body.classList.add('live-flash');
    setTimeout(()=>document.body.classList.remove('live-flash'),600);
  }
}
function renderLog(){
  const el = liveEl('liveLog'); if(!el) return;
  if(!liveRows.length){ el.innerHTML = '<div class="empty">No live plays yet.</div>'; return; }
  el.innerHTML = liveRows.map(r=>`<div class="timeline-item"><span class="dot"></span><div><b>${ordinal(r.down)} & ${distLabel[r.distance] || r.distance}</b><div class="muted small">${r.play_family} · ${zoneLabel[r.zone] || r.zone}</div></div><span class="chip ${familyClass(r.play_family)}">${r.play_family}</span></div>`).join('');
}
function calculateQuickPrediction(){
  const base = {Run:34, Pass:39, RPO:15, Screen:12};
  const d = liveState?.down || '1';
  const dist = liveState?.distance || 'normal';
  const form = liveState?.formation || '';
  const zone = liveState?.zone || 'mid';
  if(d === '3' || dist === 'long' || dist === 'xlong'){ base.Pass += 16; base.Run -= 10; base.Screen += 4; }
  if(dist === 'short'){ base.Run += 14; base.Pass -= 8; base.RPO += 3; }
  if(zone === 'rz' || zone === 'gl'){ base.Run += 6; base.RPO += 5; base.Pass -= 4; }
  if(['trips','3x1','empty'].includes(form)){ base.Pass += 7; base.Screen += 3; base.Run -= 5; }
  liveRows.slice(0,5).forEach(r=>{ if(base[r.play_family] !== undefined) base[r.play_family] += 3; });
  Object.keys(base).forEach(k=>{ base[k] = Math.max(5, base[k]); });
  const total = Object.values(base).reduce((a,b)=>a+b,0);
  const out = {};
  Object.keys(base).forEach(k=> out[k]=Math.round(base[k]/total*100));
  const topNames = pickTopPlays(out);
  return {...out, top:topNames};
}
function pickTopPlays(p){
  const form = liveState?.formation || '3x1';
  const dist = liveState?.distance || 'normal';
  const pool = [];
  pool.push({name:'Inside Zone', pct:Math.max(12,p.Run-9)});
  pool.push({name: form === 'trips' || form === '3x1' ? 'Quick Game / Stick' : 'Medium Pass', pct:Math.max(14,p.Pass-10)});
  pool.push({name:'Screen', pct:Math.max(8,p.Screen)});
  pool.push({name: dist === 'short' ? 'Power / Duo' : 'RPO Glance', pct:Math.max(9,p.RPO)});
  return pool.sort((a,b)=>b.pct-a.pct).slice(0,4);
}
async function saveLiveState(){
  if(!liveGame || !sb) return;
  liveState = {
    ...(liveState || defaultLiveState()),
    down:liveEl('liveDown')?.value || liveState.down,
    distance:liveEl('liveDistance')?.value || liveState.distance,
    zone:liveEl('liveZone')?.value || liveState.zone,
    hash:liveEl('liveHash')?.value || liveState.hash,
    personnel:liveEl('livePersonnel')?.value || liveState.personnel,
    formation:liveEl('liveFormation')?.value || liveState.formation,
    tempo:liveEl('liveTempo')?.value || liveState.tempo,
    score:liveEl('liveScore')?.value || liveState.score,
    updated_at:new Date().toISOString()
  };
  const session = await getSession();
  const {error} = await sb.from('live_game_state').upsert({game_id:liveGame.id, team_id:liveTeam.id, state:liveState, updated_by:session?.user?.id, updated_at:new Date().toISOString()},{onConflict:'game_id'});
  if(error) liveMsg('Could not save live update: '+error.message,'error');
  renderLive();
}
async function quickLog(family){
  if(!liveGame) return;
  const row = {game_id:liveGame.id, team_id:liveTeam.id, play_family:family, down:liveState.down, distance:liveState.distance, zone:liveState.zone, formation:liveState.formation, state_snapshot:liveState};
  const {error} = await sb.from('live_play_log').insert(row);
  if(error){ liveMsg('Could not log play: '+error.message,'error'); return; }
  await bumpDrive();
}
async function setDown(d){ liveState.down = String(d); await saveLiveState(); }
async function setDistance(d){ liveState.distance = d; await saveLiveState(); }
async function bumpDrive(){
  const current = parseInt(liveState.down || '1',10);
  liveState.down = String(Math.min(4, current + 1));
  liveState.play_number = (liveState.play_number || 1) + 1;
  await saveLiveState();
}
async function newDrive(){
  liveState = {...(liveState || defaultLiveState()), down:'1', distance:'normal', zone:'mid', drive:(liveState.drive || 1)+1, play_number:1};
  await saveLiveState();
}
function ordinal(d){ return ({'1':'1st','2':'2nd','3':'3rd','4':'4th'}[String(d)] || d); }
function familyClass(f){ return String(f).toLowerCase(); }
document.addEventListener('DOMContentLoaded', initLiveMode);
