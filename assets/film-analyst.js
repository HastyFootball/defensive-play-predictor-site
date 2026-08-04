(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const video = $('filmVideo');
  const frameCanvas = $('frameCanvas');
  const overlay = $('overlayCanvas');
  const stage = $('stage');
  const fctx = frameCanvas.getContext('2d', {willReadFrequently:true});
  const octx = overlay.getContext('2d');
  const STORE = 'analyst_assist_film_ball_qb_v3';
  const PROFILE = 'analyst_assist_film_profile_v3';
  let stream = null;
  let model = null;
  let modelError = null;
  let frozen = false;
  let mode = 'idle';
  let ball = null;
  let qb = null;
  let crop = null;
  let cropStart = null;
  let offenseSample = null;
  let directionOverride = false;
  let detections = [];
  let analysis = null;
  let dataset = load(STORE, []);
  let profile = load(PROFILE, {});

  function load(k,f){try{return JSON.parse(localStorage.getItem(k))||f}catch{return f}}
  function save(k,v){localStorage.setItem(k,JSON.stringify(v))}
  function escapeHtml(v){return String(v??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]))}
  function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
  function setEnabled(on){['stopShareBtn','freezeBtn','sampleOffenseBtn','cropModeBtn','resetPlayBtn'].forEach(id=>$(id).disabled=!on)}
  function resize(){const r=stage.getBoundingClientRect();[frameCanvas,overlay].forEach(c=>{c.width=Math.max(1,Math.round(r.width*devicePixelRatio));c.height=Math.max(1,Math.round(r.height*devicePixelRatio));c.style.width=r.width+'px';c.style.height=r.height+'px'});drawOverlay()}
  window.addEventListener('resize',resize);

  async function loadModel(){
    try{
      if(!window.cocoSsd) throw new Error('Model library did not load. Check internet access.');
      $('modelStatus').textContent='Loading person detector';
      model=await window.cocoSsd.load({base:'lite_mobilenet_v2'});
      $('modelDot').classList.add('live');$('modelStatus').textContent='Person detector ready';$('modelDetail').textContent='Real human detection is active.';
    }catch(e){modelError=e;$('modelStatus').textContent='Person detector unavailable';$('modelDetail').textContent=e.message||'Check internet access and refresh.';$('modelDot').classList.remove('live')}
  }

  function effectiveDirection(){
    const q=$('quarterInput').value;let dir=$('q1DirectionInput').value;
    if(q==='2'||q==='4') dir=dir==='ltr'?'rtl':'ltr';
    if(directionOverride) dir=dir==='ltr'?'rtl':'ltr';
    return dir;
  }
  function renderDirection(){const d=effectiveDirection();$('effectiveDirection').textContent=d==='ltr'?'Left to right':'Right to left'}

  async function share(){
    try{
      stream=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:{ideal:30,max:60}},audio:false});
      video.srcObject=stream;await video.play();
      $('emptyState').style.display='none';$('sourceDot').classList.add('live');$('sourceStatus').textContent='Hudl source connected';$('sourceDetail').textContent=stream.getVideoTracks()[0]?.label||'Shared film';$('modePill').textContent='LIVE';setEnabled(true);setTimeout(resize,150);stream.getVideoTracks()[0].addEventListener('ended',stop);
      if(profile.crop)crop=profile.crop;if(profile.offenseSample)offenseSample=profile.offenseSample;
    }catch(e){if(e.name!=='NotAllowedError')alert('Unable to share film: '+e.message)}
  }
  function stop(){if(stream)stream.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;setEnabled(false);$('emptyState').style.display='flex';$('sourceDot').classList.remove('live');$('sourceStatus').textContent='No film source shared';$('sourceDetail').textContent='Choose the Hudl tab, window, or monitor.';$('modePill').textContent='IDLE'}

  function drawFrame(){
    const cw=frameCanvas.width,ch=frameCanvas.height;fctx.clearRect(0,0,cw,ch);if(!video.videoWidth)return;
    const scale=Math.min(cw/video.videoWidth,ch/video.videoHeight),w=video.videoWidth*scale,h=video.videoHeight*scale,x=(cw-w)/2,y=(ch-h)/2;fctx.drawImage(video,x,y,w,h);
  }
  function freeze(){drawFrame();frozen=true;ball=null;qb=null;detections=[];analysis=null;$('modePill').textContent='PRE-SNAP FROZEN';$('ballModeBtn').disabled=false;$('qbModeBtn').disabled=true;$('readyBtn').disabled=true;$('savePlayBtn').disabled=true;$('badDetectionBtn').disabled=true;mode='ball';stage.className='fa-stage ball-mode';$('stageHint').textContent='Click the football first.';drawOverlay();renderAnalysis()}
  function pt(e){const r=overlay.getBoundingClientRect();return{x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height}}
  function pxPoint(p){return{x:p.x*overlay.width,y:p.y*overlay.height}}

  function sampleColor(p){
    const x=Math.round(p.x*frameCanvas.width),y=Math.round(p.y*frameCanvas.height),rad=Math.max(3,Math.round(frameCanvas.width*.004));
    const img=fctx.getImageData(clamp(x-rad,0,frameCanvas.width-1),clamp(y-rad,0,frameCanvas.height-1),Math.min(rad*2+1,frameCanvas.width),Math.min(rad*2+1,frameCanvas.height)).data;
    let r=0,g=0,b=0,n=0;for(let i=0;i<img.length;i+=4){r+=img[i];g+=img[i+1];b+=img[i+2];n++}return{r:r/n,g:g/n,b:b/n};
  }
  function colorDistance(a,b){return Math.sqrt((a.r-b.r)**2+(a.g-b.g)**2+(a.b-b.b)**2)}
  function bodyColor(box){
    const W=frameCanvas.width,H=frameCanvas.height;
    const x=clamp(Math.round((box.x+box.w*.25)*W),0,W-1),y=clamp(Math.round((box.y+box.h*.12)*H),0,H-1);
    const w=clamp(Math.round(box.w*.5*W),2,W-x),h=clamp(Math.round(box.h*.38*H),2,H-y);
    const data=fctx.getImageData(x,y,w,h).data;let r=0,g=0,b=0,n=0;
    for(let i=0;i<data.length;i+=16){r+=data[i];g+=data[i+1];b+=data[i+2];n++}
    return n?{r:r/n,g:g/n,b:b/n}:{r:127,g:127,b:127};
  }

  function insideCrop(p){if(!crop)return true;return p.x>=crop.x&&p.x<=crop.x+crop.w&&p.y>=crop.y&&p.y<=crop.y+crop.h}
  function anchorGeometry(){
    if(!ball||!qb)return null;
    const dx=qb.x-ball.x,dy=qb.y-ball.y,d=Math.hypot(dx,dy);
    if(d<.015)return null;
    const u={x:dx/d,y:dy/d};
    const v={x:-u.y,y:u.x};
    return{u,v,d};
  }
  function project(p,g){const rx=p.x-ball.x,ry=p.y-ball.y;return{depth:rx*g.u.x+ry*g.u.y,lateral:rx*g.v.x+ry*g.v.y}}

  async function detectPeople(){
    if(!model)throw new Error(modelError?.message||'Person detector is not ready.');
    const raw=await model.detect(frameCanvas,30,.28);
    return raw.filter(x=>x.class==='person').map(x=>{
      const [x0,y0,w,h]=x.bbox;return{x:x0/frameCanvas.width,y:y0/frameCanvas.height,w:w/frameCanvas.width,h:h/frameCanvas.height,score:x.score};
    });
  }

  function chooseOffense(people){
    const g=anchorGeometry();if(!g)return{valid:[],all:[],reasons:['Ball and QB anchors are too close together.']};
    const all=people.map((b,i)=>{
      const foot={x:b.x+b.w/2,y:b.y+b.h*.93};const p=project(foot,g);const color=bodyColor(b);const uniformScore=offenseSample?clamp(1-colorDistance(color,offenseSample)/170,0,1):.5;
      const inField=insideCrop(foot);
      const geometryScore=(p.depth>=-g.d*.65&&p.depth<=g.d*4.2&&Math.abs(p.lateral)<=g.d*8.2)?1:0;
      const sizeScore=(b.h>.025&&b.h<.34&&b.w<.18)?1:0;
      const qbDistance=Math.hypot(foot.x-qb.x,foot.y-qb.y);
      const anchorBonus=qbDistance<g.d*.75?.35:0;
      const combined=b.score*.32+uniformScore*.38+geometryScore*.18+sizeScore*.08+anchorBonus;
      return{...b,id:i,foot,depth:p.depth,lateral:p.lateral,color,uniformScore,inField,combined,selected:false,role:''};
    });
    let candidates=all.filter(p=>p.inField&&p.depth>=-g.d*.65&&p.depth<=g.d*4.2&&Math.abs(p.lateral)<=g.d*8.2&&p.h>.025&&p.h<.34);
    candidates.sort((a,b)=>b.combined-a.combined);
    // Force the person nearest the QB anchor into the set when plausible.
    const qbPerson=candidates.slice().sort((a,b)=>Math.hypot(a.foot.x-qb.x,a.foot.y-qb.y)-Math.hypot(b.foot.x-qb.x,b.foot.y-qb.y))[0];
    const selected=[];
    for(const p of candidates){
      if(selected.length>=11)break;
      if(offenseSample&&p.uniformScore<.27&&p!==qbPerson)continue;
      selected.push(p);
    }
    if(qbPerson&&!selected.includes(qbPerson)){selected.pop();selected.push(qbPerson)}
    selected.forEach(p=>p.selected=true);
    return{valid:selected,all,g,reasons:[]};
  }

  function classify(selection){
    const g=selection.g,players=selection.valid.slice();
    const qbPlayer=players.slice().sort((a,b)=>Math.hypot(a.foot.x-qb.x,a.foot.y-qb.y)-Math.hypot(b.foot.x-qb.x,b.foot.y-qb.y))[0];
    if(qbPlayer)qbPlayer.role='QB';
    const nonQB=players.filter(p=>p!==qbPlayer);
    const nearLos=nonQB.filter(p=>Math.abs(p.depth)<=g.d*.62).sort((a,b)=>a.lateral-b.lateral);
    const center=nearLos.slice().sort((a,b)=>Math.abs(a.lateral)-Math.abs(b.lateral))[0];
    let line=[];
    if(center){line=nearLos.slice().sort((a,b)=>Math.abs(a.lateral)-Math.abs(b.lateral)).slice(0,7).sort((a,b)=>a.lateral-b.lateral)}
    const five=line.length>=5?line.slice(Math.max(0,Math.floor((line.length-5)/2)),Math.max(0,Math.floor((line.length-5)/2))+5):line;
    ['LT','LG','C','RG','RT'].slice(0,five.length).forEach((r,i)=>five[i].role=r);
    const attached=line.filter(p=>!five.includes(p));attached.forEach((p,i)=>p.role='TE'+(i?i+1:''));
    const backs=nonQB.filter(p=>!line.includes(p)&&p.depth>g.d*.55&&p.depth<g.d*3.1&&Math.abs(p.lateral)<g.d*3.1).sort((a,b)=>a.depth-b.depth);
    backs.forEach((p,i)=>p.role='RB'+(i?i+1:''));
    const receivers=nonQB.filter(p=>!line.includes(p)&&!backs.includes(p)).sort((a,b)=>a.lateral-b.lateral);
    receivers.forEach((p,i)=>p.role='WR'+(i+1));

    const left=receivers.filter(p=>p.lateral<0).length,right=receivers.filter(p=>p.lateral>=0).length;
    const rbCount=Math.min(2,backs.length),teCount=Math.min(3,attached.length);
    let personnel=rbCount===0?'Empty':`${rbCount}${teCount}`;
    let formation='Unknown';
    if(rbCount===0&&receivers.length>=4)formation='Empty';
    else if(left>=3&&right<=1)formation='Trips Left';
    else if(right>=3&&left<=1)formation='Trips Right';
    else if(left===2&&right===2)formation='Doubles';
    else if(Math.max(left,right)>=2)formation=right>left?'Spread Right':'Spread Left';
    else if(players.length>=8)formation='Balanced';

    const qbDepth=g.d;
    let shell='Unclear';if(qbDepth<.035)shell='Under center';else if(qbDepth<.075)shell='Pistol';else shell='Shotgun';
    const sanity=[];
    if(players.length<8)sanity.push(`Only ${players.length} likely offensive players were found.`);
    if(players.length>11)sanity.push(`Detected ${players.length} offensive players; maximum is 11.`);
    if(five.length<4)sanity.push(`Only ${five.length} likely offensive linemen were found.`);
    if(backs.length>3)sanity.push(`${backs.length} backfield players is unlikely.`);
    if(!qbPlayer)sanity.push('Quarterback could not be matched to a detected person.');
    if(!offenseSample)sanity.push('No offensive jersey sample is saved. Team separation is less reliable.');
    const validCountScore=1-Math.min(1,Math.abs(players.length-11)/5);
    const lineScore=clamp(five.length/5,0,1);
    const uniformScore=players.length?players.reduce((s,p)=>s+p.uniformScore,0)/players.length:.2;
    const modelScore=players.length?players.reduce((s,p)=>s+p.score,0)/players.length:.2;
    let confidence=.28*validCountScore+.27*lineScore+.23*uniformScore+.14*modelScore+.08*(qbPlayer?1:0);
    if(sanity.length)confidence-=Math.min(.42,sanity.length*.11);
    confidence=clamp(confidence,.05,.94);
    const rejected=players.length<7||five.length<3||confidence<.28;
    if(rejected)formation='Detection incomplete';

    const tells=[];
    if(receivers.length>=2){const depths=receivers.map(p=>p.depth/g.d);const spread=Math.max(...depths)-Math.min(...depths);if(spread>.7)tells.push('One receiver appears noticeably deeper or farther off the ball than the others.');}
    if(five.length>=5){const gaps=[];for(let i=1;i<five.length;i++)gaps.push(Math.abs(five[i].lateral-five[i-1].lateral)/g.d);const avg=gaps.reduce((a,b)=>a+b,0)/gaps.length,max=Math.max(...gaps);if(avg&&max>avg*1.4)tells.push('One offensive-line split appears materially wider than the other line splits.');}
    const alternatives=[];
    if(formation==='Trips Left')alternatives.push('Trey Left','Spread Left');
    else if(formation==='Trips Right')alternatives.push('Trey Right','Spread Right');
    else if(formation==='Doubles')alternatives.push('2x2','Balanced Spread');
    else if(formation==='Empty')alternatives.push('Empty Trips','Empty Quads');
    else alternatives.push('Trips Left','Trips Right','Doubles','Balanced');
    return{players,formation,personnel,shell,confidence,rejected,sanity,tells,alternatives,counts:{peopleDetected:selection.all.length,validOffense:players.length,line:five.length,backs:backs.length,receivers:receivers.length,left,right},qbDepthRatio:1};
  }

  async function analyze(){
    if(!frozen||!ball||!qb)return;
    if(!model){alert('The person detector is not ready yet. Check the model status at the top of the page.');return}
    $('analysisStatus').textContent='Analyzing…';$('modePill').textContent='ANALYZING';$('readyBtn').disabled=true;
    try{
      const people=await detectPeople();const selection=chooseOffense(people);analysis=classify(selection);detections=analysis.players;
      $('formationInput').value=analysis.rejected?'':analysis.formation;$('personnelInput').value=analysis.rejected?'':analysis.personnel;
      $('analysisStatus').textContent=analysis.rejected?'Review required':Math.round(analysis.confidence*100)+'% confidence';
      $('savePlayBtn').disabled=false;$('badDetectionBtn').disabled=false;$('modePill').textContent=analysis.rejected?'LOW CONFIDENCE':'REVIEW';drawOverlay();renderAnalysis();renderAlternatives();
      $('stageHint').textContent=analysis.rejected?'Detection did not pass football sanity checks. Correct the formation manually or mark Bad detection.':'Review the suggested formation and personnel. Correct only what is wrong.';
    }catch(e){analysis=null;detections=[];$('analysisStatus').textContent='Analysis failed';$('modePill').textContent='ERROR';$('stageHint').textContent=e.message;alert('Analysis failed: '+e.message)}finally{$('readyBtn').disabled=false}
  }

  function renderAnalysis(){
    const box=$('analysisResults');if(!analysis){box.innerHTML='<div class="fa-empty-list">Freeze a frame, mark the football and quarterback, then press Analyze.</div>';return}
    const pct=Math.round(analysis.confidence*100);const cls=analysis.rejected?'bad':pct>=70?'':pct>=45?'low':'bad';
    const rows=[['Result',analysis.rejected?'Detection incomplete':'Usable read',pct],['Formation',analysis.formation,pct],['Personnel',analysis.personnel||'Unknown',Math.max(5,pct-7)],['QB shell',analysis.shell,Math.max(10,pct-4)],['People detected in frame',analysis.counts.peopleDetected,Math.min(98,pct+4)],['Likely offensive players',analysis.counts.validOffense,Math.min(98,pct+2)],['Likely offensive line',analysis.counts.line,Math.max(5,pct-6)]];
    box.innerHTML=rows.map(r=>`<div class="fa-analysis-item ${cls}"><span>${escapeHtml(r[0])}</span><strong>${escapeHtml(r[1])}</strong><em>${Math.round(r[2])}%</em></div>`).join('')+
      (analysis.sanity.length?`<div class="fa-confidence-note"><strong>Sanity checks</strong><br>${analysis.sanity.map(escapeHtml).join('<br>')}</div>`:'')+
      (analysis.tells.length?`<div class="fa-confidence-note"><strong>Possible alignment tells</strong><br>${analysis.tells.map(escapeHtml).join('<br>')}</div>`:'');
  }
  function renderAlternatives(){
    const box=$('formationAlternatives');box.innerHTML='';if(!analysis)return;
    const vals=[analysis.formation,...analysis.alternatives].filter((x,i,a)=>x&&x!=='Detection incomplete'&&a.indexOf(x)===i).slice(0,4);
    vals.forEach(v=>{const b=document.createElement('button');b.className='fa-btn fa-small';b.textContent=v;b.onclick=()=>{$('formationInput').value=v};box.appendChild(b)});
  }

  function drawOverlay(){
    const W=overlay.width,H=overlay.height;octx.clearRect(0,0,W,H);octx.save();octx.lineWidth=Math.max(2,W*.002);
    if(crop){octx.strokeStyle='#4f9cff';octx.strokeRect(crop.x*W,crop.y*H,crop.w*W,crop.h*H)}
    if(ball){const p=pxPoint(ball);octx.fillStyle='#ffb347';octx.beginPath();octx.arc(p.x,p.y,Math.max(7,W*.007),0,Math.PI*2);octx.fill();octx.fillStyle='#fff';octx.font=`700 ${Math.max(12,W*.012)}px system-ui`;octx.fillText('BALL',p.x+10,p.y-8)}
    if(qb){const p=pxPoint(qb);octx.fillStyle='#b27cff';octx.beginPath();octx.arc(p.x,p.y,Math.max(7,W*.007),0,Math.PI*2);octx.fill();octx.fillStyle='#fff';octx.font=`700 ${Math.max(12,W*.012)}px system-ui`;octx.fillText('QB',p.x+10,p.y-8)}
    if(ball&&qb){const a=pxPoint(ball),b=pxPoint(qb);octx.strokeStyle='#b27cff';octx.setLineDash([8,6]);octx.beginPath();octx.moveTo(a.x,a.y);octx.lineTo(b.x,b.y);octx.stroke();octx.setLineDash([])}
    detections.forEach(p=>{octx.strokeStyle=p.role==='QB'?'#b27cff':p.role?.startsWith('WR')?'#4f9cff':p.role?.startsWith('RB')?'#f7c948':'#2dd4bf';octx.strokeRect(p.x*W,p.y*H,p.w*W,p.h*H);octx.fillStyle='rgba(2,13,24,.82)';const label=p.role||'OFF';octx.font=`700 ${Math.max(11,W*.01)}px system-ui`;const tw=octx.measureText(label).width+10;octx.fillRect(p.x*W,p.y*H-20,tw,20);octx.fillStyle='#fff';octx.fillText(label,p.x*W+5,p.y*H-5)});
    octx.restore();
  }

  overlay.addEventListener('pointerdown',e=>{
    if(!frozen&&mode!=='crop')return;const p=pt(e);
    if(mode==='ball'){ball=p;mode='qb';$('qbModeBtn').disabled=false;$('readyBtn').disabled=true;stage.className='fa-stage qb-mode';$('stageHint').textContent='Now click the quarterback.';drawOverlay();return}
    if(mode==='qb'){qb=p;mode='idle';$('readyBtn').disabled=false;stage.className='fa-stage';$('stageHint').textContent='Ball and QB marked. Press Analyze.';drawOverlay();return}
    if(mode==='sample'){offenseSample=sampleColor(p);profile.offenseSample=offenseSample;save(PROFILE,profile);mode='idle';stage.className='fa-stage';$('stageHint').textContent='Offensive jersey sample saved. Mark the ball and QB for this play.';drawOverlay();return}
    if(mode==='crop'){cropStart=p;overlay.setPointerCapture(e.pointerId)}
  });
  overlay.addEventListener('pointermove',e=>{if(mode==='crop'&&cropStart){const p=pt(e);crop={x:Math.min(cropStart.x,p.x),y:Math.min(cropStart.y,p.y),w:Math.abs(p.x-cropStart.x),h:Math.abs(p.y-cropStart.y)};drawOverlay()}});
  overlay.addEventListener('pointerup',e=>{if(mode==='crop'&&cropStart){cropStart=null;profile.crop=crop;save(PROFILE,profile);mode='idle';stage.className='fa-stage';$('stageHint').textContent='Video crop saved and reused.';try{overlay.releasePointerCapture(e.pointerId)}catch{}}});

  function resetPlay(){ball=null;qb=null;detections=[];analysis=null;frozen=false;mode='idle';stage.className='fa-stage';fctx.clearRect(0,0,frameCanvas.width,frameCanvas.height);drawOverlay();$('ballModeBtn').disabled=true;$('qbModeBtn').disabled=true;$('readyBtn').disabled=true;$('savePlayBtn').disabled=true;$('badDetectionBtn').disabled=true;$('formationInput').value='';$('personnelInput').value='';$('playTypeInput').value='';$('playDirectionInput').value='';$('conceptInput').value='';$('notesInput').value='';$('analysisStatus').textContent='Waiting';$('modePill').textContent=stream?'LIVE':'IDLE';$('formationAlternatives').innerHTML='';renderAnalysis()}
  function buildItem(bad=false){return{id:crypto.randomUUID?.()||String(Date.now()),createdAt:new Date().toISOString(),opponent:$('opponentInput').value.trim(),quarter:$('quarterInput').value,q1Direction:$('q1DirectionInput').value,effectiveDirection:effectiveDirection(),directionOverride,angle:$('angleInput').value,crop,ball,qb,offenseSample,detections,badDetection:bad,auto:analysis?{formation:analysis.formation,personnel:analysis.personnel,shell:analysis.shell,confidence:analysis.confidence,rejected:analysis.rejected,counts:analysis.counts,sanity:analysis.sanity,tells:analysis.tells}:null,labels:{formation:$('formationInput').value.trim(),personnel:$('personnelInput').value,playType:$('playTypeInput').value,direction:$('playDirectionInput').value,concept:$('conceptInput').value.trim(),notes:$('notesInput').value.trim()},presnap:frameCanvas.toDataURL('image/jpeg',.74)}}
  function savePlay(bad=false){if(!ball||!qb)return;dataset.push(buildItem(bad));save(STORE,dataset);renderDataset();resetPlay();$('stageHint').textContent='Play saved. Freeze the next pre-snap frame, click ball, click QB, analyze.'}
  function renderDataset(){
    $('datasetCount').textContent=dataset.length+' play'+(dataset.length===1?'':'s');const body=$('datasetBody');body.innerHTML='';dataset.slice().reverse().forEach((p,ri)=>{const idx=dataset.length-1-ri,tr=document.createElement('tr');tr.innerHTML=`<td>${idx+1}</td><td>${escapeHtml(p.quarter)}</td><td>${escapeHtml(p.labels.formation||p.auto?.formation||'—')}</td><td>${escapeHtml(p.labels.personnel||p.auto?.personnel||'—')}</td><td>${escapeHtml(p.auto?.counts?.validOffense??'—')}</td><td>${p.badDetection?'Bad':Math.round((p.auto?.confidence||0)*100)+'%'}</td><td><button class="fa-btn fa-small" data-delete="${idx}">Delete</button></td>`;body.appendChild(tr)});body.querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>{dataset.splice(Number(b.dataset.delete),1);save(STORE,dataset);renderDataset()})
  }
  function exportFile(name,type,text){const blob=new Blob([text],{type}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
  function csvEscape(v){const s=String(v??'');return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}
  function exportCsv(){const rows=[['createdAt','opponent','quarter','autoFormation','finalFormation','autoPersonnel','finalPersonnel','confidence','validOffense','lineCount','badDetection','playType','direction','concept','notes']];dataset.forEach(p=>rows.push([p.createdAt,p.opponent,p.quarter,p.auto?.formation,p.labels.formation,p.auto?.personnel,p.labels.personnel,p.auto?.confidence,p.auto?.counts?.validOffense,p.auto?.counts?.line,p.badDetection,p.labels.playType,p.labels.direction,p.labels.concept,p.labels.notes]));exportFile('film-analyst-ball-qb-v3.csv','text/csv',rows.map(r=>r.map(csvEscape).join(',')).join('\n'))}

  $('shareBtn').onclick=share;$('stopShareBtn').onclick=stop;$('freezeBtn').onclick=freeze;
  $('ballModeBtn').onclick=()=>{if(frozen){mode='ball';stage.className='fa-stage ball-mode';$('stageHint').textContent='Click the football.'}};
  $('qbModeBtn').onclick=()=>{if(frozen&&ball){mode='qb';stage.className='fa-stage qb-mode';$('stageHint').textContent='Click the quarterback.'}};
  $('readyBtn').onclick=analyze;
  $('sampleOffenseBtn').onclick=()=>{if(!frozen){alert('Freeze a pre-snap frame first.');return}mode='sample';stage.className='fa-stage sample-mode';$('stageHint').textContent='Click the middle of an offensive player’s jersey. This is saved for the session.'};
  $('cropModeBtn').onclick=()=>{mode='crop';stage.className='fa-stage crop-mode';$('stageHint').textContent='Drag around only the football video. Exclude stands, menus, and controls.'};
  $('resetPlayBtn').onclick=resetPlay;$('savePlayBtn').onclick=()=>savePlay(false);$('badDetectionBtn').onclick=()=>savePlay(true);
  $('quarterInput').onchange=()=>{directionOverride=false;renderDirection()};$('q1DirectionInput').onchange=()=>{directionOverride=false;renderDirection()};$('flipDirectionBtn').onclick=()=>{directionOverride=!directionOverride;renderDirection()};
  $('exportJsonBtn').onclick=()=>exportFile('film-analyst-ball-qb-v3.json','application/json',JSON.stringify({version:3,exportedAt:new Date().toISOString(),plays:dataset},null,2));$('exportCsvBtn').onclick=exportCsv;$('clearDatasetBtn').onclick=()=>{if(confirm('Delete all saved Film Analyst examples from this browser?')){dataset=[];save(STORE,dataset);renderDataset()}};
  renderDirection();renderDataset();resize();loadModel();
})();
