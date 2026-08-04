(() => {
'use strict';
const $=id=>document.getElementById(id);
const video=$('filmVideo'),frameCanvas=$('frameCanvas'),overlay=$('overlayCanvas'),stage=$('stage');
const fctx=frameCanvas.getContext('2d',{willReadFrequently:true}),octx=overlay.getContext('2d');
const STORE='analyst_assist_film_lab_v4',PROFILE='analyst_assist_film_profile_v4';
let stream=null,model=null,modelError=null,frozen=false,mode='idle',editMode='inspect';
let ball=null,qb=null,crop=null,sidelines=[],offenseSample=null,defenseSample=null,directionOverride=false;
let people=[],analysis=null,snapFrame=null,endFrame=null,postAnalysis=null,dataset=[],profile=load(PROFILE,{}),dragStart=null;
let selectedPerson=null,boxDrag=null,editHistory=[];
let compactLabels=true,formationLocked=false;
let dbPromise=null;

function load(k,f){try{return JSON.parse(localStorage.getItem(k))||f}catch{return f}}
function persist(k,v){localStorage.setItem(k,JSON.stringify(v))}
function openFilmDb(){if(dbPromise)return dbPromise;dbPromise=new Promise((resolve,reject)=>{const req=indexedDB.open('analyst_assist_film_db',1);req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains('plays'))db.createObjectStore('plays',{keyPath:'id'})};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});return dbPromise}
async function dbAll(){const db=await openFilmDb();return await new Promise((resolve,reject)=>{const tx=db.transaction('plays','readonly'),req=tx.objectStore('plays').getAll();req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error)})}
async function dbPut(v){const db=await openFilmDb();return await new Promise((resolve,reject)=>{const tx=db.transaction('plays','readwrite');tx.objectStore('plays').put(v);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)})}
async function dbDelete(id){const db=await openFilmDb();return await new Promise((resolve,reject)=>{const tx=db.transaction('plays','readwrite');tx.objectStore('plays').delete(id);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)})}
async function dbClear(){const db=await openFilmDb();return await new Promise((resolve,reject)=>{const tx=db.transaction('plays','readwrite');tx.objectStore('plays').clear();tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)})}
async function initDataset(){try{dataset=(await dbAll()).sort((a,b)=>String(a.createdAt).localeCompare(String(b.createdAt)));const legacy=load(STORE,[]);if(legacy.length&&!dataset.length){for(const p of legacy)await dbPut(p);dataset=legacy;localStorage.removeItem(STORE)}renderDataset();renderTendencies();renderReadiness()}catch(e){console.error('Film database unavailable',e);setText('datasetCount','Storage error')}}
function esc(v){return String(v??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]))}
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function dist(a,b){return Math.hypot(a.x-b.x,a.y-b.y)}
function mean(xs){return xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:0}
function median(xs){if(!xs.length)return 0;const a=[...xs].sort((x,y)=>x-y),m=Math.floor(a.length/2);return a.length%2?a[m]:(a[m-1]+a[m])/2}
function pct(v){return `${Math.round(clamp(v,0,1)*100)}%`}
function setText(id,t){$(id).textContent=t}
function setEnabled(on){['stopShareBtn','freezeBtn','cropModeBtn','sidelineModeBtn','sampleOffenseBtn','sampleDefenseBtn','resetPlayBtn','saveProfileBtn'].forEach(id=>$(id).disabled=!on)}
function resize(){const r=stage.getBoundingClientRect(),d=devicePixelRatio||1;[frameCanvas,overlay].forEach(c=>{c.width=Math.max(1,Math.round(r.width*d));c.height=Math.max(1,Math.round(r.height*d));c.style.width=r.width+'px';c.style.height=r.height+'px'});drawOverlay()}
window.addEventListener('resize',resize);

async function loadModel(){
 try{if(!window.cocoSsd)throw new Error('Vision library did not load. Check internet access.');setText('modelStatus','Loading tiled person detector');model=await window.cocoSsd.load({base:'mobilenet_v2'});$('modelDot').classList.add('live');setText('modelStatus','Vision engine ready');setText('modelDetail','Tiled multi-scale person detection is active.');}
 catch(e){modelError=e;setText('modelStatus','Vision engine unavailable');setText('modelDetail',e.message||'Refresh while online.');}
}
function effectiveDirection(){let d=$('q1DirectionInput').value,q=$('quarterInput').value;if(q==='2'||q==='4')d=d==='ltr'?'rtl':'ltr';if(directionOverride)d=d==='ltr'?'rtl':'ltr';return d}
function renderDirection(){setText('effectiveDirection',effectiveDirection()==='ltr'?'Left to right':'Right to left')}
function applyProfile(){crop=profile.crop||null;sidelines=profile.sidelines||[];offenseSample=profile.offenseSample||null;defenseSample=profile.defenseSample||null;if(profile.angle)$('angleInput').value=profile.angle;if(profile.sideOrientation)$('sideOrientationInput').value=profile.sideOrientation;renderProfileStatus();drawOverlay()}
function profileComplete(){return !!crop&&sidelines.length===4&&!!offenseSample}
function renderProfileStatus(){const n=[crop,sidelines.length===4,offenseSample].filter(Boolean).length;if(profileComplete()){$('profileDot').classList.add('live');setText('profileStatus','Angle profile ready');setText('profileDetail','Crop, sidelines, and offense sample will be reused.')}else{$('profileDot').classList.remove('live');setText('profileStatus',`${n}/3 setup items complete`);setText('profileDetail','Set crop, two sidelines, and offense sample once.')}}

async function share(){
 try{stream=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:{ideal:30,max:60}},audio:false});video.srcObject=stream;await video.play();$('emptyState').style.display='none';$('sourceDot').classList.add('live');setText('sourceStatus','Hudl source connected');setText('sourceDetail',stream.getVideoTracks()[0]?.label||'Shared film');setText('modePill','LIVE');setEnabled(true);setTimeout(resize,150);stream.getVideoTracks()[0].addEventListener('ended',stop);applyProfile();}
 catch(e){if(e.name!=='NotAllowedError')alert(`Unable to share film: ${e.message}`)}
}
function stop(){if(stream)stream.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;setEnabled(false);$('emptyState').style.display='flex';$('sourceDot').classList.remove('live');setText('sourceStatus','No film source');setText('sourceDetail','Choose a Hudl tab, window, or monitor.');setText('modePill','IDLE')}
function drawCurrentFrame(target=frameCanvas){const c=target,ctx=c.getContext('2d',{willReadFrequently:true}),W=c.width,H=c.height;ctx.clearRect(0,0,W,H);if(!video.videoWidth)return;const s=Math.min(W/video.videoWidth,H/video.videoHeight),w=video.videoWidth*s,h=video.videoHeight*s,x=(W-w)/2,y=(H-h)/2;ctx.drawImage(video,x,y,w,h)}
function freeze(){drawCurrentFrame();frozen=true;ball=qb=null;people=[];analysis=postAnalysis=null;snapFrame=endFrame=null;mode='ball';stage.className='fil-stage ball-mode';setText('modePill','CLICK BALL');setText('stageHint','Click the football. Your click is authoritative and will never be reassigned.');$('ballModeBtn').disabled=false;$('qbModeBtn').disabled=true;$('analyzeBtn').disabled=true;$('captureSnapBtn').disabled=false;$('captureEndBtn').disabled=false;$('analyzePlayBtn').disabled=true;$('savePlayBtn').disabled=true;$('badDetectionBtn').disabled=true;$('retryDetectionBtn').disabled=true;renderAnalysis();drawOverlay()}
function point(e){const r=overlay.getBoundingClientRect();return{x:clamp((e.clientX-r.left)/r.width,0,1),y:clamp((e.clientY-r.top)/r.height,0,1)}}
function px(p){return{x:p.x*overlay.width,y:p.y*overlay.height}}
function sampleColor(p){const x=Math.round(p.x*frameCanvas.width),y=Math.round(p.y*frameCanvas.height),rad=Math.max(4,Math.round(frameCanvas.width*.005));const data=fctx.getImageData(clamp(x-rad,0,frameCanvas.width-1),clamp(y-rad,0,frameCanvas.height-1),Math.min(rad*2+1,frameCanvas.width),Math.min(rad*2+1,frameCanvas.height)).data;let r=0,g=0,b=0,n=0;for(let i=0;i<data.length;i+=4){r+=data[i];g+=data[i+1];b+=data[i+2];n++}return{r:r/n,g:g/n,b:b/n}}
function colorDistance(a,b){if(!a||!b)return 999;return Math.sqrt((a.r-b.r)**2+(a.g-b.g)**2+(a.b-b.b)**2)}
function bodyColor(box){const W=frameCanvas.width,H=frameCanvas.height,x=clamp(Math.round((box.x+box.w*.25)*W),0,W-1),y=clamp(Math.round((box.y+box.h*.12)*H),0,H-1),w=clamp(Math.round(box.w*.5*W),2,W-x),h=clamp(Math.round(box.h*.42*H),2,H-y),data=fctx.getImageData(x,y,w,h).data;let r=0,g=0,b=0,n=0;for(let i=0;i<data.length;i+=20){r+=data[i];g+=data[i+1];b+=data[i+2];n++}return n?{r:r/n,g:g/n,b:b/n}:{r:127,g:127,b:127}}
function pointInPoly(p,poly){let inside=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j],hit=((a.y>p.y)!==(b.y>p.y))&&(p.x<(b.x-a.x)*(p.y-a.y)/(b.y-a.y+1e-9)+a.x);if(hit)inside=!inside}return inside}
function insideField(p){if(sidelines.length!==4)return crop?insideRect(p,crop):true;return pointInPoly(p,sidelines)}
function insideRect(p,r){return p.x>=r.x&&p.x<=r.x+r.w&&p.y>=r.y&&p.y<=r.y+r.h}
function geometry(){if(!ball||!qb)return null;const dx=qb.x-ball.x,dy=qb.y-ball.y,d=Math.hypot(dx,dy);if(d<.008)return null;return{d,u:{x:dx/d,y:dy/d},v:{x:-dy/d,y:dx/d}}}
function lateralSign(){return $('sideOrientationInput')?.value==='swap'?-1:1}
function project(p,g){const x=p.x-ball.x,y=p.y-ball.y;return{depth:x*g.u.x+y*g.u.y,lateral:(x*g.v.x+y*g.v.y)*lateralSign()}}
function formationRoi(){const g=geometry();if(!g)return crop||{x:.05,y:.05,w:.9,h:.9};const pts=[];for(const dep of [-g.d*.8,g.d*4.2])for(const lat of [-g.d*8.5,g.d*8.5])pts.push({x:ball.x+g.u.x*dep+g.v.x*lat,y:ball.y+g.u.y*dep+g.v.y*lat});let x1=Math.min(...pts.map(p=>p.x)),y1=Math.min(...pts.map(p=>p.y)),x2=Math.max(...pts.map(p=>p.x)),y2=Math.max(...pts.map(p=>p.y));x1=clamp(x1,0,1);y1=clamp(y1,0,1);x2=clamp(x2,0,1);y2=clamp(y2,0,1);if(crop){x1=Math.max(x1,crop.x);y1=Math.max(y1,crop.y);x2=Math.min(x2,crop.x+crop.w);y2=Math.min(y2,crop.y+crop.h)}return{x:x1,y:y1,w:Math.max(.05,x2-x1),h:Math.max(.05,y2-y1)}}

function iou(a,b){const x1=Math.max(a.x,b.x),y1=Math.max(a.y,b.y),x2=Math.min(a.x+a.w,b.x+b.w),y2=Math.min(a.y+a.h,b.y+b.h),inter=Math.max(0,x2-x1)*Math.max(0,y2-y1),u=a.w*a.h+b.w*b.h-inter;return u?inter/u:0}
function nms(boxes,thr=.42){const out=[];for(const b of [...boxes].sort((a,b)=>b.score-a.score)){if(!out.some(o=>iou(o,b)>thr))out.push(b)}return out}
async function detectTile(rect,scale=1){
 const W=frameCanvas.width,H=frameCanvas.height,sx=Math.round(rect.x*W),sy=Math.round(rect.y*H),sw=Math.max(32,Math.round(rect.w*W)),sh=Math.max(32,Math.round(rect.h*H));
 const c=document.createElement('canvas');c.width=Math.min(1280,Math.max(640,Math.round(sw*scale)));c.height=Math.min(960,Math.max(480,Math.round(sh*scale)));const cctx=c.getContext('2d');cctx.drawImage(frameCanvas,sx,sy,sw,sh,0,0,c.width,c.height);
 const raw=await model.detect(c,60,.18);return raw.filter(x=>x.class==='person').map(x=>{const [bx,by,bw,bh]=x.bbox;return{x:rect.x+(bx/c.width)*rect.w,y:rect.y+(by/c.height)*rect.h,w:(bw/c.width)*rect.w,h:(bh/c.height)*rect.h,score:x.score,source:'model'}})
}
async function detectPeopleTiled(){
 if(!model)throw new Error(modelError?.message||'Vision engine is not ready.');const roi=formationRoi(),tiles=[];
 tiles.push(roi);
 const cols=3,over=.12;for(let i=0;i<cols;i++){const base=roi.w/cols,x=roi.x+Math.max(0,i*base-(i?over*base:0)),w=Math.min(roi.x+roi.w-x,base*(1+(i?over:0)+(i<cols-1?over:0)));tiles.push({x,y:roi.y,w,h:roi.h})}
 const batches=[];for(let i=0;i<tiles.length;i++){setProgress(8+Math.round((i/tiles.length)*28),`Detecting players ${i+1}/${tiles.length}`);batches.push(await detectTile(tiles[i],i===0?1.45:2.25))}
 return nms(batches.flat()).filter(b=>{const foot={x:b.x+b.w/2,y:b.y+b.h*.95};return insideField(foot)&&insideRect(foot,roi)&&b.h>.018&&b.h<.38&&b.w<.2})
}
function inferTeam(box){const c=bodyColor(box),off=colorDistance(c,offenseSample),def=colorDistance(c,defenseSample);let team='unknown',score=.3;if(offenseSample&&off<95&&(defenseSample?off+12<def:true)){team='offense';score=clamp(1-off/150,.25,1)}else if(defenseSample&&def<95){team='defense';score=clamp(1-def/150,.25,1)}return{c,team,teamScore:score,offDist:off,defDist:def}}
function roleGroup(role){
 if(['LT','LG','C','RG','RT'].includes(role))return'line';
 if(['TE','H'].includes(role))return'attached';
 if(['RB','FB'].includes(role))return'back';
 if(role&&role.startsWith('WR')||role&&role.startsWith('SLOT'))return'receiver';
 return'';
}
function setLockedRole(person,role){
 if(!person)return;
 person.manual=true;
 if(!role){person.role='';person.roleLocked=false;return}
 person.roleLocked=true;
 if(role==='OFFICIAL'){person.team='official';person.role='Official';return}
 if(role==='DEFENSE'){person.team='defense';person.role='Defense';return}
 person.team='offense';person.teamScore=1;person.role=role;
 if(role==='QB'){
  people.forEach(x=>{if(x!==person&&x.role==='QB'&&x.roleLocked){x.role='';x.roleLocked=false;x.anchor=false}});
  person.anchor=true;qb={...person.foot};
 }
}
function updateRoleControls(){
 const sel=$('positionRoleSelect'),unlock=$('unlockRoleBtn');
 if(!sel||!unlock)return;
 sel.disabled=!selectedPerson;unlock.disabled=!selectedPerson||!selectedPerson.roleLocked;
 if(!selectedPerson){sel.value='';return}
 if(selectedPerson.team==='official')sel.value='OFFICIAL';
 else if(selectedPerson.team==='defense')sel.value='DEFENSE';
 else sel.value=[...sel.options].some(o=>o.value===selectedPerson.role)?selectedPerson.role:'';
}
function chooseNearestRoleCandidate(pool,target){
 if(!pool.length)return null;
 return pool.reduce((best,p)=>!best||Math.abs(p.lateral-target)<Math.abs(best.lateral-target)?p:best,null);
}
function assignLineRoles(lineCandidates,g){
 const order=['LT','LG','C','RG','RT'];
 lineCandidates.forEach(p=>{if(!p.roleLocked&&order.includes(p.role))p.role=''});
 const locked={};for(const p of lineCandidates)if(p.roleLocked&&order.includes(p.role))locked[p.role]=p;
 const available=lineCandidates.filter(p=>!p.roleLocked&&!roleGroup(p.role));
 const sorted=[...lineCandidates].sort((a,b)=>a.lateral-b.lateral);
 const diffs=sorted.slice(1).map((p,i)=>Math.abs(p.lateral-sorted[i].lateral)).filter(x=>x>0);
 const spacing=median(diffs)||g.d*.75;
 const targets={};
 if(locked.C){targets.C=locked.C.lateral;for(let i=0;i<order.length;i++)targets[order[i]]=locked.C.lateral+(i-2)*spacing}
 else if(locked.LT&&locked.RT){for(let i=0;i<5;i++)targets[order[i]]=locked.LT.lateral+(locked.RT.lateral-locked.LT.lateral)*(i/4)}
 else {const core=sorted.slice(0,Math.min(7,sorted.length));if(core.length){const left=core[0].lateral,right=core[core.length-1].lateral;for(let i=0;i<5;i++)targets[order[i]]=left+(right-left)*(i/4)}}
 if(locked.LT&&locked.C){targets.LG=(locked.LT.lateral+locked.C.lateral)/2}
 if(locked.C&&locked.RT){targets.RG=(locked.C.lateral+locked.RT.lateral)/2}
 for(const role of order){
  if(locked[role])continue;
  const candidate=chooseNearestRoleCandidate(available,targets[role]??0);
  if(candidate){candidate.role=role;available.splice(available.indexOf(candidate),1)}
 }
 return lineCandidates.filter(p=>order.includes(p.role));
}
function classifyPlayers(boxes){
 const g=geometry(),roi=formationRoi();let arr=boxes.map((b,i)=>{const foot=b.foot||{x:b.x+b.w/2,y:b.y+b.h*.94},pr=project(foot,g),locked=!!b.roleLocked,t=b.manual&&b.team?{c:b.color||bodyColor(b),team:b.team,teamScore:1,offDist:0,defDist:0}:inferTeam(b);return{...b,id:b.id||`p${Date.now()}_${i}`,foot,depth:pr.depth,lateral:pr.lateral,...t,role:b.role||'',roleLocked:locked,manual:!!b.manual}});
 // The manual QB click is absolute. A detector box may wrap it, but the anchor never moves by itself.
 let qbBox=arr.find(p=>p.anchor&&p.role==='QB')||arr.filter(p=>dist(p.foot,qb)<Math.max(g.d*.9,.035)).sort((a,b)=>dist(a.foot,qb)-dist(b.foot,qb))[0];
 if(qbBox){qbBox.role='QB';qbBox.roleLocked=true;qbBox.team='offense';qbBox.teamScore=1;qbBox.anchor=true;qbBox.foot={...qb};qbBox.depth=g.d;qbBox.lateral=0}else{qbBox={id:'qb_anchor',x:qb.x-.012,y:qb.y-.035,w:.024,h:.07,foot:{...qb},depth:g.d,lateral:0,team:'offense',teamScore:1,role:'QB',roleLocked:true,manual:true,anchor:true,score:1};arr.push(qbBox)}
 arr.forEach(p=>{if(p===qbBox)return;const geo=(p.depth>=-g.d*.65&&p.depth<=g.d*3.8&&Math.abs(p.lateral)<=g.d*8)?1:0,nearLine=Math.abs(p.depth)<=g.d*.7?1:0,offColor=p.team==='offense'?1:p.team==='defense'?0:.35;p.offenseLikelihood=.34*(p.score||.5)+.32*offColor+.2*geo+.14*nearLine;if(p.team==='defense'||p.team==='official')p.offenseLikelihood-=.45});
 const lockedOffense=arr.filter(p=>p===qbBox||(p.manual&&p.team==='offense'));
 const inferred=arr.filter(p=>!lockedOffense.includes(p)&&!p.roleLocked&&p.team!=='defense'&&p.team!=='official'&&p.offenseLikelihood>.42&&p.depth>=-g.d*.65&&p.depth<=g.d*3.8).sort((a,b)=>b.offenseLikelihood-a.offenseLikelihood);
 const likely=[...lockedOffense,...inferred].filter((p,i,a)=>a.indexOf(p)===i).slice(0,11);
 likely.forEach(p=>{if(!p.manual&&p.team!=='offense')p.team='offense'});
 // Auto roles are disposable; manually locked roles are never overwritten.
 likely.forEach(p=>{if(!p.roleLocked&&p!==qbBox)p.role=''});
 const lockedLine=likely.filter(p=>p.roleLocked&&roleGroup(p.role)==='line');
 const autoLine=likely.filter(p=>p!==qbBox&&!p.roleLocked&&Math.abs(p.depth)<=g.d*.72).sort((a,b)=>Math.abs(a.lateral)-Math.abs(b.lateral)).slice(0,7);
 const lineCandidates=[...lockedLine,...autoLine].filter((p,i,a)=>a.indexOf(p)===i);
 const five=assignLineRoles(lineCandidates,g);
 const lockedAttached=likely.filter(p=>p.roleLocked&&roleGroup(p.role)==='attached');
 const lockedBacks=likely.filter(p=>p.roleLocked&&roleGroup(p.role)==='back');
 const lockedReceivers=likely.filter(p=>p.roleLocked&&roleGroup(p.role)==='receiver');
 const assigned=new Set([qbBox,...five,...lockedAttached,...lockedBacks,...lockedReceivers]);
 const remaining=likely.filter(p=>!assigned.has(p)&&!p.roleLocked);
 const attached=remaining.filter(p=>Math.abs(p.depth)<=g.d*.85&&Math.abs(p.lateral)>g.d*2.2).sort((a,b)=>Math.abs(a.lateral)-Math.abs(b.lateral)).slice(0,2);attached.forEach((p,i)=>p.role=i?'TE2':'TE');
 attached.forEach(p=>assigned.add(p));
 const backs=remaining.filter(p=>!assigned.has(p)&&p.depth>g.d*.48&&p.depth<g.d*3.2&&Math.abs(p.lateral)<g.d*3.3).sort((a,b)=>a.depth-b.depth);backs.forEach((p,i)=>p.role=i?'RB2':'RB');backs.forEach(p=>assigned.add(p));
 const rec=remaining.filter(p=>!assigned.has(p)).sort((a,b)=>a.lateral-b.lateral);rec.forEach((p,i)=>p.role=`WR${i+1}`);
 return{all:arr,offense:likely,qb:qbBox,line:five,attached:[...lockedAttached,...attached],backs:[...lockedBacks,...backs],receivers:[...lockedReceivers,...rec],roi};
}
function qbShell(g){const ratio=g.d/Math.max(.001,median(people.filter(p=>p.team==='offense'&&p.role&&p.role!=='QB').map(p=>p.h))||.06);if(ratio<.55)return'Under Center';if(ratio<1.2)return'Pistol';return'Shotgun'}
function formationAndPersonnel(c){
 const rec=c.receivers,left=rec.filter(p=>p.lateral<0).length,right=rec.filter(p=>p.lateral>=0).length,rb=Math.min(2,c.backs.length),te=Math.min(3,c.attached.length);let formation='Unknown';
 if(rb===0&&rec.length>=4)formation='Empty';else if(right>=3&&left<=1)formation='Trips Right';else if(left>=3&&right<=1)formation='Trips Left';else if(right===2&&left===2)formation='Doubles';else if(right>left)formation='Spread Right';else if(left>right)formation='Spread Left';
 let personnel=rb===0?'Empty':`${rb}${te}`;if(personnel==='10'&&c.offense.length<9)personnel='Unknown';
 const alternatives=[];if(formation.includes('Trips'))alternatives.push(formation.replace('Trips','Trey'),formation.replace('Trips','Spread'));else if(formation==='Doubles')alternatives.push('2x2 Spread','Ace');else if(formation==='Empty')alternatives.push('3x2 Empty','Quads');else alternatives.push('Doubles','Trips Right','Trips Left');
 return{formation,personnel,left,right,alternatives:[...new Set(alternatives)]}
}
function computeMetrics(c,g){const m={};const byRole=r=>c.offense.find(p=>p.role===r);for(const [a,b,key] of [['LT','LG','ltLg'],['LG','C','lgC'],['C','RG','cRg'],['RG','RT','rgRt']]){const x=byRole(a),y=byRole(b);if(x&&y)m[key]=Math.abs(x.lateral-y.lateral)/g.d}m.qbDepth=1;m.rbDepth=c.backs.length?mean(c.backs.map(p=>p.depth/g.d)):null;m.formationWidth=c.receivers.length>1?(Math.max(...c.receivers.map(p=>p.lateral))-Math.min(...c.receivers.map(p=>p.lateral)))/g.d:null;m.receiverDepths=c.receivers.map(p=>p.depth/g.d);m.receiverLaterals=c.receivers.map(p=>p.lateral/g.d);return m}
function baselineFor(opponent){return dataset.filter(p=>!opponent||p.opponent===opponent).filter(p=>p.metrics)}
function detectTells(metrics,labels={}){const base=baselineFor($('opponentInput').value.trim()),tells=[];if(base.length<4)return tells;const compare=(key,label,threshold=.22)=>{if(metrics[key]==null)return;const vals=base.map(p=>p.metrics[key]).filter(v=>Number.isFinite(v));if(vals.length<4)return;const med=median(vals),delta=(metrics[key]-med)/(Math.abs(med)||1);if(Math.abs(delta)>=threshold)tells.push(`${label} is ${Math.round(Math.abs(delta)*100)}% ${delta>0?'wider/deeper':'tighter/shallower'} than this opponent’s baseline (${vals.length} plays).`)};compare('ltLg','LT split',.24);compare('rgRt','RT split',.24);compare('rbDepth','RB depth',.2);compare('formationWidth','Formation width',.18);return tells}
function sanity(c,g,fp){const s=[];if(c.offense.length<8)s.push(`Only ${c.offense.length} likely offensive players were resolved.`);if(c.offense.length>11)s.push('More than 11 offensive players were proposed.');if(c.line.length<4)s.push(`Only ${c.line.length} likely core linemen were resolved.`);if(c.backs.length>3)s.push(`${c.backs.length} backfield bodies is not believable.`);if(!c.qb.anchor)s.push('QB anchor was not preserved.');if(fp.personnel==='Unknown')s.push('Personnel is unresolved.');if(sidelines.length!==4)s.push('Field mask is incomplete.');return s}
function confidence(c,s){let v=.18;v+=Math.min(c.offense.length,11)/11*.28;v+=Math.min(c.line.length,5)/5*.25;v+=c.qb?.anchor?.12:0;v+=profileComplete()?.12:0;v+=offenseSample?.08:0;v-=s.length*.1;return clamp(v,.03,.96)}
function setProgress(n,text){$('analysisProgress').style.width=`${clamp(n,0,100)}%`;setText('analysisStatus',text||`${n}%`);const idx=Math.min(6,Math.max(1,Math.ceil(n/16.7)));document.querySelectorAll('[data-stage-tab]').forEach(b=>{const k=+b.dataset.stageTab;b.classList.toggle('active',k===idx);b.classList.toggle('complete',k<idx)})}
async function analyzePreSnap(){
 if(!ball||!qb)return alert('Mark the ball and quarterback first.');if(!model)return alert(modelError?.message||'Vision engine is not ready.');
 try{$('analyzeBtn').disabled=true;setText('modePill','ANALYZING');setProgress(3,'Preparing crop');
  const boxes=await detectPeopleTiled();setProgress(42,'Separating offense');const c=classifyPlayers(boxes);people=c.all;setProgress(58,'Assigning roles');const g=geometry(),fp=formationAndPersonnel(c),metrics=computeMetrics(c,g);setProgress(72,'Classifying formation');const tells=detectTells(metrics),s=sanity(c,g,fp),conf=confidence(c,s),shell=qbShell(g);
  analysis={formation:s.length>=4?'Detection incomplete':fp.formation,personnel:fp.personnel,alternatives:fp.alternatives,shell,confidence:conf,rejected:s.length>=4,counts:{detected:boxes.length,offense:c.offense.length,line:c.line.length,backs:c.backs.length,receivers:c.receivers.length},sanity:s,tells,metrics,roi:c.roi};
  setProgress(100,analysis.rejected?'Review required':'Pre-snap ready');setText('modePill',analysis.rejected?'REVIEW REQUIRED':'PRE-SNAP READY');$('qualityBadge').textContent=`Detection ${pct(conf)}`;$('qualityBadge').style.color=conf>=.7?'var(--fil-green)':conf>=.45?'var(--fil-yellow)':'var(--fil-red)';if(!formationLocked){$('formationInput').value=analysis.rejected?'':analysis.formation;$('personnelInput').value=[...$('personnelInput').options].some(o=>o.value===analysis.personnel)?analysis.personnel:''}$('lockFormationBtn').disabled=false;$('savePlayBtn').disabled=false;$('badDetectionBtn').disabled=false;$('retryDetectionBtn').disabled=false;renderAnalysis();renderAlternatives();drawOverlay();setText('stageHint','Review the overlay. Remove wrong people or add missed players, then capture snap and end frames if you want concept suggestions.');
 }catch(e){console.error(e);setProgress(0,'Analysis failed');setText('modePill','ERROR');alert(`Analysis failed: ${e.message}`)}finally{$('analyzeBtn').disabled=false}
}
function snapshot(){const c=document.createElement('canvas');c.width=frameCanvas.width;c.height=frameCanvas.height;drawCurrentFrame(c);return c.toDataURL('image/jpeg',.78)}
function captureSnap(){snapFrame=snapshot();setText('modePill','SNAP CAPTURED');setText('stageHint','Advance the film to the end of the play and press Capture End.');$('analyzePlayBtn').disabled=!(snapFrame&&endFrame)}
function captureEnd(){endFrame=snapshot();setText('modePill','END CAPTURED');setText('stageHint','Press Analyze Play for run/pass, direction, and concept-family suggestions.');$('analyzePlayBtn').disabled=!(snapFrame&&endFrame)}
async function imageFromData(url){return await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=url})}
async function detectOnImageData(url){const img=await imageFromData(url),raw=await model.detect(img,50,.2);return raw.filter(x=>x.class==='person').map(x=>{const[b1,b2,b3,b4]=x.bbox;return{x:b1/img.width,y:b2/img.height,w:b3/img.width,h:b4/img.height,score:x.score}}).filter(b=>insideField({x:b.x+b.w/2,y:b.y+b.h*.95}))}
function nearestMatches(a,b){const used=new Set(),moves=[];for(const x of a){let best=null;for(let i=0;i<b.length;i++){if(used.has(i))continue;const y=b[i],d=dist({x:x.x+x.w/2,y:x.y+x.h*.9},{x:y.x+y.w/2,y:y.y+y.h*.9});if(!best||d<best.d)best={i,y,d}}if(best&&best.d<.15){used.add(best.i);moves.push({from:x,to:best.y,dx:(best.y.x+best.y.w/2)-(x.x+x.w/2),dy:(best.y.y+best.y.h*.9)-(x.y+x.h*.9),d:best.d})}}return moves}
async function analyzePlay(){
 if(!snapFrame||!endFrame)return alert('Capture snap and end frames first.');try{setProgress(84,'Tracking post-snap movement');const a=await detectOnImageData(snapFrame),b=await detectOnImageData(endFrame),moves=nearestMatches(a,b),g=geometry();let along=0,lateral=0;if(moves.length){along=mean(moves.map(m=>m.dx*g.u.x+m.dy*g.u.y));lateral=mean(moves.map(m=>m.dx*g.v.x+m.dy*g.v.y))}
  const direction=Math.abs(lateral)<.012?'Middle':lateral<0?'Left':'Right';const spread=median(moves.map(m=>m.d));let playType='Run';if(spread>.065&&Math.abs(along)>.035)playType='Pass';if((analysis?.counts?.receivers||0)>=4&&spread>.045)playType='Pass';
  const concepts=playType==='Pass'?(Math.abs(lateral)>.025?['Screen','Quick Game','Sprint Out']:['Dropback','Quick Game','Play Action']):(Math.abs(lateral)>.025?['Outside Zone','Sweep','Counter']:['Inside Zone','Power','Duo']);
  postAnalysis={playType,direction,concepts,confidence:clamp(.32+moves.length*.035,0,.78),tracked:moves.length};$('playTypeInput').value=playType;$('playDirectionInput').value=direction;renderConceptAlternatives();setProgress(100,'Play analysis ready');setText('modePill','PLAY READ READY');setText('stageHint',`Tracked ${moves.length} bodies. Choose the correct concept or type it manually.`);renderAnalysis();
 }catch(e){console.error(e);alert(`Play analysis failed: ${e.message}`)}
}
function renderAnalysis(){const box=$('analysisResults');if(!analysis){box.innerHTML='<div class="fil-empty-list">Freeze a frame, mark the football and quarterback, then press Analyze.</div>';return}const rows=[['Stage 1 · People',analysis.counts.detected,pct(Math.min(1,analysis.counts.detected/14))],['Stage 2 · Likely offense',analysis.counts.offense,pct(Math.min(1,analysis.counts.offense/11))],['Stage 3 · Core line',analysis.counts.line,pct(Math.min(1,analysis.counts.line/5))],['Stage 4 · Formation',analysis.formation,pct(analysis.confidence)],['Personnel',analysis.personnel,pct(Math.max(.05,analysis.confidence-.08))],['QB shell',analysis.shell,pct(Math.max(.1,analysis.confidence-.05))]];if(postAnalysis){rows.push(['Stage 6 · Play type',postAnalysis.playType,pct(postAnalysis.confidence)],['Direction',postAnalysis.direction,pct(postAnalysis.confidence-.06)],['Bodies tracked',postAnalysis.tracked,pct(Math.min(1,postAnalysis.tracked/12))])}box.innerHTML=rows.map(r=>{const n=parseInt(r[2])||0,c=n<40?'bad':n<70?'warn':'';return`<div class="fil-result-row ${c}"><span>${esc(r[0])}</span><strong>${esc(r[1])}</strong><em>${esc(r[2])}</em></div>`}).join('')+(analysis.sanity.length?`<div class="fil-result-note"><strong>Football sanity checks</strong><br>${analysis.sanity.map(esc).join('<br>')}</div>`:'')+(analysis.tells.length?`<div class="fil-result-note"><strong>Stage 5 · Alignment tells</strong><br>${analysis.tells.map(esc).join('<br>')}</div>`:'')}
function renderAlternatives(){const box=$('formationAlternatives');box.innerHTML='';if(!analysis)return;[analysis.formation,...analysis.alternatives].filter((x,i,a)=>x&&x!=='Detection incomplete'&&a.indexOf(x)===i).slice(0,5).forEach(v=>{const b=document.createElement('button');b.className='fil-btn fil-tiny';b.textContent=v;b.onclick=()=>{$('formationInput').value=v};box.appendChild(b)})}
function renderConceptAlternatives(){const box=$('conceptAlternatives');box.innerHTML='';if(!postAnalysis)return;postAnalysis.concepts.forEach(v=>{const b=document.createElement('button');b.className='fil-btn fil-tiny';b.textContent=v;b.onclick=()=>{$('conceptInput').value=v};box.appendChild(b)})}

function drawOverlay(){const W=overlay.width,H=overlay.height;octx.clearRect(0,0,W,H);octx.save();octx.lineWidth=Math.max(2,W*.002);
 if(crop){octx.strokeStyle='#4da3ff';octx.strokeRect(crop.x*W,crop.y*H,crop.w*W,crop.h*H)}
 if(sidelines.length===4){octx.fillStyle='rgba(53,208,127,.06)';octx.strokeStyle='#35d07f';octx.beginPath();sidelines.forEach((p,i)=>{const q=px(p);i?octx.lineTo(q.x,q.y):octx.moveTo(q.x,q.y)});octx.closePath();octx.fill();octx.stroke()}
 const roi=ball&&qb?formationRoi():null;if(roi){octx.strokeStyle='rgba(243,197,75,.75)';octx.setLineDash([8,6]);octx.strokeRect(roi.x*W,roi.y*H,roi.w*W,roi.h*H);octx.setLineDash([])}
 drawAnchor(ball,'BALL','#ffb347');drawAnchor(qb,'QB','#b77cff');if(ball&&qb){const a=px(ball),b=px(qb);octx.strokeStyle='#b77cff';octx.setLineDash([9,6]);octx.beginPath();octx.moveTo(a.x,a.y);octx.lineTo(b.x,b.y);octx.stroke();octx.setLineDash([])}
 people.forEach(p=>{const col=p.team==='offense'?'#30d5c8':p.team==='defense'?'#ff6877':p.team==='official'?'#f3c54b':'#8699ad';const active=p===selectedPerson;octx.strokeStyle=active?'#ffffff':(p.anchor?'#b77cff':col);octx.lineWidth=active?Math.max(4,W*.003):Math.max(2,W*.002);octx.strokeRect(p.x*W,p.y*H,p.w*W,p.h*H);const rawLabel=p.role||p.team||'person',shortTeam=p.team==='offense'?'O':p.team==='defense'?'D':p.team==='official'?'REF':'?';const label=(compactLabels?(p.role||shortTeam):rawLabel)+(p.roleLocked?' 🔒':'');octx.font=`800 ${Math.max(11,W*.0095)}px system-ui`;const tw=octx.measureText(label).width+10;octx.fillStyle='rgba(2,10,19,.88)';octx.fillRect(p.x*W,p.y*H-19,tw,19);octx.fillStyle='#fff';octx.fillText(label,p.x*W+5,p.y*H-5);if(active){const hs=Math.max(8,W*.007);[[p.x,p.y],[p.x+p.w,p.y],[p.x,p.y+p.h],[p.x+p.w,p.y+p.h]].forEach(([x,y])=>{octx.fillStyle='#4da3ff';octx.fillRect(x*W-hs/2,y*H-hs/2,hs,hs)})}});octx.restore()}
function drawAnchor(p,label,color){if(!p)return;const q=px(p);octx.fillStyle=color;octx.beginPath();octx.arc(q.x,q.y,Math.max(7,overlay.width*.0065),0,Math.PI*2);octx.fill();octx.fillStyle='#fff';octx.font=`800 ${Math.max(12,overlay.width*.011)}px system-ui`;octx.fillText(label,q.x+10,q.y-8)}
function personAt(p){for(let i=people.length-1;i>=0;i--){const x=people[i];if(p.x>=x.x&&p.x<=x.x+x.w&&p.y>=x.y&&p.y<=x.y+x.h)return x}return null}
function nearestPerson(p){const direct=personAt(p);if(direct)return direct;let best=null;for(const x of people){const c={x:x.x+x.w/2,y:x.y+x.h/2},d=dist(p,c);if(!best||d<best.d)best={x,d}}return best&&best.d<.06?best.x:null}
function resizeHandle(p,b){const tol=.018,pts={nw:{x:b.x,y:b.y},ne:{x:b.x+b.w,y:b.y},sw:{x:b.x,y:b.y+b.h},se:{x:b.x+b.w,y:b.y+b.h}};let best=null;for(const [name,q] of Object.entries(pts)){const d=dist(p,q);if(!best||d<best.d)best={name,d}}return best&&best.d<tol?best.name:null}
function pushEditHistory(){editHistory.push({people:people.map(x=>({...x,foot:x.foot?{...x.foot}:null,color:x.color?{...x.color}:null})),qb:qb?{...qb}:null,selectedId:selectedPerson?.id||null});if(editHistory.length>25)editHistory.shift();$('undoEditBtn').disabled=!editHistory.length}
function undoLastEdit(){const prev=editHistory.pop();if(!prev)return;people=prev.people.map(x=>({...x,foot:x.foot?{...x.foot}:null,color:x.color?{...x.color}:null}));qb=prev.qb?{...prev.qb}:qb;selectedPerson=people.find(x=>x.id===prev.selectedId)||null;$('undoEditBtn').disabled=!editHistory.length;reclassifyAfterEdit();setText('stageHint','Last box edit undone.')}
function startBoxDrag(p,e){const target=personAt(p)||nearestPerson(p);if(!target)return false;pushEditHistory();selectedPerson=target;updateRoleControls();const handle=resizeHandle(p,target);boxDrag={target,handle:handle||'move',start:p,original:{x:target.x,y:target.y,w:target.w,h:target.h}};target.manual=true;overlay.setPointerCapture(e.pointerId);drawOverlay();return true}
function updateBoxDrag(p){if(!boxDrag)return;const {target,handle,start,original}=boxDrag,dx=p.x-start.x,dy=p.y-start.y,minW=.012,minH=.028;if(handle==='move'){target.x=clamp(original.x+dx,0,1-original.w);target.y=clamp(original.y+dy,0,1-original.h)}else{let x1=original.x,y1=original.y,x2=original.x+original.w,y2=original.y+original.h;if(handle.includes('w'))x1=clamp(original.x+dx,0,x2-minW);if(handle.includes('e'))x2=clamp(original.x+original.w+dx,x1+minW,1);if(handle.includes('n'))y1=clamp(original.y+dy,0,y2-minH);if(handle.includes('s'))y2=clamp(original.y+original.h+dy,y1+minH,1);target.x=x1;target.y=y1;target.w=x2-x1;target.h=y2-y1}target.foot={x:target.x+target.w/2,y:target.y+target.h*.94};drawOverlay()}
function finishBoxDrag(e){if(!boxDrag)return;boxDrag.target.manual=true;if(boxDrag.target.anchor){qb={...boxDrag.target.foot}}boxDrag=null;try{overlay.releasePointerCapture(e.pointerId)}catch{};reclassifyAfterEdit();setText('stageHint','Box correction saved in this play. Drag another box or press Save & Next.');}
function manualBox(p,team){return{id:`manual_${Date.now()}_${Math.random()}`,x:p.x-.012,y:p.y-.035,w:.024,h:.07,foot:{x:p.x,y:p.y+.03},score:1,source:'manual',manual:true,team,teamScore:1,role:team==='official'?'Official':team==='defense'?'Defense':'',roleLocked:team!=='offense'}}
function reclassifyAfterEdit(){if(!ball||!qb)return;const selectedId=selectedPerson?.id||null,c=classifyPlayers(people.filter(p=>!p.anchor||p.roleLocked));people=c.all;selectedPerson=people.find(p=>p.id===selectedId)||null;const g=geometry(),fp=formationAndPersonnel(c),metrics=computeMetrics(c,g),s=sanity(c,g,fp),conf=confidence(c,s);analysis={...analysis,formation:s.length>=4?'Detection incomplete':fp.formation,personnel:fp.personnel,alternatives:fp.alternatives,confidence:conf,rejected:s.length>=4,counts:{detected:people.length,offense:c.offense.length,line:c.line.length,backs:c.backs.length,receivers:c.receivers.length},sanity:s,tells:detectTells(metrics),metrics,roi:c.roi};if(!formationLocked){$('formationInput').value=analysis.rejected?'':analysis.formation;$('personnelInput').value=analysis.personnel==='Unknown'?'':analysis.personnel}renderAnalysis();renderAlternatives();drawOverlay();updateRoleControls()}

overlay.addEventListener('pointerdown',e=>{const p=point(e);if(mode==='ball'){ball=p;mode='qb';stage.className='fil-stage qb-mode';$('qbModeBtn').disabled=false;setText('modePill','CLICK QB');setText('stageHint','Click the quarterback. This exact point remains the QB.');drawOverlay();return}if(mode==='qb'){qb=p;mode='idle';stage.className='fil-stage';$('analyzeBtn').disabled=false;setText('modePill','READY');setText('stageHint','Ball and QB are locked. Press Analyze Pre-Snap.');drawOverlay();return}if(mode==='sample-offense'){offenseSample=sampleColor(p);profile.offenseSample=offenseSample;persist(PROFILE,profile);mode='idle';stage.className='fil-stage';renderProfileStatus();setText('stageHint','Offense sample saved.');return}if(mode==='sample-defense'){defenseSample=sampleColor(p);profile.defenseSample=defenseSample;persist(PROFILE,profile);mode='idle';stage.className='fil-stage';setText('stageHint','Defense sample saved.');return}if(mode==='crop'){dragStart=p;overlay.setPointerCapture(e.pointerId);return}if(mode==='sidelines'){sidelines.push(p);if(sidelines.length===4){profile.sidelines=sidelines;persist(PROFILE,profile);mode='idle';stage.className='fil-stage';renderProfileStatus();setText('stageHint','Field mask saved. Order: near-left, near-right, far-right, far-left.')}else setText('stageHint',`Click field corner ${sidelines.length+1} of 4: ${['near-left','near-right','far-right','far-left'][sidelines.length]}.`);drawOverlay();return}if(mode==='edit'){if(editMode==='move-resize'){startBoxDrag(p,e);return}if(editMode==='add-offense'||editMode==='add-defense'||editMode==='add-official'){pushEditHistory();const added=manualBox(p,editMode.replace('add-',''));people.push(added);selectedPerson=added;reclassifyAfterEdit()}else{const n=nearestPerson(p);if(!n)return;pushEditHistory();selectedPerson=n;if(editMode==='remove'){people=people.filter(x=>x!==n);selectedPerson=null;reclassifyAfterEdit()}else if(editMode==='select'){selectedPerson=n;updateRoleControls();drawOverlay();setText('stageHint',`Selected ${n.role||n.team||'box'}. Choose an exact position from the Position menu.`)}}}});
overlay.addEventListener('pointermove',e=>{const p=point(e);if(boxDrag){updateBoxDrag(p);return}if(mode==='crop'&&dragStart){crop={x:Math.min(dragStart.x,p.x),y:Math.min(dragStart.y,p.y),w:Math.abs(p.x-dragStart.x),h:Math.abs(p.y-dragStart.y)};drawOverlay()}});
overlay.addEventListener('pointerup',e=>{if(boxDrag){finishBoxDrag(e);return}if(mode==='crop'&&dragStart){dragStart=null;profile.crop=crop;persist(PROFILE,profile);mode='idle';stage.className='fil-stage';renderProfileStatus();setText('stageHint','Video crop saved.');try{overlay.releasePointerCapture(e.pointerId)}catch{}}});
overlay.addEventListener('pointercancel',e=>{if(boxDrag)finishBoxDrag(e)});

function resetPlay(){ball=qb=null;people=[];selectedPerson=null;updateRoleControls();boxDrag=null;editHistory=[];formationLocked=false;document.body.classList.remove('fil-formation-locked');if($('lockFormationBtn')){$('lockFormationBtn').disabled=true;$('lockFormationBtn').textContent='Lock Formation'};$('undoEditBtn').disabled=true;analysis=postAnalysis=null;snapFrame=endFrame=null;frozen=false;mode='idle';stage.className='fil-stage';fctx.clearRect(0,0,frameCanvas.width,frameCanvas.height);drawOverlay();['ballModeBtn','qbModeBtn','analyzeBtn','analyzePlayBtn','savePlayBtn','badDetectionBtn','retryDetectionBtn'].forEach(id=>$(id).disabled=true);$('captureSnapBtn').disabled=!stream;$('captureEndBtn').disabled=!stream;['formationInput','conceptInput','ballCarrierInput','notesInput'].forEach(id=>$(id).value='');['personnelInput','playTypeInput','playDirectionInput','resultInput'].forEach(id=>$(id).value='');$('formationAlternatives').innerHTML='';$('conceptAlternatives').innerHTML='';setProgress(0,'Waiting');setText('modePill',stream?'LIVE':'IDLE');setText('stageHint','Freeze the next pre-snap frame.');renderAnalysis()}
function item(bad=false){return{id:crypto.randomUUID?.()||String(Date.now()),createdAt:new Date().toISOString(),opponent:$('opponentInput').value.trim(),quarter:$('quarterInput').value,q1Direction:$('q1DirectionInput').value,effectiveDirection:effectiveDirection(),directionOverride,angle:$('angleInput').value,sideOrientation:$('sideOrientationInput').value,profile:{crop,sidelines,offenseSample,defenseSample,sideOrientation:$('sideOrientationInput').value},anchors:{ball,qb},detections:people.map(({color,...p})=>p),badDetection:bad,auto:analysis?{formation:analysis.formation,personnel:analysis.personnel,shell:analysis.shell,confidence:analysis.confidence,rejected:analysis.rejected,counts:analysis.counts,sanity:analysis.sanity,tells:analysis.tells}:null,metrics:analysis?.metrics||null,post:postAnalysis,labels:{formation:$('formationInput').value.trim(),personnel:$('personnelInput').value,playType:$('playTypeInput').value,direction:$('playDirectionInput').value,concept:$('conceptInput').value.trim(),ballCarrier:$('ballCarrierInput').value.trim(),result:$('resultInput').value,notes:$('notesInput').value.trim()},presnap:frameCanvas.toDataURL('image/jpeg',.72),snapFrame,endFrame}}
async function savePlay(bad=false){if(!ball||!qb)return;const record=item(bad);try{await dbPut(record);dataset.push(record);renderDataset();renderTendencies();renderReadiness();resetPlay()}catch(e){console.error(e);alert('The play could not be saved. Browser storage may be blocked or full. Export your dataset before continuing.')}}
function renderDataset(){setText('datasetCount',dataset.length);const body=$('datasetBody');body.innerHTML='';dataset.slice().reverse().forEach((p,ri)=>{const idx=dataset.length-1-ri,tr=document.createElement('tr'),formation=p.labels.formation||p.auto?.formation||'—',personnel=p.labels.personnel||p.auto?.personnel||'—',play=[p.labels.playType,p.labels.concept].filter(Boolean).join(' · ')||'—';tr.innerHTML=`<td>${idx+1}</td><td>${esc(p.quarter)}</td><td>${esc(formation)}</td><td>${esc(personnel)}</td><td>${esc(play)}</td><td>${esc(p.auto?.counts?.offense??p.auto?.counts?.validOffense??'—')}</td><td>${p.badDetection?'Bad':pct(p.auto?.confidence||0)}</td><td><button class="fil-btn fil-tiny" data-delete="${idx}">Delete</button></td>`;body.appendChild(tr)});body.querySelectorAll('[data-delete]').forEach(b=>b.onclick=async()=>{const idx=+b.dataset.delete,id=dataset[idx]?.id;if(id)await dbDelete(id);dataset.splice(idx,1);renderDataset();renderTendencies();renderReadiness()})}
function renderTendencies(){const box=$('tendencyPanel'),valid=dataset.filter(p=>!p.badDetection&&p.metrics);if(valid.length<4){box.innerHTML=`<div class="fil-empty-list">${valid.length}/4 usable plays. Save more examples to start opponent baselines.</div>`;return}const groups={};for(const p of valid){const concept=p.labels.concept||p.labels.playType||'Unlabeled';(groups[concept]??=[]).push(p)}const cards=[];for(const [name,plays] of Object.entries(groups)){if(plays.length<2)continue;const avg=k=>mean(plays.map(p=>p.metrics?.[k]).filter(Number.isFinite));const all=k=>mean(valid.map(p=>p.metrics?.[k]).filter(Number.isFinite));for(const [k,label] of [['ltLg','LT split'],['rgRt','RT split'],['rbDepth','RB depth'],['formationWidth','Formation width']]){const a=avg(k),b=all(k);if(!Number.isFinite(a)||!Number.isFinite(b)||!b)continue;const d=(a-b)/Math.abs(b);if(Math.abs(d)>.16)cards.push({title:`${name}: ${label}`,text:`${Math.round(Math.abs(d)*100)}% ${d>0?'wider/deeper':'tighter/shallower'} than the full-film baseline. Sample: ${plays.length}.`})}}box.innerHTML=cards.length?cards.slice(0,8).map(c=>`<div class="fil-tendency"><strong>${esc(c.title)}</strong><span>${esc(c.text)}</span></div>`).join(''):'<div class="fil-empty-list">No meaningful alignment differences have cleared the current sample threshold yet.</div>'}
function renderReadiness(){const good=dataset.filter(p=>!p.badDetection),labeled=good.filter(p=>p.labels.concept||p.labels.playType),clean=good.filter(p=>(p.auto?.confidence||0)>=.55),stages=[['Detection',Math.min(100,Math.round(clean.length/30*100))],['Formation',Math.min(100,Math.round(good.length/50*100))],['Concept',Math.min(100,Math.round(labeled.length/100*100))]];$('readinessPanel').innerHTML=stages.map(([n,v])=>`<div><b>${v}%</b><span>${n} dataset readiness</span></div>`).join('')}
function file(name,type,text){const blob=new Blob([text],{type}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function csv(v){const s=String(v??'');return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s}
function exportCsv(){const h=['createdAt','opponent','quarter','autoFormation','finalFormation','autoPersonnel','finalPersonnel','confidence','offenseCount','lineCount','playType','direction','concept','ballCarrier','result','badDetection','notes'],rows=[h];dataset.forEach(p=>rows.push([p.createdAt,p.opponent,p.quarter,p.auto?.formation,p.labels.formation,p.auto?.personnel,p.labels.personnel,p.auto?.confidence,p.auto?.counts?.offense,p.auto?.counts?.line,p.labels.playType,p.labels.direction,p.labels.concept,p.labels.ballCarrier,p.labels.result,p.badDetection,p.labels.notes]));file('film-intelligence-v4.csv','text/csv',rows.map(r=>r.map(csv).join(',')).join('\n'))}
function exportTraining(){const manifest={version:4,createdAt:new Date().toISOString(),classes:['offense','defense','official'],plays:dataset.map(p=>({id:p.id,image:p.presnap,anchors:p.anchors,fieldMask:p.profile.sidelines,detections:p.detections.map(d=>({bbox:[d.x,d.y,d.w,d.h],class:d.team,role:d.role,manual:d.manual,roleLocked:d.roleLocked})),labels:p.labels,badDetection:p.badDetection}))};file('film-intelligence-training-manifest-v4.json','application/json',JSON.stringify(manifest,null,2))}


function applyWorkspacePrefs(){
 const prefs=load('analyst_assist_film_workspace_v45',{stageSize:'xl',sidebarHidden:false,compactLabels:true});
 compactLabels=prefs.compactLabels!==false;
 document.body.classList.toggle('fil-sidebar-collapsed',!!prefs.sidebarHidden);
 document.body.classList.toggle('fil-compact-labels',compactLabels);
 ['large','xl','max'].forEach(v=>document.body.classList.toggle(`fil-stage-${v}`,prefs.stageSize===v));
 if($('stageSizeInput'))$('stageSizeInput').value=prefs.stageSize||'xl';
 if($('toggleSidebarBtn'))$('toggleSidebarBtn').textContent=prefs.sidebarHidden?'Show Details':'Hide Details';
 if($('compactLabelsBtn'))$('compactLabelsBtn').textContent=`Compact Labels: ${compactLabels?'On':'Off'}`;
 setTimeout(resize,30);
}
function saveWorkspacePrefs(){persist('analyst_assist_film_workspace_v45',{stageSize:$('stageSizeInput')?.value||'xl',sidebarHidden:document.body.classList.contains('fil-sidebar-collapsed'),compactLabels})}
function toggleSidebar(){document.body.classList.toggle('fil-sidebar-collapsed');$('toggleSidebarBtn').textContent=document.body.classList.contains('fil-sidebar-collapsed')?'Show Details':'Hide Details';saveWorkspacePrefs();setTimeout(resize,40)}
function toggleFocus(){document.body.classList.toggle('fil-focus-mode');$('focusModeBtn').textContent=document.body.classList.contains('fil-focus-mode')?'Exit Focus':'Focus Mode';setTimeout(resize,40)}
async function toggleFullscreenStage(){try{if(document.fullscreenElement)await document.exitFullscreen();else await stage.requestFullscreen()}catch(e){alert(`Fullscreen could not open: ${e.message}`)}setTimeout(resize,80)}
function toggleCompactLabels(){compactLabels=!compactLabels;document.body.classList.toggle('fil-compact-labels',compactLabels);$('compactLabelsBtn').textContent=`Compact Labels: ${compactLabels?'On':'Off'}`;saveWorkspacePrefs();drawOverlay()}
function toggleFormationLock(){formationLocked=!formationLocked;document.body.classList.toggle('fil-formation-locked',formationLocked);$('lockFormationBtn').textContent=formationLocked?'Unlock Formation':'Lock Formation';setText('stageHint',formationLocked?'Formation and personnel are locked. Box recalculation will not overwrite them.':'Formation unlocked. Recalculation may update formation and personnel.')}
$('shareBtn').onclick=share;$('stopShareBtn').onclick=stop;$('toggleSidebarBtn').onclick=toggleSidebar;$('focusModeBtn').onclick=toggleFocus;$('fullscreenStageBtn').onclick=toggleFullscreenStage;$('compactLabelsBtn').onclick=toggleCompactLabels;$('lockFormationBtn').onclick=toggleFormationLock;$('stageSizeInput').onchange=()=>{['large','xl','max'].forEach(v=>document.body.classList.toggle(`fil-stage-${v}`,$('stageSizeInput').value===v));saveWorkspacePrefs();setTimeout(resize,40)};document.addEventListener('fullscreenchange',()=>setTimeout(resize,80));$('freezeBtn').onclick=freeze;$('ballModeBtn').onclick=()=>{if(frozen){mode='ball';stage.className='fil-stage ball-mode';setText('stageHint','Click the football.')}};$('qbModeBtn').onclick=()=>{if(frozen&&ball){mode='qb';stage.className='fil-stage qb-mode';setText('stageHint','Click the quarterback.')}};$('analyzeBtn').onclick=analyzePreSnap;$('retryDetectionBtn').onclick=()=>{if(people.length){reclassifyAfterEdit();setText('stageHint','Positions recalculated from your locked labels. Locked positions were preserved.')}else analyzePreSnap();};$('captureSnapBtn').onclick=captureSnap;$('captureEndBtn').onclick=captureEnd;$('analyzePlayBtn').onclick=analyzePlay;$('resetPlayBtn').onclick=resetPlay;
$('cropModeBtn').onclick=()=>{mode='crop';stage.className='fil-stage crop-mode';setText('stageHint','Drag around only the football video. Exclude menus, black bars, and controls.')};
$('sidelineModeBtn').onclick=()=>{if(!frozen)return alert('Freeze a clear frame first.');sidelines=[];mode='sidelines';stage.className='fil-stage sideline-mode';setText('stageHint','Click 4 field corners: near-left, near-right, far-right, far-left.')};
$('sampleOffenseBtn').onclick=()=>{if(!frozen)return alert('Freeze a clear frame first.');mode='sample-offense';stage.className='fil-stage sample-offense-mode';setText('stageHint','Click the middle of an offensive jersey, avoiding numbers and stripes.')};
$('sampleDefenseBtn').onclick=()=>{if(!frozen)return alert('Freeze a clear frame first.');mode='sample-defense';stage.className='fil-stage sample-defense-mode';setText('stageHint','Click the middle of a defensive jersey, avoiding numbers and stripes.')};
$('positionRoleSelect').onchange=()=>{if(!selectedPerson)return;pushEditHistory();setLockedRole(selectedPerson,$('positionRoleSelect').value);reclassifyAfterEdit();setText('stageHint',$('positionRoleSelect').value?`${$('positionRoleSelect').selectedOptions[0].text} locked. Recalculation will not change it.`:'Position unlocked and returned to automatic assignment.');};
$('unlockRoleBtn').onclick=()=>{if(!selectedPerson)return;pushEditHistory();selectedPerson.roleLocked=false;if(!selectedPerson.anchor)selectedPerson.role='';reclassifyAfterEdit();setText('stageHint','Selected position unlocked and returned to automatic assignment.');};
$('saveProfileBtn').onclick=()=>{profile={crop,sidelines,offenseSample,defenseSample,angle:$('angleInput').value,sideOrientation:$('sideOrientationInput').value};persist(PROFILE,profile);renderProfileStatus();alert('Angle profile saved on this device.')};
$('quarterInput').onchange=()=>{directionOverride=false;renderDirection()};$('q1DirectionInput').onchange=()=>{directionOverride=false;renderDirection()};$('sideOrientationInput').onchange=()=>{if(analysis)reclassifyAfterEdit();drawOverlay()};$('flipDirectionBtn').onclick=()=>{directionOverride=!directionOverride;renderDirection()};
document.querySelectorAll('[data-edit-mode]').forEach(b=>b.onclick=()=>{editMode=b.dataset.editMode;document.querySelectorAll('[data-edit-mode]').forEach(x=>x.classList.toggle('active',x===b));mode='edit';stage.className='fil-stage edit-mode';if(editMode==='move-resize')setText('stageHint','Drag inside a box to move it. Drag a blue corner handle to resize it. Changes are saved with this play.');else if(editMode==='select')setText('stageHint','Click a box, then choose its exact position from the Position menu. Manual labels stay locked.');else setText('stageHint',`${b.textContent}: click the overlay.`)});
$('undoEditBtn').onclick=undoLastEdit;$('savePlayBtn').onclick=()=>savePlay(false);$('badDetectionBtn').onclick=()=>savePlay(true);$('refreshTellsBtn').onclick=renderTendencies;
$('exportJsonBtn').onclick=()=>file('film-intelligence-v4.json','application/json',JSON.stringify({version:4,exportedAt:new Date().toISOString(),profile,dataset},null,2));$('exportCsvBtn').onclick=exportCsv;$('exportTrainingBtn').onclick=exportTraining;
$('importDatasetInput').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;try{const j=JSON.parse(await f.text()),incoming=j.dataset||j.plays||[];for(const p of incoming){if(!p.id)p.id=crypto.randomUUID?.()||String(Date.now()+Math.random());await dbPut(p)}dataset=[...dataset,...incoming];renderDataset();renderTendencies();renderReadiness();alert(`Imported ${incoming.length} plays.`)}catch(err){alert(`Import failed: ${err.message}`)}e.target.value=''};
$('clearDatasetBtn').onclick=async()=>{if(confirm('Delete all Film Intelligence examples from this browser?')){await dbClear();dataset=[];renderDataset();renderTendencies();renderReadiness()}};

applyWorkspacePrefs();applyProfile();renderDirection();updateRoleControls();renderDataset();renderTendencies();renderReadiness();resize();initDataset();loadModel();
})();
