(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const video = $('filmVideo');
  const frameCanvas = $('frameCanvas');
  const overlay = $('overlayCanvas');
  const stage = $('stage');
  const fctx = frameCanvas.getContext('2d');
  const octx = overlay.getContext('2d');
  const STORAGE_KEY = 'analyst_assist_film_dataset_v1';
  const CAL_KEY = 'analyst_assist_film_calibration_v1';
  const roles = ['C','LG','LT','RG','RT','TE','QB','RB','WR1','WR2','WR3','H'];
  let stream = null;
  let frozen = false;
  let currentRole = null;
  let interactionMode = 'idle';
  let crop = null;
  let cropStart = null;
  let calibration = loadJson(CAL_KEY, { fieldPoints: [], los: null, scaleYards: 10, offenseColor: null, defenseColor: null });
  let marks = {};
  let frames = { presnap: null, snap: null, end: null };
  let measurements = {};
  let dataset = loadJson(STORAGE_KEY, []);
  let wizardStep = 0;

  function loadJson(key, fallback){ try { return JSON.parse(localStorage.getItem(key)) || fallback; } catch { return fallback; } }
  function saveJson(key, value){ localStorage.setItem(key, JSON.stringify(value)); }
  function setEnabled(enabled){ ['stopShareBtn','cropModeBtn','calibrateBtn','clearOverlayBtn','freezeBtn','snapFrameBtn','endFrameBtn','setupWizardBtn'].forEach(id => $(id).disabled = !enabled); }
  function resizeCanvases(){ const r = stage.getBoundingClientRect(); [frameCanvas, overlay].forEach(c => { c.width = Math.max(1, Math.round(r.width * devicePixelRatio)); c.height = Math.max(1, Math.round(r.height * devicePixelRatio)); c.style.width = r.width+'px'; c.style.height = r.height+'px'; }); drawOverlay(); }
  window.addEventListener('resize', resizeCanvases);

  async function shareScreen(){
    if (!navigator.mediaDevices?.getDisplayMedia){ alert('Screen sharing is not supported in this browser. Use current Chrome or Edge over localhost or HTTPS.'); return; }
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({video:{frameRate:{ideal:30,max:60}},audio:false});
      video.srcObject = stream; await video.play();
      $('emptyState').style.display='none'; $('sourceDot').classList.add('live'); $('sourceStatus').textContent='Film source connected';
      $('sourceDetail').textContent=stream.getVideoTracks()[0]?.label || 'Shared screen/window/tab';
      setEnabled(true); $('modePill').textContent='LIVE SOURCE';
      stream.getVideoTracks()[0].addEventListener('ended', stopShare);
      setTimeout(resizeCanvases,150);
    } catch(err){ if(err.name!=='NotAllowedError') alert('Unable to share the film source: '+err.message); }
  }
  function stopShare(){ if(stream){ stream.getTracks().forEach(t=>t.stop()); stream=null; } video.srcObject=null; setEnabled(false); $('sourceDot').classList.remove('live'); $('sourceStatus').textContent='No film source shared'; $('sourceDetail').textContent='Choose a Hudl tab, window, or monitor.'; $('emptyState').style.display='flex'; $('modePill').textContent='IDLE'; frozen=false; }

  function drawVideoFrame(){
    const cw=frameCanvas.width,ch=frameCanvas.height; fctx.clearRect(0,0,cw,ch);
    if(!video.videoWidth) return;
    const scale=Math.min(cw/video.videoWidth,ch/video.videoHeight), w=video.videoWidth*scale,h=video.videoHeight*scale,x=(cw-w)/2,y=(ch-h)/2;
    fctx.drawImage(video,x,y,w,h);
  }
  function freezeFrame(kind='presnap'){
    if(!stream) return; drawVideoFrame(); frozen=true; frames[kind]=frameCanvas.toDataURL('image/jpeg',0.82); $('modePill').textContent=kind.toUpperCase()+' CAPTURED'; $('markStatus').textContent='Frame ready'; $('analyzeBtn').disabled=false; $('savePlayBtn').disabled=false; stage.classList.add('interactive'); drawOverlay();
  }
  function captureFrame(kind){ drawVideoFrame(); frames[kind]=frameCanvas.toDataURL('image/jpeg',0.78); $('modePill').textContent=kind.toUpperCase()+' CAPTURED'; }

  function pointFromEvent(e){ const r=overlay.getBoundingClientRect(); return {x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height}; }
  function drawOverlay(){
    const w=overlay.width,h=overlay.height; octx.clearRect(0,0,w,h); octx.save(); octx.scale(devicePixelRatio,devicePixelRatio); const cssW=w/devicePixelRatio,cssH=h/devicePixelRatio;
    const px=p=>({x:p.x*cssW,y:p.y*cssH});
    if(crop){ const a=px(crop.a),b=px(crop.b); octx.fillStyle='rgba(0,0,0,.48)'; octx.fillRect(0,0,cssW,cssH); octx.clearRect(Math.min(a.x,b.x),Math.min(a.y,b.y),Math.abs(b.x-a.x),Math.abs(b.y-a.y)); octx.strokeStyle='#4aa3ff';octx.lineWidth=2;octx.strokeRect(Math.min(a.x,b.x),Math.min(a.y,b.y),Math.abs(b.x-a.x),Math.abs(b.y-a.y)); }
    if(calibration.fieldPoints?.length){ octx.strokeStyle='#35d07f';octx.fillStyle='rgba(53,208,127,.08)';octx.lineWidth=2;octx.beginPath();calibration.fieldPoints.forEach((p,i)=>{const q=px(p);i?octx.lineTo(q.x,q.y):octx.moveTo(q.x,q.y)});if(calibration.fieldPoints.length===4)octx.closePath();octx.fill();octx.stroke(); }
    if(calibration.los){ const a=px(calibration.los.a),b=px(calibration.los.b);octx.strokeStyle='#ffc857';octx.lineWidth=3;octx.beginPath();octx.moveTo(a.x,a.y);octx.lineTo(b.x,b.y);octx.stroke();octx.fillStyle='#ffc857';octx.fillText('LOS',a.x+5,a.y-7); }
    Object.entries(marks).forEach(([role,p])=>{const q=px(p);octx.beginPath();octx.arc(q.x,q.y,10,0,Math.PI*2);octx.fillStyle=role===currentRole?'#4aa3ff':'#ff6375';octx.fill();octx.strokeStyle='#fff';octx.stroke();octx.fillStyle='#fff';octx.font='bold 11px sans-serif';octx.fillText(role,q.x+13,q.y+4);});
    octx.restore();
  }

  overlay.addEventListener('mousedown', e=>{ if(!frozen && interactionMode!=='crop') return; const p=pointFromEvent(e); if(interactionMode==='crop'){ cropStart=p; crop={a:p,b:p}; drawOverlay(); return; } if(interactionMode==='field'){ if(calibration.fieldPoints.length<4){calibration.fieldPoints.push(p); saveJson(CAL_KEY,calibration);drawOverlay();updateWizard();} return; } if(interactionMode==='los'){ if(!calibration._losStart){calibration._losStart=p;} else {calibration.los={a:calibration._losStart,b:p};delete calibration._losStart;saveJson(CAL_KEY,calibration);interactionMode='idle';drawOverlay();updateWizard();} return; } if(currentRole){marks[currentRole]=p;drawOverlay();$('markStatus').textContent=Object.keys(marks).length+' marked';} });
  overlay.addEventListener('mousemove', e=>{ if(interactionMode==='crop'&&cropStart){crop.b=pointFromEvent(e);drawOverlay();} });
  overlay.addEventListener('mouseup', ()=>{ if(interactionMode==='crop'&&cropStart){cropStart=null;interactionMode='idle';$('modePill').textContent='CROP SAVED';} });

  function buildRoleGrid(){ const grid=$('roleGrid'); roles.forEach(role=>{const b=document.createElement('button');b.className='fa-role';b.textContent=role;b.onclick=()=>{currentRole=role;[...grid.children].forEach(x=>x.classList.toggle('active',x===b));interactionMode='mark';$('stageHint').textContent='Click the center of the '+role+' on the frozen frame.';};grid.appendChild(b);}); }

  function normalizedDistance(a,b){ if(!a||!b)return null; return Math.hypot(a.x-b.x,a.y-b.y); }
  function unitScale(){
    if(calibration.fieldPoints?.length===4){ const p=calibration.fieldPoints; const near=normalizedDistance(p[0],p[1]); const far=normalizedDistance(p[3],p[2]); const avg=(near+far)/2; return avg ? 53.333/avg : 100; }
    return 100;
  }
  function fmtDist(v){ if(v==null)return '—'; return $('unitsInput').value==='yards'?(v*unitScale()).toFixed(2)+' yd':v.toFixed(3); }
  function analyze(){
    const m={}; const d=(key,a,b)=>{const v=normalizedDistance(marks[a],marks[b]);if(v!=null)m[key]=v};
    d('LT–LG split','LT','LG');d('LG–C split','LG','C');d('C–RG split','C','RG');d('RG–RT split','RG','RT');d('RT–TE split','RT','TE');d('QB depth','QB','C');d('RB depth from QB','RB','QB');d('WR1–WR2 spacing','WR1','WR2');d('WR2–WR3 spacing','WR2','WR3');d('Formation width','WR1','WR3');
    if(calibration.los){ const line=calibration.los; Object.entries(marks).forEach(([role,p])=>{ if(role.startsWith('WR')||role==='TE'||role==='RB'||role==='QB'){ const A=line.a,B=line.b; const num=Math.abs((B.y-A.y)*p.x-(B.x-A.x)*p.y+B.x*A.y-B.y*A.x); const den=Math.hypot(B.y-A.y,B.x-A.x)||1; m[role+' depth off LOS']=num/den; }}); }
    measurements=m; renderMeasurements(); $('stageHint').textContent='Measurements calculated. Add the play labels and save this example.';
  }
  function renderMeasurements(){ const box=$('measurements'); const entries=Object.entries(measurements); box.innerHTML=entries.length?'':'<div class="fa-empty-list">No measurable role pairs yet. Mark more players or add the LOS.</div>';entries.forEach(([k,v])=>{const div=document.createElement('div');div.className='fa-measure';div.innerHTML=`<span>${escapeHtml(k)}</span><strong>${fmtDist(v)}</strong>`;box.appendChild(div);}); }

  function savePlay(){
    if(!frames.presnap){alert('Freeze and capture a pre-snap frame first.');return;}
    const item={id:crypto.randomUUID?.()||String(Date.now()),createdAt:new Date().toISOString(),opponent:$('opponentInput').value.trim(),game:$('gameInput').value.trim(),angle:$('angleInput').value,offenseDirection:$('directionInput').value,crop,calibration:JSON.parse(JSON.stringify(calibration)),marks:JSON.parse(JSON.stringify(marks)),measurements:Object.fromEntries(Object.entries(measurements).map(([k,v])=>[k,{normalized:v,yards:v*unitScale()}])),labels:{down:$('downInput').value,distance:Number($('distanceInput').value||0),formation:$('formationInput').value.trim(),personnel:$('personnelInput').value.trim(),playType:$('playTypeInput').value,direction:$('playDirectionInput').value,concept:$('conceptInput').value.trim(),carrier:$('carrierInput').value.trim(),result:$('resultInput').value.trim(),notes:$('notesInput').value.trim()},frames:{presnap:frames.presnap,snap:frames.snap,end:frames.end}};
    dataset.push(item);saveJson(STORAGE_KEY,dataset);renderDataset();resetPlay();$('modePill').textContent='PLAY SAVED';
  }
  function resetPlay(){ marks={};measurements={};frames={presnap:null,snap:null,end:null};frozen=false;frameCanvas.getContext('2d').clearRect(0,0,frameCanvas.width,frameCanvas.height);drawOverlay();renderMeasurements();$('markStatus').textContent='No frame';['formationInput','personnelInput','conceptInput','carrierInput','resultInput','notesInput'].forEach(id=>$(id).value='');$('playTypeInput').value='';$('playDirectionInput').value='';$('savePlayBtn').disabled=true; }
  function renderDataset(){ $('datasetCount').textContent=dataset.length+' play'+(dataset.length===1?'':'s'); const body=$('datasetBody');body.innerHTML='';dataset.slice().reverse().forEach((p,ri)=>{const idx=dataset.length-1-ri;const top=Object.entries(p.measurements||{}).slice(0,3).map(([k,v])=>`${k}: ${(v.yards??0).toFixed(1)} yd`).join('; ');const tr=document.createElement('tr');tr.innerHTML=`<td>${idx+1}</td><td>${escapeHtml(p.opponent||'—')}</td><td>${escapeHtml(p.labels.formation||'—')}</td><td>${escapeHtml(p.labels.playType||'—')}</td><td>${escapeHtml(p.labels.concept||'—')}</td><td>${escapeHtml(top||'—')}</td><td><button class="fa-btn fa-small" data-delete="${idx}">Delete</button></td>`;body.appendChild(tr);});body.querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>{dataset.splice(Number(b.dataset.delete),1);saveJson(STORAGE_KEY,dataset);renderDataset();}); }
  function exportFile(name,type,text){const blob=new Blob([text],{type});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
  function csvEscape(v){const s=String(v??'');return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;}
  function exportCsv(){const keys=['createdAt','opponent','game','angle','down','distance','formation','personnel','playType','direction','concept','carrier','result','notes','LT-LG split yards','RG-RT split yards','QB depth yards','WR2 depth off LOS yards','Formation width yards'];const rows=[keys];dataset.forEach(p=>rows.push([p.createdAt,p.opponent,p.game,p.angle,p.labels.down,p.labels.distance,p.labels.formation,p.labels.personnel,p.labels.playType,p.labels.direction,p.labels.concept,p.labels.carrier,p.labels.result,p.labels.notes,p.measurements?.['LT–LG split']?.yards,p.measurements?.['RG–RT split']?.yards,p.measurements?.['QB depth']?.yards,p.measurements?.['WR2 depth off LOS']?.yards,p.measurements?.['Formation width']?.yards]));exportFile('film-analyst-dataset.csv','text/csv',rows.map(r=>r.map(csvEscape).join(',')).join('\n'));}
  function escapeHtml(s){return String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}

  const wizardSteps=[
    {title:'Share and freeze a clear frame',html:()=>`<p class="fa-wizard-copy">Pause Hudl on a clean pre-snap view. Make sure the full offensive formation and visible yard lines are on screen.</p><div class="fa-wizard-actions"><button class="fa-btn fa-primary" id="wizFreeze">Freeze current frame</button><button class="fa-btn" id="wizRetake">Retake frame</button></div><div class="fa-checklist"><div>${frames.presnap?'✓':'○'} Pre-snap frame captured</div><div>${stream?'✓':'○'} Film source connected</div></div>`},
    {title:'Crop to the football video',html:()=>`<p class="fa-wizard-copy">Drag a rectangle around only the football video. Exclude Hudl menus, playlists, playback controls, and borders.</p><div class="fa-wizard-actions"><button class="fa-btn fa-primary" id="wizCrop">Draw crop box</button><button class="fa-btn" id="wizClearCrop">Clear crop</button></div><div class="fa-checklist"><div>${crop?'✓ Crop saved':'○ Crop not set'}</div></div>`},
    {title:'Map four field points',html:()=>`<p class="fa-wizard-copy">Click four points around the visible playable field in this order: near-left, near-right, far-right, far-left. This converts screen pixels into approximate football-field distances.</p><div class="fa-wizard-actions"><button class="fa-btn fa-primary" id="wizField">Start field mapping</button><button class="fa-btn" id="wizClearField">Clear points</button></div><div class="fa-checklist"><div>${calibration.fieldPoints.length}/4 field points marked</div></div>`},
    {title:'Draw the line of scrimmage',html:()=>`<p class="fa-wizard-copy">Click one visible end of the line of scrimmage, then the other. Receiver and backfield depth will be measured relative to this line.</p><div class="fa-wizard-actions"><button class="fa-btn fa-primary" id="wizLos">Draw LOS</button><button class="fa-btn" id="wizClearLos">Clear LOS</button></div><div class="fa-checklist"><div>${calibration.los?'✓ LOS saved':'○ LOS not set'}</div></div>`},
    {title:'Confirm direction and context',html:()=>`<p class="fa-wizard-copy">Confirm which direction the offense is moving and identify the film angle. These values are saved with every labeled play.</p><div class="fa-calibration-summary"><div><span>Direction</span><strong>${$('directionInput').selectedOptions[0].text}</strong></div><div><span>Angle</span><strong>${$('angleInput').value}</strong></div><div><span>Opponent</span><strong>${escapeHtml($('opponentInput').value||'Not entered')}</strong></div><div><span>Crop</span><strong>${crop?'Ready':'Missing'}</strong></div></div>`},
    {title:'Calibration ready',html:()=>`<p class="fa-wizard-copy">You can now mark offensive positions, calculate splits and depth, label the play, and save the example. Use the same calibration while the film angle and zoom remain unchanged.</p><div class="fa-checklist"><div>${frames.presnap?'✓':'○'} Frozen frame</div><div>${crop?'✓':'○'} Video crop</div><div>${calibration.fieldPoints.length===4?'✓':'○'} Field map</div><div>${calibration.los?'✓':'○'} Line of scrimmage</div></div>`}
  ];
  function openWizard(){wizardStep=0;$('wizardModal').hidden=false;updateWizard();}
  function updateWizard(){const s=wizardSteps[wizardStep];$('wizardTitle').textContent=s.title;$('wizardContent').innerHTML=s.html();$('wizardStepText').textContent=`Step ${wizardStep+1} of ${wizardSteps.length}`;$('wizardProgress').style.width=((wizardStep+1)/wizardSteps.length*100)+'%';$('wizardBackBtn').disabled=wizardStep===0;$('wizardNextBtn').textContent=wizardStep===wizardSteps.length-1?'Finish':'Next';bindWizardActions();}
  function bindWizardActions(){const bind=(id,fn)=>{const el=$(id);if(el)el.onclick=fn};bind('wizFreeze',()=>{freezeFrame('presnap');updateWizard()});bind('wizRetake',()=>{freezeFrame('presnap');updateWizard()});bind('wizCrop',()=>{interactionMode='crop';stage.classList.add('interactive');$('wizardModal').hidden=true;$('stageHint').textContent='Drag around the football video, then reopen calibration.'});bind('wizClearCrop',()=>{crop=null;drawOverlay();updateWizard()});bind('wizField',()=>{calibration.fieldPoints=[];interactionMode='field';stage.classList.add('interactive');$('wizardModal').hidden=true;$('stageHint').textContent='Click near-left, near-right, far-right, then far-left field points. Reopen calibration when finished.'});bind('wizClearField',()=>{calibration.fieldPoints=[];saveJson(CAL_KEY,calibration);drawOverlay();updateWizard()});bind('wizLos',()=>{calibration.los=null;delete calibration._losStart;interactionMode='los';stage.classList.add('interactive');$('wizardModal').hidden=true;$('stageHint').textContent='Click two points to draw the line of scrimmage. Reopen calibration when finished.'});bind('wizClearLos',()=>{calibration.los=null;saveJson(CAL_KEY,calibration);drawOverlay();updateWizard()});}

  $('shareBtn').onclick=shareScreen;$('stopShareBtn').onclick=stopShare;$('freezeBtn').onclick=()=>freezeFrame('presnap');$('snapFrameBtn').onclick=()=>captureFrame('snap');$('endFrameBtn').onclick=()=>captureFrame('end');$('analyzeBtn').onclick=analyze;$('savePlayBtn').onclick=savePlay;$('cropModeBtn').onclick=()=>{interactionMode='crop';stage.classList.add('interactive');$('stageHint').textContent='Drag a rectangle around the football video.'};$('calibrateBtn').onclick=openWizard;$('setupWizardBtn').onclick=openWizard;$('closeWizardBtn').onclick=()=>$('wizardModal').hidden=true;$('wizardBackBtn').onclick=()=>{if(wizardStep>0){wizardStep--;updateWizard()}};$('wizardNextBtn').onclick=()=>{if(wizardStep<wizardSteps.length-1){wizardStep++;updateWizard()}else{$('wizardModal').hidden=true;saveJson(CAL_KEY,calibration);$('stageHint').textContent='Calibration complete. Mark players, analyze measurements, and save the labeled play.'}};$('undoMarkBtn').onclick=()=>{const k=Object.keys(marks).pop();if(k)delete marks[k];drawOverlay();};$('clearMarksBtn').onclick=()=>{marks={};drawOverlay();};$('clearOverlayBtn').onclick=()=>{marks={};calibration.fieldPoints=[];calibration.los=null;crop=null;saveJson(CAL_KEY,calibration);drawOverlay();};$('exportJsonBtn').onclick=()=>exportFile('film-analyst-dataset.json','application/json',JSON.stringify({version:1,exportedAt:new Date().toISOString(),plays:dataset},null,2));$('exportCsvBtn').onclick=exportCsv;$('clearDatasetBtn').onclick=()=>{if(confirm('Delete all saved Film Analyst examples from this browser?')){dataset=[];saveJson(STORAGE_KEY,dataset);renderDataset();}};
  buildRoleGrid();renderDataset();resizeCanvases();
})();
