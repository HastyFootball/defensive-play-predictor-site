(function(){
'use strict';

const STORE_KEY='aa_playbook_v1';
const CLOUD_TABLE='team_playbook_plays';
const $=id=>document.getElementById(id);
const clone=v=>JSON.parse(JSON.stringify(v));
const uid=()=>window.crypto?.randomUUID?window.crypto.randomUUID():'pb-'+Date.now()+'-'+Math.random().toString(16).slice(2);
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const nowIso=()=>new Date().toISOString();
const FIELD_W=560,FIELD_H=1000;
const localTime=iso=>{try{return new Date(iso).toLocaleTimeString([],{hour:'numeric',minute:'2-digit',second:'2-digit'});}catch(_){return'';}};

const state={plays:[],currentId:null,selectedPlayerId:null,selectedPlayerIds:[],selectedShapeId:null,clipboard:null,tool:'select',history:[],future:[],drawStart:null,drag:null,cloud:{team:null,session:null,channel:null,ready:false,timer:null,lastSavedAt:null,saving:false,error:null}};

const OFFENSE_TEMPLATES={
  '2x2':[
    ['X','WR',52,10],['H','WR',52,31],['Y','WR',52,69],['Z','WR',52,90],['LT','OL',53,40],['LG','OL',53,45],['C','OL',53,50],['RG','OL',53,55],['RT','OL',53,60],['QB','QB',61,50],['RB','RB',69,50]
  ],
  trips:[
    ['X','WR',52,12],['Y','WR',52,68],['H','WR',52,80],['Z','WR',52,91],['LT','OL',53,40],['LG','OL',53,45],['C','OL',53,50],['RG','OL',53,55],['RT','OL',53,60],['QB','QB',61,50],['RB','RB',69,44]
  ],
  bunch:[
    ['X','WR',52,12],['Y','WR',52,75],['H','WR',54,82],['Z','WR',51,88],['LT','OL',53,40],['LG','OL',53,45],['C','OL',53,50],['RG','OL',53,55],['RT','OL',53,60],['QB','QB',61,50],['RB','RB',69,44]
  ],
  empty:[
    ['X','WR',52,8],['H','WR',52,28],['Y','WR',52,41],['F','WR',52,72],['Z','WR',52,92],['LT','OL',53,44],['LG','OL',53,47],['C','OL',53,50],['RG','OL',53,53],['RT','OL',53,56],['QB','QB',61,50]
  ],
  ace:[
    ['X','WR',52,12],['TE','TE',53,36],['Y','TE',53,64],['Z','WR',52,88],['LT','OL',53,40],['LG','OL',53,45],['C','OL',53,50],['RG','OL',53,55],['RT','OL',53,60],['QB','QB',61,50],['RB','RB',70,50]
  ]
};

const DEFENSE_TEMPLATES={
  '425':[
    ['DE','DE',47,34],['DT','DT',47,45],['NT','DT',47,55],['DE','DE',47,66],['W','LB',40,39],['M','LB',40,61],['N','NB',35,18],['CB','CB',35,6],['CB','CB',35,94],['FS','S',27,42],['SS','S',27,67]
  ],
  '43':[
    ['DE','DE',47,34],['DT','DT',47,45],['DT','DT',47,55],['DE','DE',47,66],['W','LB',39,35],['M','LB',39,50],['S','LB',39,65],['CB','CB',33,8],['CB','CB',33,92],['FS','S',26,40],['SS','S',26,65]
  ],
  '33':[
    ['DE','DL',47,38],['N','DL',47,50],['DE','DL',47,62],['W','LB',39,34],['M','LB',39,50],['S','LB',39,66],['N','NB',34,18],['CB','CB',32,7],['CB','CB',32,93],['FS','S',25,42],['SS','S',25,67]
  ],
  odd:[
    ['E','DL',47,35],['N','NT',47,50],['E','DL',47,65],['J','EDGE',41,25],['W','LB',38,40],['M','LB',38,58],['S','EDGE',41,75],['CB','CB',32,7],['CB','CB',32,93],['FS','S',24,42],['SS','S',24,67]
  ]
};

function player(side,label,role,x,y){return{id:uid(),side,label,role,x,y,assignment:'',symbol:'auto'};}
function makeTemplatePlayers(rows,side){return rows.map(r=>player(side,r[0],r[1],r[2],r[3]));}
function blankPlay(){
  return{id:uid(),name:'New Matchup Plan',kind:'matchup',opponent:'',tags:[],opponentConcept:'',ourCall:'',coachingPoints:'',practice:false,players:[...makeTemplatePlayers(OFFENSE_TEMPLATES['2x2'],'offense'),...makeTemplatePlayers(DEFENSE_TEMPLATES['425'],'defense')],shapes:[],createdAt:nowIso(),updatedAt:nowIso()};
}
function current(){return state.plays.find(p=>p.id===state.currentId)||null;}
function normalizePlay(p){
  p={...p};p.id=p.id||uid();p.name=p.name||'Untitled Play';p.kind=['offense','defense','matchup'].includes(p.kind)?p.kind:'matchup';p.tags=Array.isArray(p.tags)?p.tags:String(p.tags||'').split(',').map(s=>s.trim()).filter(Boolean);p.players=Array.isArray(p.players)?p.players.map(x=>({...x,symbol:x.symbol||'auto'})):[];p.shapes=Array.isArray(p.shapes)?p.shapes.map(x=>({...x,lineStyle:x.lineStyle||((x.type==='motion')?'dashed':'solid'),width:x.width||({route:4,motion:4,block:7,stunt:5,zone:3}[x.type]||4),endpoint:x.endpoint||((x.type==='block')?'bar':(x.type==='zone'||x.type==='text')?'none':'arrow'),zonePattern:x.zonePattern||'diagonal'})):[];p.coachingPoints=p.coachingPoints||'';p.practice=!!p.practice;p.createdAt=p.createdAt||nowIso();p.updatedAt=p.updatedAt||p.createdAt;return p;
}
function loadLocal(){
  try{const raw=localStorage.getItem(STORE_KEY);if(raw){const parsed=JSON.parse(raw);state.plays=(parsed.plays||[]).map(normalizePlay);state.currentId=parsed.currentId||state.plays[0]?.id||null;}}
  catch(e){console.warn('Playbook load failed',e)}
  if(!state.plays.length){const p=blankPlay();state.plays=[p];state.currentId=p.id;persistLocal();}
}
function persistLocal(){try{localStorage.setItem(STORE_KEY,JSON.stringify({version:1,plays:state.plays,currentId:state.currentId,updatedAt:nowIso()}));}catch(e){console.warn('Playbook local save failed',e)}}
function markChanged(queueCloud=true){const p=current();if(!p)return;p.updatedAt=nowIso();persistLocal();if(queueCloud)queueCloudSave();renderLibrary();}
function toast(msg){const el=$('toast');if(!el)return;el.textContent=msg;el.classList.add('show');clearTimeout(el._timer);el._timer=setTimeout(()=>el.classList.remove('show'),1800)}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}

function snapshot(){const p=current();if(!p)return;state.history.push(clone(p));if(state.history.length>50)state.history.shift();state.future=[];}
function undo(){const p=current();if(!p||!state.history.length)return;state.future.push(clone(p));const prev=state.history.pop();const i=state.plays.findIndex(x=>x.id===p.id);state.plays[i]=prev;state.selectedPlayerId=null;state.selectedShapeId=null;markChanged();renderAll();}
function redo(){const p=current();if(!p||!state.future.length)return;state.history.push(clone(p));const next=state.future.pop();const i=state.plays.findIndex(x=>x.id===p.id);state.plays[i]=next;state.selectedPlayerId=null;state.selectedShapeId=null;markChanged();renderAll();}

function setTool(tool){state.tool=tool;state.selectedShapeId=null;document.querySelectorAll('.tool').forEach(b=>b.classList.toggle('active',b.dataset.tool===tool));const names={select:'Select / Move',erase:'Erase',addOffense:'Add Offense Player',addDefense:'Add Defense Player',route:'Draw Route',motion:'Draw Motion',block:'Draw Block',stunt:'Draw Blitz / Stunt',zone:'Draw Coverage Zone',text:'Add Text'};$('currentToolLabel').textContent=names[tool]||tool;renderShapes();}

function renderAll(){renderMeta();renderPlayers();renderShapes();renderInspector();renderLibrary();}
function renderMeta(){const p=current();if(!p)return;$('playName').value=p.name;$('playKind').value=p.kind;$('playOpponent').value=p.opponent||'';$('playTags').value=(p.tags||[]).join(', ');$('opponentConcept').value=p.opponentConcept||'';$('ourCall').value=p.ourCall||'';$('coachingPoints').value=p.coachingPoints||'';$('practiceSetToggle').checked=!!p.practice;$('matchupFields').classList.toggle('hidden',p.kind!=='matchup');}
function effectiveSymbol(pl){if(pl.symbol&&pl.symbol!=='auto')return pl.symbol;if(pl.side==='offense'&&['OL','C','G','T'].some(k=>String(pl.role||'').toUpperCase().includes(k)))return 'x';return pl.side==='defense'?'square':'circle';}
function renderPlayers(){const layer=$('playerLayer'),p=current();if(!layer||!p)return;layer.innerHTML='';p.players.forEach(pl=>{const sym=effectiveSymbol(pl),multi=state.selectedPlayerIds.includes(pl.id);const el=document.createElement('div');el.className=`player ${pl.side} symbol-${sym}${pl.id===state.selectedPlayerId?' selected':''}${multi?' multi-selected':''}`;el.dataset.playerId=pl.id;el.style.left=pl.x+'%';el.style.top=pl.y+'%';el.textContent=sym==='x'?'×':(pl.label||'?');el.title=[pl.label,pl.role,pl.assignment].filter(Boolean).join(' — ');el.addEventListener('pointerdown',playerPointerDown);layer.appendChild(el);});}
function shapeSvg(s){const selected=s.id===state.selectedShapeId?' shape-selected':'';const x1=s.x1*(FIELD_W/100),y1=s.y1*(FIELD_H/100),x2=s.x2*(FIELD_W/100),y2=s.y2*(FIELD_H/100);const data=`data-shape-id="${esc(s.id)}"`;const width=Number(s.width)||4;const dash=s.lineStyle==='dotted'?'2 9':s.lineStyle==='dashed'?'10 7':'';
  if(s.type==='zone'){const x=Math.min(x1,x2),y=Math.min(y1,y2),w=Math.abs(x2-x1),h=Math.abs(y2-y1),pat=s.zonePattern||'diagonal';return`<rect ${data} class="shape-hit${selected}" x="${x}" y="${y}" width="${w}" height="${h}" rx="18" fill="url(#zone-${pat})" stroke="#fff" stroke-width="${width}" ${dash?`stroke-dasharray="${dash}"`:''}/>`;}
  if(s.type==='text')return`<text ${data} class="shape-hit${selected}" x="${x1}" y="${y1}" fill="#fff" font-size="24" font-weight="800">${esc(s.text||'Note')}</text>`;
  const color={route:'#fff',motion:'#f1c94a',block:'#111',stunt:'#9ed2ff'}[s.type]||'#fff';let endpoint=s.endpoint||((s.type==='block')?'bar':'arrow');let marker=endpoint==='arrow'?` marker-end="url(#arrowWhite)"`:endpoint==='dot'?` marker-end="url(#endDot)"`:endpoint==='bar'?` marker-end="url(#endBar)"`:'';return`<line ${data} class="shape-hit${selected}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" color="${color}" stroke-width="${width}" stroke-linecap="round" ${dash?`stroke-dasharray="${dash}"`:''}${marker}/>`;
}
function renderShapes(){const p=current();if(!p)return;$('savedShapes').innerHTML=p.shapes.map(shapeSvg).join('');$('savedShapes').querySelectorAll('[data-shape-id]').forEach(el=>el.addEventListener('pointerdown',shapePointerDown));}
function renderDraft(s){$('draftShape').innerHTML=s?shapeSvg({...s,id:'draft'}):'';}
function renderInspector(){const p=current();if(!p)return;const pl=p.players.find(x=>x.id===state.selectedPlayerId);$('noPlayerSelected').classList.toggle('hidden',!!pl);$('playerInspector').classList.toggle('hidden',!pl);if(pl){$('playerLabel').value=pl.label||'';$('playerRole').value=pl.role||'';$('playerAssignment').value=pl.assignment||'';$('playerSymbol').value=pl.symbol||'auto';}const sh=p.shapes.find(x=>x.id===state.selectedShapeId);$('noShapeSelected').classList.toggle('hidden',!!sh);$('shapeInspector').classList.toggle('hidden',!sh);if(sh){$('shapeLineStyle').value=sh.lineStyle||'solid';$('shapeWidth').value=String(sh.width||4);$('shapeEndpoint').value=sh.endpoint||'none';$('zonePattern').value=sh.zonePattern||'diagonal';$('zonePatternWrap').classList.toggle('hidden',sh.type!=='zone');$('shapeEndpoint').closest('label').classList.toggle('hidden',sh.type==='zone'||sh.type==='text');}const assigned=p.players.filter(x=>x.assignment||x.role);$('responsibilityList').innerHTML=assigned.length?assigned.map(x=>`<div class="resp-row" data-select-player="${esc(x.id)}"><b>${esc(x.label||'?')} · ${esc(x.role||'Role')}</b><span>${esc(x.assignment||'No assignment entered yet.')}</span></div>`).join(''):'<div class="empty-copy">Assignments appear here as you add them.</div>';$('responsibilityList').querySelectorAll('[data-select-player]').forEach(el=>el.onclick=()=>{state.selectedPlayerId=el.dataset.selectPlayer;renderPlayers();renderInspector();});}
function renderLibrary(){const q=$('librarySearch')?.value.toLowerCase().trim()||'',filter=$('libraryFilter')?.value||'all';const list=state.plays.filter(p=>{if(filter!=='all'&&p.kind!==filter)return false;const hay=[p.name,p.opponent,(p.tags||[]).join(' '),p.opponentConcept,p.ourCall].join(' ').toLowerCase();return !q||hay.includes(q)});$('playLibrary').innerHTML=list.length?list.sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt))).map(p=>`<div class="library-card ${p.id===state.currentId?'active':''}" data-play-id="${p.id}"><div class="library-card-top"><strong>${esc(p.name)}</strong><span><input class="practice-check" type="checkbox" data-practice-id="${p.id}" ${p.practice?'checked':''} title="Practice set"> <button class="icon-btn" data-delete-id="${p.id}" title="Delete">×</button></span></div><small>${esc(p.kind==='matchup'?'Matchup plan':p.kind==='offense'?'Offensive concept':'Defensive call')}${p.opponent?' · '+esc(p.opponent):''}</small><div class="library-badges">${(p.tags||[]).slice(0,4).map(t=>`<span class="badge">${esc(t)}</span>`).join('')}</div></div>`).join(''):'<div class="empty-copy">No plays match this filter.</div>';$('playLibrary').querySelectorAll('[data-play-id]').forEach(el=>el.addEventListener('click',e=>{if(e.target.closest('button,input'))return;selectPlay(el.dataset.playId)}));$('playLibrary').querySelectorAll('[data-delete-id]').forEach(el=>el.onclick=e=>{e.stopPropagation();deletePlay(el.dataset.deleteId)});$('playLibrary').querySelectorAll('[data-practice-id]').forEach(el=>el.onchange=e=>{e.stopPropagation();const p=state.plays.find(x=>x.id===el.dataset.practiceId);if(p){p.practice=el.checked;p.updatedAt=nowIso();persistLocal();queueCloudSave(p);if(p.id===state.currentId)$('practiceSetToggle').checked=p.practice;}});}

function selectPlay(id){if(!state.plays.some(p=>p.id===id))return;state.currentId=id;state.selectedPlayerId=null;state.selectedShapeId=null;state.history=[];state.future=[];persistLocal();setTool('select');renderAll();toast('Play opened — drag any player to move them');}
function newPlay(){const p=blankPlay();state.plays.unshift(p);state.currentId=p.id;state.history=[];state.future=[];persistLocal();renderAll();queueCloudSave(p);toast('New matchup plan created');}
function duplicatePlay(){const p=current();if(!p)return;const c=clone(p);c.id=uid();c.name=p.name+' — Copy';c.createdAt=c.updatedAt=nowIso();c.practice=false;state.plays.unshift(c);state.currentId=c.id;persistLocal();renderAll();queueCloudSave(c);toast('Play duplicated');}
async function deletePlay(id){const p=state.plays.find(x=>x.id===id);if(!p||!confirm(`Delete “${p.name}”?`))return;state.plays=state.plays.filter(x=>x.id!==id);if(!state.plays.length)state.plays=[blankPlay()];if(state.currentId===id)state.currentId=state.plays[0].id;persistLocal();renderAll();await cloudDelete(id);toast('Play deleted');}

function fieldPoint(ev){const r=$('footballField').getBoundingClientRect();return{x:clamp((ev.clientX-r.left)/r.width*100,1,99),y:clamp((ev.clientY-r.top)/r.height*100,2,98)};}
function playerPointerDown(ev){ev.stopPropagation();const id=ev.currentTarget.dataset.playerId,p=current();if(state.tool==='erase'){snapshot();p.players=p.players.filter(x=>x.id!==id);state.selectedPlayerId=null;state.selectedPlayerIds=[];markChanged();renderAll();return;}if(state.tool!=='select')return;if(ev.shiftKey){if(state.selectedPlayerIds.includes(id))state.selectedPlayerIds=state.selectedPlayerIds.filter(x=>x!==id);else state.selectedPlayerIds.push(id);state.selectedPlayerId=id;renderPlayers();renderInspector();return;}if(!state.selectedPlayerIds.includes(id))state.selectedPlayerIds=[id];state.selectedPlayerId=id;snapshot();const pt=fieldPoint(ev);const originals={};state.selectedPlayerIds.forEach(pid=>{const pl=p.players.find(x=>x.id===pid);if(pl)originals[pid]={x:pl.x,y:pl.y};});state.drag={id,start:pt,originals};renderPlayers();renderInspector();}
function shapePointerDown(ev){ev.stopPropagation();const id=ev.currentTarget.dataset.shapeId;if(state.tool==='erase'){const p=current();snapshot();p.shapes=p.shapes.filter(s=>s.id!==id);state.selectedShapeId=null;markChanged();renderShapes();return;}state.selectedShapeId=id;state.selectedPlayerId=null;renderShapes();renderPlayers();renderInspector();}
function fieldPointerDown(ev){if(ev.button!==0)return;const p=current(),pt=fieldPoint(ev);if(['addOffense','addDefense'].includes(state.tool)){snapshot();const side=state.tool==='addOffense'?'offense':'defense';p.players.push(player(side,side==='offense'?'O':'D','',pt.x,pt.y));state.selectedPlayerId=p.players[p.players.length-1].id;markChanged();renderAll();return;}if(state.tool==='text'){const text=prompt('Text label:','Coaching point');if(text){snapshot();p.shapes.push({id:uid(),type:'text',x1:pt.x,y1:pt.y,x2:pt.x,y2:pt.y,text});markChanged();renderShapes();}return;}if(['route','motion','block','stunt','zone'].includes(state.tool)){state.drawStart={type:state.tool,...pt};renderDraft({type:state.tool,x1:pt.x,y1:pt.y,x2:pt.x,y2:pt.y});return;}if(state.tool==='select'){state.selectedPlayerId=null;state.selectedShapeId=null;renderPlayers();renderShapes();renderInspector();}}
function fieldPointerMove(ev){if(state.drag){const p=current(),pt=fieldPoint(ev),dx=pt.x-state.drag.start.x,dy=pt.y-state.drag.start.y;Object.entries(state.drag.originals||{}).forEach(([id,o])=>{const pl=p.players.find(x=>x.id===id);if(pl){pl.x=clamp(o.x+dx,0,100);pl.y=clamp(o.y+dy,0,100);}});renderPlayers();return;}if(state.drawStart){const pt=fieldPoint(ev);renderDraft({type:state.drawStart.type,x1:state.drawStart.x,y1:state.drawStart.y,x2:pt.x,y2:pt.y});}}
function fieldPointerUp(ev){if(state.drag){state.drag=null;markChanged();renderAll();return;}if(state.drawStart){const p=current(),pt=fieldPoint(ev),d=state.drawStart;state.drawStart=null;renderDraft(null);const dist=Math.hypot(pt.x-d.x,pt.y-d.y);if(dist<1.5)return;snapshot();p.shapes.push({id:uid(),type:d.type,x1:d.x,y1:d.y,x2:pt.x,y2:pt.y,lineStyle:d.type==='motion'?'dashed':'solid',width:{route:4,motion:4,block:7,stunt:5,zone:3}[d.type]||4,endpoint:d.type==='block'?'bar':d.type==='zone'?'none':'arrow',zonePattern:'diagonal'});markChanged();renderShapes();}}

function applyTemplate(name){const p=current();if(!p)return;const isOff=!!OFFENSE_TEMPLATES[name],rows=OFFENSE_TEMPLATES[name]||DEFENSE_TEMPLATES[name];if(!rows)return;if(p.shapes.length&&!confirm('Applying a formation template will clear existing drawn lines so they do not point to old player locations. Continue?'))return;snapshot();p.players=p.players.filter(x=>x.side!==(isOff?'offense':'defense'));p.players.push(...makeTemplatePlayers(rows,isOff?'offense':'defense'));p.shapes=[];state.selectedPlayerId=null;markChanged();renderAll();toast(`${name.toUpperCase()} template applied`);}
function flipPlay(){const p=current();if(!p)return;snapshot();p.players.forEach(x=>x.x=100-x.x);p.shapes.forEach(s=>{s.x1=100-s.x1;s.x2=100-s.x2});markChanged();renderAll();toast('Play flipped left/right');}

function updateMeta(){const p=current();if(!p)return;p.name=$('playName').value.trim()||'Untitled Play';p.kind=$('playKind').value;p.opponent=$('playOpponent').value.trim();p.tags=$('playTags').value.split(',').map(s=>s.trim()).filter(Boolean);p.opponentConcept=$('opponentConcept').value.trim();p.ourCall=$('ourCall').value.trim();p.coachingPoints=$('coachingPoints').value;p.practice=$('practiceSetToggle').checked;$('matchupFields').classList.toggle('hidden',p.kind!=='matchup');markChanged();}
function updatePlayer(){const p=current(),pl=p?.players.find(x=>x.id===state.selectedPlayerId);if(!pl)return;pl.label=$('playerLabel').value.trim()||'?';pl.role=$('playerRole').value.trim();pl.assignment=$('playerAssignment').value;pl.symbol=$('playerSymbol').value;markChanged();renderPlayers();renderInspector();}
function deleteSelectedPlayer(){const p=current();if(!p||!state.selectedPlayerId)return;snapshot();p.players=p.players.filter(x=>x.id!==state.selectedPlayerId);state.selectedPlayerId=null;markChanged();renderAll();}
function updateShape(){const p=current(),sh=p?.shapes.find(x=>x.id===state.selectedShapeId);if(!sh)return;sh.lineStyle=$('shapeLineStyle').value;sh.width=Number($('shapeWidth').value);sh.endpoint=$('shapeEndpoint').value;sh.zonePattern=$('zonePattern').value;markChanged();renderShapes();}
function deleteSelectedShape(){const p=current();if(!p||!state.selectedShapeId)return;snapshot();p.shapes=p.shapes.filter(x=>x.id!==state.selectedShapeId);state.selectedShapeId=null;markChanged();renderAll();}
function copySelected(){const p=current();if(!p)return;const ids=state.selectedPlayerIds.length?state.selectedPlayerIds:(state.selectedPlayerId?[state.selectedPlayerId]:[]);if(ids.length)state.clipboard={type:'players',items:clone(p.players.filter(x=>ids.includes(x.id)))};else if(state.selectedShapeId){const sh=p.shapes.find(x=>x.id===state.selectedShapeId);if(sh)state.clipboard={type:'shape',items:[clone(sh)]};}}
function pasteSelected(){const p=current(),c=state.clipboard;if(!p||!c)return;snapshot();if(c.type==='players'){const added=c.items.map(x=>({...x,id:uid(),x:clamp(x.x+3,0,100),y:clamp(x.y+3,0,100)}));p.players.push(...added);state.selectedPlayerIds=added.map(x=>x.id);state.selectedPlayerId=added[0]?.id||null;}else{const sh={...c.items[0],id:uid(),x1:clamp(c.items[0].x1+3,0,100),x2:clamp(c.items[0].x2+3,0,100),y1:clamp(c.items[0].y1+3,0,100),y2:clamp(c.items[0].y2+3,0,100)};p.shapes.push(sh);state.selectedShapeId=sh.id;}markChanged();renderAll();}
function keyHandler(ev){const editing=['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName);const mod=ev.ctrlKey||ev.metaKey;if(mod&&ev.key.toLowerCase()==='z'){ev.preventDefault();ev.shiftKey?redo():undo();return;}if(mod&&ev.key.toLowerCase()==='y'){ev.preventDefault();redo();return;}if(mod&&ev.key.toLowerCase()==='c'&&!editing){ev.preventDefault();copySelected();toast('Copied');return;}if(mod&&ev.key.toLowerCase()==='v'&&!editing){ev.preventDefault();pasteSelected();return;}if(ev.key==='Escape'){state.selectedPlayerId=null;state.selectedPlayerIds=[];state.selectedShapeId=null;renderAll();return;}if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(ev.key)&&!editing){ev.preventDefault();const p=current(),step=ev.shiftKey?2:0.5,dx=ev.key==='ArrowLeft'?-step:ev.key==='ArrowRight'?step:0,dy=ev.key==='ArrowUp'?-step:ev.key==='ArrowDown'?step:0,ids=state.selectedPlayerIds.length?state.selectedPlayerIds:(state.selectedPlayerId?[state.selectedPlayerId]:[]);if(ids.length){snapshot();p.players.filter(x=>ids.includes(x.id)).forEach(x=>{x.x=clamp(x.x+dx,0,100);x.y=clamp(x.y+dy,0,100)});markChanged();renderPlayers();}return;}if((ev.key==='Delete'||ev.key==='Backspace')&&!editing){const p=current();if(state.selectedPlayerIds.length||state.selectedPlayerId){snapshot();const ids=new Set(state.selectedPlayerIds.length?state.selectedPlayerIds:[state.selectedPlayerId]);p.players=p.players.filter(x=>!ids.has(x.id));state.selectedPlayerId=null;state.selectedPlayerIds=[];markChanged();renderAll();}else if(state.selectedShapeId)deleteSelectedShape();}}

function exportPlaybook(){const blob=new Blob([JSON.stringify({product:'Analyst Assist Playbook',version:1,exportedAt:nowIso(),plays:state.plays},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='analyst-assist-playbook-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
function importPlaybook(file){if(!file)return;const reader=new FileReader();reader.onload=()=>{try{const data=JSON.parse(reader.result),plays=(Array.isArray(data)?data:data.plays)||[];if(!plays.length)throw new Error('No plays found');const imported=plays.map(normalizePlay);const byId=new Map(state.plays.map(p=>[p.id,p]));imported.forEach(p=>{if(byId.has(p.id))p.id=uid();p.updatedAt=nowIso();state.plays.unshift(p)});state.currentId=imported[0].id;persistLocal();renderAll();imported.forEach(queueCloudSave);toast(`${imported.length} play${imported.length===1?'':'s'} imported`);}catch(e){alert('Could not import this playbook JSON: '+e.message)}};reader.readAsText(file);}

function printShapeSvg(s){return shapeSvg(s).replace(/class="[^"]*"/g,'').replace(/stroke="#(?:fff|f1c94a|9ed2ff)"/g,'stroke="#111"').replace(/fill="#fff"/g,'fill="#111"').replace(/fill="url\(#zone-/g,'fill="url(#print-zone-');}
function playPrintHtml(p){const players=p.players.map(pl=>{const sym=effectiveSymbol(pl);return `<div class="pp ${pl.side} sym-${sym}" style="left:${pl.x}%;top:${pl.y}%">${sym==='x'?'×':esc(pl.label)}</div>`}).join('');const shapes=p.shapes.map(printShapeSvg).join('');const resp=p.players.filter(x=>x.assignment||x.role).map(x=>`<tr><td><b>${esc(x.label)}</b></td><td>${esc(x.role||'')}</td><td>${esc(x.assignment||'')}</td></tr>`).join('');return`<section class="card"><header><div><h1>${esc(p.name)}</h1><p>${esc(p.kind.toUpperCase())}${p.opponent?' · '+esc(p.opponent):''}</p></div><div class="tags">${(p.tags||[]).map(t=>`<span>${esc(t)}</span>`).join('')}</div></header>${p.kind==='matchup'?`<div class="match"><b>Opponent:</b> ${esc(p.opponentConcept||'—')} <b>Our call:</b> ${esc(p.ourCall||'—')}</div>`:''}<div class="pf"><div class="ez t">DEFENSE</div><div class="ez b">OFFENSE</div><svg viewBox="0 0 560 1000" preserveAspectRatio="none"><defs><marker id="arrowWhite" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="#111"/></marker><marker id="endDot" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5"><circle cx="5" cy="5" r="4" fill="#111"/></marker><marker id="endBar" viewBox="0 0 10 12" refX="8" refY="6" markerWidth="7" markerHeight="7" orient="auto"><path d="M8 0V12" stroke="#111" stroke-width="3"/></marker><pattern id="print-zone-diagonal" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="12" stroke="#111" stroke-width="2"/></pattern><pattern id="print-zone-cross" width="14" height="14" patternUnits="userSpaceOnUse"><path d="M0 0L14 14M14 0L0 14" stroke="#111" stroke-width="1.5"/></pattern><pattern id="print-zone-dots" width="12" height="12" patternUnits="userSpaceOnUse"><circle cx="4" cy="4" r="1.8" fill="#111"/></pattern><pattern id="print-zone-horizontal" width="12" height="12" patternUnits="userSpaceOnUse"><line x1="0" y1="4" x2="12" y2="4" stroke="#111" stroke-width="1.5"/></pattern></defs>${shapes}</svg>${players}</div>${resp?`<table><thead><tr><th>Pos</th><th>Role</th><th>Responsibility</th></tr></thead><tbody>${resp}</tbody></table>`:''}${p.coachingPoints?`<div class="notes"><b>Coaching points</b><br>${esc(p.coachingPoints).replace(/\n/g,'<br>')}</div>`:''}</section>`;}
function printPlays(plays){const printMode=$('printMode')?.value||'bw';if(!plays.length){alert('No plays selected for printing. Check plays in the practice set first.');return;}const w=window.open('','_blank');if(!w){alert('Popup blocked. Allow popups to print playbook cards.');return;}w.document.write(`<!doctype html><html><head><title>Analyst Assist Playbook</title><style>@page{size:portrait;margin:.35in}*{box-sizing:border-box}body{font-family:Arial,sans-serif;margin:0;color:#111}.card{page-break-after:always;padding:6px}.card:last-child{page-break-after:auto}header{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}h1{font-size:22px;margin:0}p{margin:4px 0 8px;color:#555;font-size:11px}.tags span{border:1px solid #999;border-radius:12px;padding:3px 6px;font-size:9px;margin-left:3px}.match{font-size:11px;margin:2px 0 7px}.match b:nth-of-type(2){margin-left:16px}.pf{position:relative;width:4.7in;height:8.35in;margin:0 auto;border:2px solid #fff;background:repeating-linear-gradient(180deg,#2a7548 0,#2a7548 9.8%,#2d7d4c 9.8%,#2d7d4c 19.6%);overflow:hidden}.pf:after{content:"";position:absolute;inset:0;background:repeating-linear-gradient(180deg,transparent 0,transparent calc(10% - 1px),rgba(255,255,255,.45) calc(10% - 1px),rgba(255,255,255,.45) 10%);pointer-events:none}.pf svg{position:absolute;inset:0;width:100%;height:100%;z-index:2}.pp{position:absolute;width:28px;height:28px;margin:-14px 0 0 -14px;border-radius:50%;display:grid;place-items:center;font-size:9px;font-weight:900;z-index:3;border:2px solid #fff}.pp.offense{background:#fff;color:#111}.pp.defense{background:#174a78;color:#fff;border-color:#a8d8ff}.ez{position:absolute;left:0;right:0;height:8%;background:rgba(0,0,0,.18);z-index:1;display:grid;place-items:center;font-size:9px;font-weight:800;letter-spacing:.1em}.ez.t{top:0}.ez.b{bottom:0}table{width:100%;border-collapse:collapse;margin-top:8px;font-size:10px}th,td{border:1px solid #bbb;padding:4px;text-align:left;vertical-align:top}.notes{border:1px solid #bbb;padding:6px;margin-top:7px;font-size:10px}.mode-bw .pf{background:#fff;border-color:#111}.mode-bw .pf:after{background:repeating-linear-gradient(180deg,transparent 0,transparent calc(10% - 1px),#aaa calc(10% - 1px),#aaa 10%)}.mode-bw .pp.offense{background:#fff;color:#111;border:2px solid #111}.mode-bw .pp.defense{background:#111;color:#fff;border:2px solid #111;border-radius:3px}.pp.sym-x{border:0!important;background:transparent!important;color:#111!important;font-size:20px}.mode-gray .pf{filter:grayscale(1)}.mode-bw svg{filter:grayscale(1) contrast(2)} </style></head><body class="mode-${printMode}">${plays.map(playPrintHtml).join('')}</body></html>`);w.document.close();setTimeout(()=>{w.focus();w.print();},300);}

function setSync(text,mode='warn',detail=''){
  const el=$('pbSync'),d=$('pbSaveDetail');if(!el)return;
  el.textContent=text;el.dataset.mode=mode;
  if(d)d.textContent=detail||'';
}
function cloudDetail(prefix,iso){return `${prefix}${iso?' • '+localTime(iso):''}`;}
async function pickTeam(client){const {data,error}=await client.from('teams').select('*').order('created_at',{ascending:false}).limit(1);if(error)throw error;return data?.[0]||null;}
async function initCloud(){
  const client=window.aaSupabase;
  if(!client){setSync('LOCAL CACHE','warn','Supabase is not configured in assets/config.js');return;}
  setSync('CONNECTING…','saving','Checking Supabase');
  try{
    const {data,error}=await client.auth.getSession();
    if(error||!data?.session){setSync('LOCAL CACHE','warn','Sign in to save the playbook to Supabase');return;}
    state.cloud.session=data.session;
    state.cloud.team=await pickTeam(client);
    if(!state.cloud.team){setSync('LOCAL CACHE','warn','No team is attached to this account');return;}
    const res=await client.from(CLOUD_TABLE).select('play_id,data,updated_at').eq('team_id',state.cloud.team.id);
    if(res.error){
      console.info('Playbook cloud table unavailable.',res.error.message);
      setSync('CLOUD SETUP NEEDED','error','Run supabase_playbook_builder.sql once in Supabase');return;
    }
    const remoteById=new Map();
    (res.data||[]).forEach(row=>{const remote=normalizePlay(row.data||{});remote.id=row.play_id||remote.id;remote.updatedAt=row.updated_at||remote.updatedAt;remoteById.set(remote.id,remote);});
    const merged=[];const upload=[];const seen=new Set();
    state.plays.forEach(local=>{
      const remote=remoteById.get(local.id);seen.add(local.id);
      if(!remote){merged.push(local);upload.push(local);return;}
      if(String(local.updatedAt||'')>String(remote.updatedAt||'')){merged.push(local);upload.push(local);}else merged.push(remote);
    });
    remoteById.forEach((remote,id)=>{if(!seen.has(id))merged.push(remote);});
    state.plays=merged.length?merged:[blankPlay()];
    if(!state.plays.some(p=>p.id===state.currentId))state.currentId=state.plays[0]?.id||null;
    persistLocal();
    state.cloud.ready=true;state.cloud.error=null;
    setSync('CLOUD READY','ok',cloudDetail('Supabase is primary; this browser is an offline cache',nowIso()));
    renderAll();
    for(const play of upload)await cloudSave(play,{quiet:true});
    state.cloud.channel=client.channel('aa-playbook-'+state.cloud.team.id).on('postgres_changes',{event:'*',schema:'public',table:CLOUD_TABLE,filter:'team_id=eq.'+state.cloud.team.id},payload=>{
      if(payload.eventType==='DELETE'){
        const id=payload.old?.play_id;if(id){state.plays=state.plays.filter(p=>p.id!==id);if(state.currentId===id)state.currentId=state.plays[0]?.id||null;persistLocal();renderAll();}
        return;
      }
      const row=payload.new;if(!row?.data)return;
      const remote=normalizePlay(row.data);remote.id=row.play_id||remote.id;remote.updatedAt=row.updated_at||remote.updatedAt;
      const local=state.plays.find(p=>p.id===remote.id);
      if(!local||String(remote.updatedAt)>=String(local.updatedAt||'')){
        if(local)state.plays[state.plays.findIndex(p=>p.id===remote.id)]=remote;else state.plays.push(remote);
        persistLocal();renderAll();
      }
    }).subscribe();
  }catch(e){console.warn('Playbook cloud init failed',e);state.cloud.ready=false;state.cloud.error=e;setSync('OFFLINE CACHE','error','Cloud connection failed; edits remain cached here until reconnect');}
}
function queueCloudSave(play){
  if(play&&play.id){cloudSave(play);return;}
  clearTimeout(state.cloud.timer);
  if(!state.cloud.ready){setSync('OFFLINE CACHE','warn','Change cached on this device; waiting for Supabase');return;}
  setSync('SAVING…','saving','Saving current play to Supabase');
  state.cloud.timer=setTimeout(()=>cloudSave(current()),450);
}
async function cloudSave(play,opts={}){
  const client=window.aaSupabase;
  if(!play)return false;
  if(!state.cloud.ready||!client||!state.cloud.team||!state.cloud.session){if(!opts.quiet)setSync('OFFLINE CACHE','warn','Change cached on this device; waiting for Supabase');return false;}
  state.cloud.saving=true;if(!opts.quiet)setSync('SAVING…','saving','Saving to Supabase');
  try{
    const data=clone(play);const stamp=play.updatedAt||nowIso();
    const {error}=await client.from(CLOUD_TABLE).upsert({team_id:state.cloud.team.id,play_id:play.id,data,updated_at:stamp,updated_by:state.cloud.session.user.id},{onConflict:'team_id,play_id'});
    if(error)throw error;
    state.cloud.lastSavedAt=nowIso();state.cloud.saving=false;state.cloud.error=null;
    setSync('SAVED TO CLOUD','ok',cloudDetail('Supabase',state.cloud.lastSavedAt));return true;
  }catch(e){console.warn('Playbook cloud save failed',e);state.cloud.saving=false;state.cloud.error=e;setSync('OFFLINE CACHE','error','Cloud save failed; edit is cached locally and will retry after reconnect');return false;}
}
async function cloudDelete(id){const client=window.aaSupabase;if(!state.cloud.ready||!client||!state.cloud.team)return;try{setSync('SAVING…','saving','Deleting from Supabase');const {error}=await client.from(CLOUD_TABLE).delete().eq('team_id',state.cloud.team.id).eq('play_id',id);if(error)throw error;state.cloud.lastSavedAt=nowIso();setSync('SAVED TO CLOUD','ok',cloudDetail('Supabase',state.cloud.lastSavedAt));}catch(e){console.warn('Playbook cloud delete failed',e);setSync('OFFLINE CACHE','error','Cloud delete failed');}}
async function saveCurrentNow(){updateMeta();const ok=await cloudSave(current());toast(ok?'Saved to Supabase':'Saved to local cache; cloud not available');}

function installPrintSafeDefs(){const defs=document.querySelector('#drawingLayer defs');if(!defs)return;defs.insertAdjacentHTML('beforeend',`<marker id="endDot" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="5" markerHeight="5"><circle cx="5" cy="5" r="4" fill="currentColor"/></marker><marker id="endBar" viewBox="0 0 10 12" refX="8" refY="6" markerWidth="7" markerHeight="7" orient="auto"><path d="M8 0V12" stroke="currentColor" stroke-width="3"/></marker><pattern id="zone-diagonal" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="12" stroke="#fff" stroke-width="3"/></pattern><pattern id="zone-cross" width="14" height="14" patternUnits="userSpaceOnUse"><path d="M0 0L14 14M14 0L0 14" stroke="#fff" stroke-width="2"/></pattern><pattern id="zone-dots" width="12" height="12" patternUnits="userSpaceOnUse"><circle cx="4" cy="4" r="2" fill="#fff"/></pattern><pattern id="zone-horizontal" width="12" height="12" patternUnits="userSpaceOnUse"><line x1="0" y1="4" x2="12" y2="4" stroke="#fff" stroke-width="2"/></pattern>`);}
function bind(){
  $('newPlayBtn').onclick=newPlay;$('savePlayBtn').onclick=saveCurrentNow;$('duplicatePlayBtn').onclick=duplicatePlay;$('flipPlayBtn').onclick=flipPlay;$('undoBtn').onclick=undo;$('redoBtn').onclick=redo;$('printCurrentBtn').onclick=()=>printPlays(current()?[current()]:[]);$('printSetBtn').onclick=()=>printPlays(state.plays.filter(p=>p.practice));$('exportBtn').onclick=exportPlaybook;$('importFile').onchange=e=>{importPlaybook(e.target.files?.[0]);e.target.value=''};
  document.querySelectorAll('.tool').forEach(b=>b.onclick=()=>setTool(b.dataset.tool));document.querySelectorAll('.template').forEach(b=>b.onclick=()=>applyTemplate(b.dataset.template));
  ['playName','playOpponent','playTags','opponentConcept','ourCall','coachingPoints'].forEach(id=>$(id).addEventListener('input',updateMeta));$('playKind').onchange=updateMeta;$('practiceSetToggle').onchange=updateMeta;
  ['playerLabel','playerRole','playerAssignment','playerSymbol'].forEach(id=>$(id).addEventListener(id==='playerSymbol'?'change':'input',updatePlayer));$('deletePlayerBtn').onclick=deleteSelectedPlayer;['shapeLineStyle','shapeWidth','shapeEndpoint','zonePattern'].forEach(id=>$(id).addEventListener('change',updateShape));$('deleteShapeBtn').onclick=deleteSelectedShape;
  $('librarySearch').oninput=renderLibrary;$('libraryFilter').onchange=renderLibrary;$('collapseLibraryBtn').onclick=()=>document.body.classList.toggle('library-collapsed');
  const field=$('footballField');field.addEventListener('pointerdown',fieldPointerDown);window.addEventListener('pointermove',fieldPointerMove);window.addEventListener('pointerup',fieldPointerUp);document.addEventListener('keydown',keyHandler);
}

window.addEventListener('offline',()=>setSync('OFFLINE CACHE','warn','No network; edits are cached on this device'));window.addEventListener('online',()=>{state.cloud.ready=false;initCloud();});
installPrintSafeDefs();loadLocal();bind();renderAll();initCloud();
})();
