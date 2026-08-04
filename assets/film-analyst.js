(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const video = $('filmVideo');
  const frameCanvas = $('frameCanvas');
  const overlay = $('overlayCanvas');
  const stage = $('stage');
  const fctx = frameCanvas.getContext('2d', {willReadFrequently:true});
  const octx = overlay.getContext('2d');
  const STORE = 'analyst_assist_film_ball_anchor_v2';
  const PROFILE = 'analyst_assist_film_profile_v2';
  let stream = null;
  let frozen = false;
  let mode = 'idle';
  let ball = null;
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
  function setEnabled(on){['stopShareBtn','freezeBtn','sampleOffenseBtn','cropModeBtn','resetPlayBtn'].forEach(id=>$(id).disabled=!on)}
  function resize(){const r=stage.getBoundingClientRect();[frameCanvas,overlay].forEach(c=>{c.width=Math.max(1,Math.round(r.width*devicePixelRatio));c.height=Math.max(1,Math.round(r.height*devicePixelRatio));c.style.width=r.width+'px';c.style.height=r.height+'px'});drawOverlay()}
  window.addEventListener('resize',resize);

  function effectiveDirection(){
    const q=$('quarterInput').value;
    let dir=$('q1DirectionInput').value;
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
      if(profile.crop) crop=profile.crop;if(profile.offenseSample) offenseSample=profile.offenseSample;
    }catch(e){if(e.name!=='NotAllowedError')alert('Unable to share film: '+e.message)}
  }
  function stop(){if(stream)stream.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;setEnabled(false);$('emptyState').style.display='flex';$('sourceDot').classList.remove('live');$('sourceStatus').textContent='No film source shared';$('sourceDetail').textContent='Choose the Hudl tab, window, or monitor.';$('modePill').textContent='IDLE'}
  function drawFrame(){
    const cw=frameCanvas.width,ch=frameCanvas.height;fctx.clearRect(0,0,cw,ch);if(!video.videoWidth)return;
    const scale=Math.min(cw/video.videoWidth,ch/video.videoHeight),w=video.videoWidth*scale,h=video.videoHeight*scale,x=(cw-w)/2,y=(ch-h)/2;fctx.drawImage(video,x,y,w,h);
  }
  function freeze(){drawFrame();frozen=true;ball=null;detections=[];analysis=null;$('modePill').textContent='PRE-SNAP FROZEN';$('ballModeBtn').disabled=false;$('readyBtn').disabled=true;$('savePlayBtn').disabled=true;mode='ball';stage.className='fa-stage ball-mode';$('stageHint').textContent='Click the football. The ball becomes the line-of-scrimmage anchor.';drawOverlay();renderAnalysis()}
  function pt(e){const r=overlay.getBoundingClientRect();return{x:(e.clientX-r.left)/r.width,y:(e.clientY-r.top)/r.height}}
  function cssPoint(p){return{x:p.x*overlay.width/devicePixelRatio,y:p.y*overlay.height/devicePixelRatio}}
  function drawOverlay(){
    const w=overlay.width,h=overlay.height;octx.clearRect(0,0,w,h);octx.save();octx.scale(devicePixelRatio,devicePixelRatio);const cw=w/devicePixelRatio,ch=h/devicePixelRatio;
    if(crop){const a={x:crop.a.x*cw,y:crop.a.y*ch},b={x:crop.b.x*cw,y:crop.b.y*ch};octx.fillStyle='rgba(0,0,0,.38)';octx.fillRect(0,0,cw,ch);octx.clearRect(Math.min(a.x,b.x),Math.min(a.y,b.y),Math.abs(b.x-a.x),Math.abs(b.y-a.y));octx.strokeStyle='#4aa3ff';octx.lineWidth=2;octx.strokeRect(Math.min(a.x,b.x),Math.min(a.y,b.y),Math.abs(b.x-a.x),Math.abs(b.y-a.y))}
    if(ball){const q={x:ball.x*cw,y:ball.y*ch};octx.strokeStyle='#ffc857';octx.lineWidth=2;octx.beginPath();octx.moveTo(q.x,q.y-28);octx.lineTo(q.x,q.y+28);octx.stroke();octx.beginPath();octx.arc(q.x,q.y,9,0,Math.PI*2);octx.fillStyle='#ffc857';octx.fill();octx.strokeStyle='#fff';octx.stroke();octx.fillStyle='#fff';octx.font='bold 11px sans-serif';octx.fillText('BALL / LOS',q.x+12,q.y-12)}
    detections.forEach((d,i)=>{const x=d.x*cw,y=d.y*ch,bw=d.w*cw,bh=d.h*ch;octx.strokeStyle=d.role?'#35d07f':'#4aa3ff';octx.lineWidth=2;octx.strokeRect(x,y,bw,bh);octx.fillStyle='rgba(3,12,22,.78)';octx.fillRect(x,y-17,Math.max(36,(d.role||'P'+(i+1)).length*8),17);octx.fillStyle='#fff';octx.font='bold 10px sans-serif';octx.fillText(d.role||('P'+(i+1)),x+4,y-5)});
    octx.restore();
  }

  overlay.addEventListener('mousedown',e=>{
    if(!frozen&&mode!=='crop')return;const p=pt(e);
    if(mode==='ball'){ball=p;mode='idle';stage.className='fa-stage';$('readyBtn').disabled=false;$('modePill').textContent='BALL MARKED';$('stageHint').textContent='Press Ready — analyze. Move the ball by clicking Mark ball again.';drawOverlay();return}
    if(mode==='sample'){offenseSample=sampleColor(p);profile.offenseSample=offenseSample;save(PROFILE,profile);mode='idle';stage.className='fa-stage';$('modePill').textContent='OFFENSE COLOR SAVED';$('stageHint').textContent='Offense jersey color sampled once. Re-sample only when uniforms or lighting change.';return}
    if(mode==='crop'){cropStart=p;crop={a:p,b:p};drawOverlay()}
  });
  overlay.addEventListener('mousemove',e=>{if(mode==='crop'&&cropStart){crop.b=pt(e);drawOverlay()}});
  overlay.addEventListener('mouseup',()=>{if(mode==='crop'&&cropStart){cropStart=null;mode='idle';stage.className='fa-stage';profile.crop=crop;save(PROFILE,profile);$('modePill').textContent='CROP SAVED';$('stageHint').textContent='Video crop saved and reused for later plays.'}});

  function sampleColor(p){const x=Math.round(p.x*frameCanvas.width),y=Math.round(p.y*frameCanvas.height),r=5;const data=fctx.getImageData(Math.max(0,x-r),Math.max(0,y-r),r*2+1,r*2+1).data;let R=0,G=0,B=0,n=0;for(let i=0;i<data.length;i+=4){R+=data[i];G+=data[i+1];B+=data[i+2];n++}return{r:R/n,g:G/n,b:B/n}}
  function colorDistance(r,g,b,s){return Math.sqrt((r-s.r)**2+(g-s.g)**2+(b-s.b)**2)}

  function detectPlayers(){
    if(!ball)return[];
    const W=frameCanvas.width,H=frameCanvas.height,img=fctx.getImageData(0,0,W,H),data=img.data;
    const c=crop||{a:{x:.03,y:.03},b:{x:.97,y:.97}};
    const x0=Math.max(0,Math.floor(Math.min(c.a.x,c.b.x)*W)),x1=Math.min(W,Math.ceil(Math.max(c.a.x,c.b.x)*W));
    const y0=Math.max(0,Math.floor(Math.min(c.a.y,c.b.y)*H)),y1=Math.min(H,Math.ceil(Math.max(c.a.y,c.b.y)*H));
    const step=Math.max(3,Math.round(W/420));
    const cols=Math.ceil((x1-x0)/step),rows=Math.ceil((y1-y0)/step),mask=new Uint8Array(cols*rows);
    const target=offenseSample||sampleColor(ball);
    for(let gy=0;gy<rows;gy++)for(let gx=0;gx<cols;gx++){
      const x=x0+gx*step,y=y0+gy*step,idx=(y*W+x)*4;const r=data[idx],g=data[idx+1],b=data[idx+2];
      const bright=(r+g+b)/3;const dist=colorDistance(r,g,b,target);
      if(dist<78&&bright>28)mask[gy*cols+gx]=1;
    }
    const seen=new Uint8Array(mask.length),boxes=[];
    for(let i=0;i<mask.length;i++){
      if(!mask[i]||seen[i])continue;const q=[i];seen[i]=1;let minx=1e9,maxx=0,miny=1e9,maxy=0,count=0;
      while(q.length){const v=q.pop(),gx=v%cols,gy=Math.floor(v/cols);minx=Math.min(minx,gx);maxx=Math.max(maxx,gx);miny=Math.min(miny,gy);maxy=Math.max(maxy,gy);count++;for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=gx+dx,ny=gy+dy;if(nx>=0&&ny>=0&&nx<cols&&ny<rows){const ni=ny*cols+nx;if(mask[ni]&&!seen[ni]){seen[ni]=1;q.push(ni)}}}}
      const bw=(maxx-minx+1)*step,bh=(maxy-miny+1)*step;
      if(count>=4&&bw>3&&bh>5&&bw<W*.09&&bh<H*.2){boxes.push({x:(x0+minx*step)/W,y:(y0+miny*step)/H,w:bw/W,h:bh/H,score:Math.min(1,count/24)})}
    }
    const bx=ball.x,dir=effectiveDirection();
    return boxes.filter(b=>{const cx=b.x+b.w/2,cy=b.y+b.h/2;const behind=dir==='ltr'?cx<bx+.055:cx>bx-.055;return behind&&Math.abs(cx-bx)<.45&&Math.abs(cy-ball.y)<.42}).sort((a,b)=>b.score-a.score).slice(0,14);
  }

  function classify(boxes){
    const dir=effectiveDirection(),bx=ball.x,by=ball.y;
    const players=boxes.map(b=>({...b,cx:b.x+b.w/2,cy:b.y+b.h/2,depth:dir==='ltr'?bx-(b.x+b.w/2):(b.x+b.w/2)-bx,lateral:(b.y+b.h/2)-by}));
    const line=players.filter(p=>Math.abs(p.depth)<.07).sort((a,b)=>a.lateral-b.lateral);
    const backfield=players.filter(p=>p.depth>=.06&&Math.abs(p.lateral)<.26).sort((a,b)=>a.depth-b.depth);
    const wide=players.filter(p=>Math.abs(p.lateral)>.12||p.depth<.025).sort((a,b)=>a.lateral-b.lateral);
    line.slice(0,7).forEach((p,i)=>p.role=['LT','LG','C','RG','RT','TE','TE2'][i]||'OL');
    if(backfield[0])backfield[0].role='QB';if(backfield[1])backfield[1].role='RB';if(backfield[2])backfield[2].role='RB2';
    wide.filter(p=>!p.role).forEach((p,i)=>p.role='WR'+(i+1));
    const left=wide.filter(p=>p.lateral<-.08).length,right=wide.filter(p=>p.lateral>.08).length;
    const teCount=line.filter(p=>p.role?.startsWith('TE')).length;
    const rbCount=Math.max(0,backfield.length-1);
    let personnel='';if(rbCount===0)personnel='Empty';else if(rbCount===1)personnel=`1${Math.min(3,teCount)}`;else personnel=`2${Math.min(2,teCount)}`;
    let formation='Balanced';if(left>=3&&right<=1)formation='Trips Left';else if(right>=3&&left<=1)formation='Trips Right';else if(left===2&&right===2)formation='Doubles';else if(rbCount===0)formation='Empty';else if(Math.max(left,right)>=2)formation=(right>left?'Spread Right':'Spread Left');
    const confidence=Math.max(.22,Math.min(.9,(boxes.length/11)*.58+(offenseSample?.r!=null?.18:0)+(line.length>=4?.12:0)));
    const tells=[];
    if(wide.length){const depths=wide.map(p=>p.depth);const spread=Math.max(...depths)-Math.min(...depths);if(spread>.055)tells.push('Receiver depths are uneven; review the deepest off-ball receiver.');}
    if(line.length>=5){const gaps=[];for(let i=1;i<line.length;i++)gaps.push(Math.abs(line[i].lateral-line[i-1].lateral));const max=Math.max(...gaps),avg=gaps.reduce((a,b)=>a+b,0)/gaps.length;if(max>avg*1.45)tells.push('One offensive-line split appears noticeably wider than the others.');}
    return {players,formation,personnel,counts:{detected:boxes.length,line:line.length,backfield:backfield.length,wide:wide.length,left,right},confidence,tells};
  }

  function analyze(){
    if(!frozen||!ball)return;
    $('analysisStatus').textContent='Analyzing…';$('modePill').textContent='ANALYZING';
    setTimeout(()=>{
      detections=detectPlayers();analysis=classify(detections);detections=analysis.players;
      $('formationInput').value=analysis.formation;$('personnelInput').value=analysis.personnel;
      $('analysisStatus').textContent=Math.round(analysis.confidence*100)+'% confidence';$('savePlayBtn').disabled=false;$('modePill').textContent='REVIEW';drawOverlay();renderAnalysis();
      $('stageHint').textContent='Review the suggested formation and personnel. Correct only what is wrong, then save.';
    },30);
  }
  function renderAnalysis(){
    const box=$('analysisResults');if(!analysis){box.innerHTML='<div class="fa-empty-list">Freeze a frame, mark the football, and press Ready.</div>';return}
    const pct=Math.round(analysis.confidence*100);const cls=pct>=70?'':pct>=45?'low':'bad';
    const rows=[['Formation',analysis.formation,pct],['Personnel',analysis.personnel||'Unknown',Math.max(20,pct-8)],['Offensive players found',analysis.counts.detected,Math.min(95,pct+5)],['Likely OL / attached',analysis.counts.line,Math.max(20,pct-5)],['Backfield bodies',analysis.counts.backfield,Math.max(20,pct-10)]];
    box.innerHTML=rows.map(r=>`<div class="fa-analysis-item ${cls}"><span>${escapeHtml(r[0])}</span><strong>${escapeHtml(r[1])}</strong><em>${Math.round(r[2])}%</em></div>`).join('')+(analysis.tells.length?`<div class="fa-confidence-note"><strong>Possible alignment tells</strong><br>${analysis.tells.map(escapeHtml).join('<br>')}</div>`:'');
  }

  function resetPlay(){ball=null;detections=[];analysis=null;frozen=false;mode='idle';stage.className='fa-stage';fctx.clearRect(0,0,frameCanvas.width,frameCanvas.height);drawOverlay();$('ballModeBtn').disabled=true;$('readyBtn').disabled=true;$('savePlayBtn').disabled=true;$('formationInput').value='';$('personnelInput').value='';$('playTypeInput').value='';$('playDirectionInput').value='';$('conceptInput').value='';$('notesInput').value='';$('analysisStatus').textContent='Waiting';$('modePill').textContent=stream?'LIVE':'IDLE';renderAnalysis()}
  function savePlay(){
    if(!analysis||!ball)return;
    const item={id:crypto.randomUUID?.()||String(Date.now()),createdAt:new Date().toISOString(),opponent:$('opponentInput').value.trim(),quarter:$('quarterInput').value,q1Direction:$('q1DirectionInput').value,effectiveDirection:effectiveDirection(),directionOverride,angle:$('angleInput').value,crop,ball,offenseSample,detections,auto:{formation:analysis.formation,personnel:analysis.personnel,confidence:analysis.confidence,counts:analysis.counts,tells:analysis.tells},labels:{formation:$('formationInput').value.trim(),personnel:$('personnelInput').value,playType:$('playTypeInput').value,direction:$('playDirectionInput').value,concept:$('conceptInput').value.trim(),notes:$('notesInput').value.trim()},presnap:frameCanvas.toDataURL('image/jpeg',.72)};
    dataset.push(item);save(STORE,dataset);renderDataset();resetPlay();$('stageHint').textContent='Play saved. Pause the next pre-snap frame and repeat: Freeze → Mark ball → Ready.';
  }
  function renderDataset(){
    $('datasetCount').textContent=dataset.length+' play'+(dataset.length===1?'':'s');const body=$('datasetBody');body.innerHTML='';dataset.slice().reverse().forEach((p,ri)=>{const idx=dataset.length-1-ri;const tr=document.createElement('tr');tr.innerHTML=`<td>${idx+1}</td><td>${escapeHtml(p.quarter)}</td><td>${p.effectiveDirection==='ltr'?'L → R':'R → L'}</td><td>${escapeHtml(p.labels.formation||p.auto.formation)}</td><td>${escapeHtml(p.labels.personnel||p.auto.personnel||'—')}</td><td>${Math.round((p.auto.confidence||0)*100)}%</td><td><button class="fa-btn fa-small" data-delete="${idx}">Delete</button></td>`;body.appendChild(tr)});body.querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>{dataset.splice(Number(b.dataset.delete),1);save(STORE,dataset);renderDataset()})
  }
  function exportFile(name,type,text){const blob=new Blob([text],{type}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
  function csvEscape(v){const s=String(v??'');return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s}
  function exportCsv(){const rows=[['createdAt','opponent','quarter','effectiveDirection','autoFormation','finalFormation','autoPersonnel','finalPersonnel','confidence','detectedPlayers','playType','playDirection','concept','notes']];dataset.forEach(p=>rows.push([p.createdAt,p.opponent,p.quarter,p.effectiveDirection,p.auto.formation,p.labels.formation,p.auto.personnel,p.labels.personnel,p.auto.confidence,p.auto.counts?.detected,p.labels.playType,p.labels.direction,p.labels.concept,p.labels.notes]));exportFile('film-analyst-ball-anchor.csv','text/csv',rows.map(r=>r.map(csvEscape).join(',')).join('\n'))}

  $('shareBtn').onclick=share;$('stopShareBtn').onclick=stop;$('freezeBtn').onclick=freeze;$('ballModeBtn').onclick=()=>{if(frozen){mode='ball';stage.className='fa-stage ball-mode';$('stageHint').textContent='Click the football.'}};$('readyBtn').onclick=analyze;$('sampleOffenseBtn').onclick=()=>{if(!frozen){alert('Freeze a pre-snap frame first.');return}mode='sample';stage.className='fa-stage sample-mode';$('stageHint').textContent='Click the middle of an offensive player’s jersey. Do this once per uniform/lighting setup.'};$('cropModeBtn').onclick=()=>{mode='crop';stage.className='fa-stage crop-mode';$('stageHint').textContent='Drag around the football video. This crop is saved and reused.'};$('resetPlayBtn').onclick=resetPlay;$('savePlayBtn').onclick=savePlay;
  $('quarterInput').onchange=()=>{directionOverride=false;renderDirection()};$('q1DirectionInput').onchange=()=>{directionOverride=false;renderDirection()};$('flipDirectionBtn').onclick=()=>{directionOverride=!directionOverride;renderDirection()};
  $('exportJsonBtn').onclick=()=>exportFile('film-analyst-ball-anchor.json','application/json',JSON.stringify({version:2,exportedAt:new Date().toISOString(),plays:dataset},null,2));$('exportCsvBtn').onclick=exportCsv;$('clearDatasetBtn').onclick=()=>{if(confirm('Delete all saved Ball Anchor examples from this browser?')){dataset=[];save(STORE,dataset);renderDataset()}};
  renderDirection();renderDataset();resize();
})();
