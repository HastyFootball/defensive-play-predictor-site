(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const STORAGE_KEY = 'dpp_v4';
  const SETTINGS_KEY = 'dpp_camera_assist_settings_v1';
  const SESSION_KEY = 'dpp_camera_assist_session_v1';
  const DEFAULT_CONCEPTS = [
    ['Inside Zone','Run'],['Outside Zone','Run'],['Power','Run'],['Counter','Run'],['Dive','Run'],['Trap','Run'],['Sweep','Run'],['Jet Sweep','Run'],['QB Run','Run'],['Draw','Run'],['Option','Run'],
    ['Quick Pass','Pass'],['Medium Pass','Pass'],['Deep Pass','Pass'],['Play Action','Pass'],['Boot','Pass'],['Sprint Out','Pass'],['Screen','Screen'],['RPO','RPO']
  ];
  const state = {
    stream:null, recorder:null, chunks:[], lastClip:null, recording:false,
    analysisTimer:null, lastPixels:null, motion:0, fpsFrames:0, fpsStarted:performance.now(),
    autoArmed:false, playActive:false, snapAt:null, lastHighMotionAt:0, draft:null,
    recognition:null, modelResult:null, sessionEvents:loadJson(SESSION_KEY,[])
  };

  function loadJson(key, fallback){ try{return JSON.parse(localStorage.getItem(key)||'null') ?? fallback;}catch{return fallback;} }
  function saveJson(key, value){ localStorage.setItem(key, JSON.stringify(value)); }
  function getDpp(){ return loadJson(STORAGE_KEY,{live:[],film:[],active:[],customConcepts:[],customFormations:[],activeFormations:[]}); }
  function saveDpp(dpp){ localStorage.setItem(STORAGE_KEY, JSON.stringify(dpp)); }
  function esc(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
  function nowLabel(){return new Date().toLocaleTimeString([],{hour:'numeric',minute:'2-digit',second:'2-digit'});}
  function event(message, meta=''){
    state.sessionEvents.unshift({time:new Date().toISOString(),message,meta});
    state.sessionEvents=state.sessionEvents.slice(0,80); saveJson(SESSION_KEY,state.sessionEvents); renderEvents();
  }
  function renderEvents(){
    $('sessionEvents').innerHTML = state.sessionEvents.length ? state.sessionEvents.map(e=>`<div class="event-item"><time>${new Date(e.time).toLocaleTimeString([],{hour:'numeric',minute:'2-digit',second:'2-digit'})}</time><b>${esc(e.message)}</b><span>${esc(e.meta||'')}</span></div>`).join('') : '<div class="small">No camera events yet.</div>';
  }

  function concepts(){
    const dpp=getDpp(), map=new Map(DEFAULT_CONCEPTS);
    (dpp.customConcepts||[]).forEach(c=>c?.name&&map.set(c.name,c.type||'Run'));
    (dpp.film||[]).forEach(p=>{const c=p.concept||p.actual;if(c&&!map.has(c))map.set(c,p.type||p.actualPlayFamily||'Run');});
    return [...map.entries()];
  }
  function formations(){
    const dpp=getDpp(), set=new Set(['2x2','3x1','trips','bunch','ace','pistol','empty','wing','wing-t','heavy']);
    (dpp.customFormations||[]).forEach(f=>set.add(f.name||f));
    (dpp.film||[]).forEach(p=>p.formation&&set.add(p.formation)); return [...set];
  }
  function populateMenus(){
    $('draftConcept').innerHTML='<option value="">Choose concept</option>'+concepts().map(([n,t])=>`<option value="${esc(n)}" data-family="${esc(t)}">${esc(n)} · ${esc(t)}</option>`).join('');
    $('obsFormation').innerHTML=formations().map(f=>`<option>${esc(f)}</option>`).join('');
  }

  async function enumerateCameras(){
    try{
      const devices=await navigator.mediaDevices.enumerateDevices(); const cams=devices.filter(d=>d.kind==='videoinput');
      const current=$('cameraSelect').value;
      $('cameraSelect').innerHTML='<option value="">Choose camera</option>'+cams.map((d,i)=>`<option value="${d.deviceId}">${esc(d.label||`Camera ${i+1}`)}</option>`).join('');
      if(cams.some(c=>c.deviceId===current)) $('cameraSelect').value=current;
      else if(cams.length===1) $('cameraSelect').value=cams[0].deviceId;
      event('Camera list refreshed',`${cams.length} source${cams.length===1?'':'s'} found`);
    }catch(err){showError('Could not list cameras: '+err.message);}
  }

  async function startCamera(){
    if(!navigator.mediaDevices?.getUserMedia){return showError('This browser does not support camera access. Use current Chrome or Edge over HTTPS/localhost.');}
    stopCamera();
    const selected=$('cameraSelect').value;
    const constraints={audio:false,video:{deviceId:selected?{exact:selected}:undefined,width:{ideal:1920},height:{ideal:1080},frameRate:{ideal:30,max:60}}};
    try{
      state.stream=await navigator.mediaDevices.getUserMedia(constraints);
      $('cameraVideo').srcObject=state.stream; await $('cameraVideo').play();
      $('videoMessage').style.display='none'; $('cameraDot').classList.add('live'); $('cameraStatus').textContent='Camera live'; $('startCameraBtn').textContent='Restart camera';
      await enumerateCameras(); startAnalysis(); event('Camera started',trackLabel()); window.dispatchEvent(new CustomEvent('analystassist:camera-started')); window.AnalystAssistCalibration?.drawOverlay?.();
    }catch(err){showError(`Camera failed: ${err.message}. On Windows, the iPhone must first appear as a webcam device.`);}
  }
  function trackLabel(){return state.stream?.getVideoTracks()?.[0]?.label||'Video source';}
  function stopCamera(){
    clearInterval(state.analysisTimer); state.analysisTimer=null;
    if(state.stream) state.stream.getTracks().forEach(t=>t.stop()); state.stream=null;
    $('cameraVideo').srcObject=null; $('cameraDot').classList.remove('live'); $('cameraStatus').textContent='Camera stopped';
  }
  function showError(msg){$('videoMessage').style.display='grid';$('videoMessage').textContent=msg;event('Camera warning',msg);}

  function startAnalysis(){
    const video=$('cameraVideo'), canvas=$('analysisCanvas'), ctx=canvas.getContext('2d',{willReadFrequently:true});
    state.lastPixels=null; state.fpsFrames=0; state.fpsStarted=performance.now();
    state.analysisTimer=setInterval(async()=>{
      if(!video.videoWidth)return; canvas.width=160;canvas.height=90;ctx.drawImage(video,0,0,160,90);
      const img=ctx.getImageData(0,0,160,90).data; let diff=0,count=0;
      if(state.lastPixels){for(let i=0;i<img.length;i+=16){diff+=Math.abs(img[i]-state.lastPixels[i])+Math.abs(img[i+1]-state.lastPixels[i+1])+Math.abs(img[i+2]-state.lastPixels[i+2]);count+=765;}}
      state.lastPixels=new Uint8ClampedArray(img); state.motion=count?Math.min(1,diff/count*5.5):0;
      const pct=Math.round(state.motion*100);$('motionBar').style.width=pct+'%';$('motionValue').textContent=pct+'%';
      state.fpsFrames++;const elapsed=performance.now()-state.fpsStarted;if(elapsed>1000){$('cameraFps').textContent=Math.round(state.fpsFrames*1000/elapsed)+' fps analysis';state.fpsFrames=0;state.fpsStarted=performance.now();}
      autoStateMachine();
      if(window.AnalystAssistVisionModel?.analyzeFrame){
        try{state.modelResult=await window.AnalystAssistVisionModel.analyzeFrame(canvas,{motion:state.motion,playActive:state.playActive,calibration:window.AnalystAssistCalibration?.getProfile?.()||null});applyModelResult(state.modelResult);}catch(e){}
      }
    },180);
  }

  function threshold(){return Number($('motionSensitivity').value)/100;}
  function autoStateMachine(){
    if(!state.autoArmed)return;
    const high=state.motion>=threshold(), now=Date.now();
    if(high){state.lastHighMotionAt=now;if(!state.playActive){markSnap(true);}}
    const delay=Number($('autoEndDelay').value)*1000;
    if(state.playActive && state.lastHighMotionAt && now-state.lastHighMotionAt>delay && $('autoCreateDraft').checked){endPlay(true);}
  }
  function markSnap(auto=false){
    if(state.playActive)return;state.playActive=true;state.snapAt=Date.now();state.lastHighMotionAt=Date.now();
    $('markSnapBtn').classList.add('active');$('draftTiming').textContent=`Snap marked at ${nowLabel()}${auto?' automatically':''}`;
    startRecording(true);event(auto?'Auto snap detected':'Snap marked',`Motion ${Math.round(state.motion*100)}%`);
  }
  function endPlay(auto=false){
    if(!state.playActive && !state.snapAt){state.snapAt=Date.now()-5000;}
    const duration=Math.max(1,Math.round((Date.now()-(state.snapAt||Date.now()))/1000)); state.playActive=false;
    $('markSnapBtn').classList.remove('active');stopRecording(true);createDraft(duration,auto);event(auto?'Auto play end detected':'Play ended',`${duration} seconds`);
  }
  function applyModelResult(r){
    if(!r||!r.confidence){if(window.AnalystAssistCalibration?.isComplete?.()) $('observationConfidence').textContent='CALIBRATED · MANUAL';return;}
    state.modelResult=r; const obs=r.observations||{};
    const map={formation:'obsFormation',personnel:'obsPersonnel',strength:'obsStrength',hash:'obsHash',tempo:'obsTempo',star:'obsStar'};
    Object.entries(map).forEach(([k,id])=>{if(obs[k]!=null && [...$(id).options].some(o=>o.value===String(obs[k])||o.text===String(obs[k])))$(id).value=obs[k];});
    $('observationConfidence').textContent=Math.round(r.confidence*100)+'% VISION';
    const gate=window.AnalystAssistCalibration?.getProfile?.()?.confidence?.autoApply ?? .90; if(r.confidence>=gate&&$('autoApplyObservation').checked&&window.AnalystAssistCalibration?.isComplete?.()) applyObservation();
  }

  function createDraft(duration,auto){
    const pred=computePrediction(); const top=pred.top3[0];
    state.draft={createdAt:new Date().toISOString(),duration,auto,confidence:state.modelResult?.play?.confidence||0.45};
    if(state.modelResult?.play){const p=state.modelResult.play;setValue('draftConcept',p.concept);setValue('draftDirection',p.direction);setValue('draftGap',p.gap);setValue('draftResult',p.result);setValue('draftFamily',p.family);}
    else if(top){setValue('draftConcept',top.name);setValue('draftFamily',top.type);}
    $('draftSource').value=state.modelResult?.play?'camera-assisted':'manual';
    $('draftTiming').textContent=`${duration}s play · draft ready ${auto?'from auto detection':'from manual markers'}`;
    $('draftConfidence').textContent=state.modelResult?.play?`${Math.round(state.draft.confidence*100)}% VISION`:'NEEDS REVIEW';
    $('draftCard').classList.add('ready');
  }
  function discardDraft(){state.draft=null;['draftConcept','draftDirection','draftGap','draftResult'].forEach(id=>$(id).value='');$('draftCard').classList.remove('ready');$('draftConfidence').textContent='—';$('draftTiming').textContent='Waiting for a play';event('Draft discarded');}

  function currentSituation(){return {quarter:$('sitQuarter').value,down:$('sitDown').value,dist:$('sitDistance').value,zone:$('sitZone').value,personnel:$('obsPersonnel').value,formation:$('obsFormation').value,strength:$('obsStrength').value,hash:$('obsHash').value,tempo:$('obsTempo').value,star:$('obsStar').value,score:'close',phase:'normal'};}
  function familyOf(concept){return concepts().find(([n])=>n===concept)?.[1]||$('draftFamily').value||'Run';}
  function computePrediction(){
    const dpp=getDpp(), sit=currentSituation(), plays=[...(dpp.film||[]),...(dpp.live||[])];
    if(!plays.length)return {top3:[],split:{Run:.5,Pass:.5,RPO:0,Screen:0},sample:0};
    const scores=new Map();let sample=0;
    plays.forEach(p=>{
      const concept=p.concept||p.actual;if(!concept)return;let w=p.source==='live'?2.2:1;
      if(String(p.down)===String(sit.down))w*=1.7;if(p.dist===sit.dist)w*=1.6;if(p.formation===sit.formation)w*=2.4;if(p.personnel===sit.personnel)w*=1.5;if(p.zone===sit.zone)w*=1.25;if(p.hash===sit.hash)w*=1.15;
      scores.set(concept,(scores.get(concept)||0)+w);sample+=w;
    });
    let arr=[...scores].map(([name,score])=>({name,score,type:familyOf(name)})).sort((a,b)=>b.score-a.score);const total=arr.reduce((s,x)=>s+x.score,0)||1;arr=arr.map(x=>({...x,pct:x.score/total}));
    const split={Run:0,Pass:0,RPO:0,Screen:0};arr.forEach(x=>split[x.type]=(split[x.type]||0)+x.pct);return {top3:arr.slice(0,3),split,sample:Math.round(sample)};
  }
  function renderPrediction(){
    const p=computePrediction();if(!p.top3.length){$('predictionHero').innerHTML='<div class="prediction-empty">No saved film plays yet. Import film in Coach Console first.</div>';return;}
    const s=p.split, leader=Object.entries(s).sort((a,b)=>b[1]-a[1])[0];
    $('predictionHero').innerHTML=`<div class="prediction-main">${esc(leader[0].toUpperCase())} · ${Math.round(leader[1]*100)}%</div><div class="prediction-split">${['Run','Pass','RPO','Screen'].map(k=>`<div><strong>${Math.round((s[k]||0)*100)}%</strong><span>${k}</span></div>`).join('')}</div><div class="prediction-top3">${p.top3.map((x,i)=>`<span>#${i+1} ${esc(x.name)} ${Math.round(x.pct*100)}%</span>`).join('')}</div><div class="small" style="margin-top:9px">Weighted evidence: ${p.sample}</div>`;
  }
  function applyObservation(){renderPrediction();event('Observation applied',`${$('obsFormation').value} · ${$('obsPersonnel').value} personnel · ${$('obsHash').value} hash`);}

  function confirmDraft(){
    const concept=$('draftConcept').value;if(!concept)return alert('Choose the actual concept before confirming.');
    const dpp=getDpp();dpp.live=Array.isArray(dpp.live)?dpp.live:[];const pred=computePrediction(),top3=pred.top3.map(x=>x.name),actualFamily=familyOf(concept),split=pred.split,predFamily=Object.entries(split).sort((a,b)=>b[1]-a[1])[0]?.[0]||'';
    const play={id:dpp.live.length+1,...currentSituation(),predicted:top3[0]||'',top3,predictionPct:pred.top3[0]?.pct||0,predictionLead:(pred.top3[0]?.pct||0)-(pred.top3[1]?.pct||0),predictionConfidence:pred.top3[0]?.pct>.5?'High':pred.top3[0]?.pct>.3?'Medium':'Low',predictionSnapshot:pred.top3.map(x=>({name:x.name,pct:x.pct,type:x.type})),playFamilyPrediction:{Run:split.Run||0,Pass:split.Pass||0,RPO:split.RPO||0,Screen:split.Screen||0},predictedPlayFamily:predFamily,actualPlayFamily:actualFamily,playFamilyHit:predFamily===actualFamily,concept,type:actualFamily,direction:$('draftDirection').value,gap:$('draftGap').value,result:$('draftResult').value,explosive:['xp','td'].includes($('draftResult').value)?'1':'0',top1hit:top3[0]===concept,top3hit:top3.includes(concept),ts:new Date().toISOString(),source:'camera-assist',cameraAssist:{recognition:$('draftSource').value,duration:state.draft?.duration||null,visionConfidence:state.draft?.confidence||0,clipAvailable:!!state.lastClip,calibrationVersion:window.AnalystAssistCalibration?.getProfile?.()?.version||null,calibrated:!!window.AnalystAssistCalibration?.isComplete?.(),cameraLabel:window.AnalystAssistCalibration?.getProfile?.()?.cameraLabel||trackLabel()}};
    dpp.live.push(play);saveDpp(dpp);event('Play confirmed and logged',`${concept}${play.direction?' '+play.direction:''} · ${play.result||'result not set'}`);discardDraft();advanceDown(play);renderPrediction();
  }
  function advanceDown(play){
    let d=Number($('sitDown').value);if(['xp','td'].includes(play.result)){d=1;}else if(d>=4){d=1;}else d++;$('sitDown').value=String(d);
  }

  function setValue(id,v){if(v!=null&&[...$(id).options].some(o=>o.value===String(v)))$(id).value=String(v);}
  function applyPreset(name){const presets={first10:['1','long','own'],secondLong:['2','long','mid'],thirdShort:['3','short','mid'],redzone:['1','normal','rz'],goal:['1','short','gl']};const p=presets[name];if(!p)return;$('sitDown').value=p[0];$('sitDistance').value=p[1];$('sitZone').value=p[2];renderPrediction();}

  function startRecording(auto=false){
    if(state.recording||!state.stream)return;if(typeof MediaRecorder==='undefined')return;
    try{state.chunks=[];state.recorder=new MediaRecorder(state.stream,{mimeType:MediaRecorder.isTypeSupported('video/webm;codecs=vp9')?'video/webm;codecs=vp9':'video/webm'});state.recorder.ondataavailable=e=>e.data.size&&state.chunks.push(e.data);state.recorder.onstop=()=>{state.lastClip=new Blob(state.chunks,{type:state.recorder.mimeType});if(!$('keepClips').checked)state.lastClip=null;};state.recorder.start(500);state.recording=true;$('recordingBadge').classList.add('show');$('recordBtn').classList.add('active');if(!auto)event('Video recording started');}catch(err){event('Recording unavailable',err.message);}
  }
  function stopRecording(auto=false){if(!state.recording)return;state.recorder?.stop();state.recording=false;$('recordingBadge').classList.remove('show');$('recordBtn').classList.remove('active');if(!auto)event('Video recording stopped');}
  function toggleRecording(){state.recording?stopRecording():startRecording();}
  function downloadLastClip(){if(!state.lastClip)return alert('No saved clip is available yet.');const a=document.createElement('a');a.href=URL.createObjectURL(state.lastClip);a.download=`analyst-assist-${new Date().toISOString().replace(/[:.]/g,'-')}.webm`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}

  function setupVoice(){
    const SR=window.SpeechRecognition||window.webkitSpeechRecognition;if(!SR){$('speakDraftBtn').disabled=true;$('voiceLine').textContent='Voice recognition is unavailable in this browser. Chrome or Edge on the HP is recommended.';return;}
    const rec=new SR();rec.continuous=false;rec.interimResults=false;rec.lang='en-US';state.recognition=rec;
    rec.onstart=()=>{$('voiceLine').classList.add('listening');$('voiceLine').textContent='Listening… say the play, direction, and gain.';};
    rec.onend=()=>{$('voiceLine').classList.remove('listening');};rec.onerror=e=>{$('voiceLine').textContent='Voice error: '+e.error;};
    rec.onresult=e=>{const text=e.results[0][0].transcript;$('voiceLine').textContent=`Heard: “${text}”`;parseVoice(text);};
  }
  function parseVoice(text){
    const t=text.toLowerCase().replace(/^analyst[, ]*/,'');const concept=concepts().map(x=>x[0]).sort((a,b)=>b.length-a.length).find(c=>t.includes(c.toLowerCase()));if(concept){$('draftConcept').value=concept;$('draftFamily').value=familyOf(concept);}
    if(/\bleft\b/.test(t))$('draftDirection').value='L';else if(/\bright\b/.test(t))$('draftDirection').value='R';else if(/\bmiddle\b/.test(t))$('draftDirection').value='M';
    const nword={zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,fifteen:15,twenty:20};let gain=(t.match(/(?:gain|gained|for)\s+(\d+)/)||[])[1];if(gain==null){const w=Object.keys(nword).find(w=>new RegExp(`(?:gain|gained|for)\\s+${w}\\b`).test(t));if(w)gain=nword[w];}
    if(/loss|tfl|negative/.test(t))$('draftResult').value='neg';else if(gain!=null){const g=Number(gain);$('draftResult').value=g<=3?'s':g<=6?'m':g<=10?'l':'xp';}
    $('draftSource').value='voice';if(!state.draft)createDraft(0,false);event('Voice correction applied',text);
  }

  function saveSettings(){saveJson(SETTINGS_KEY,{motionSensitivity:$('motionSensitivity').value,autoEndDelay:$('autoEndDelay').value,autoCreateDraft:$('autoCreateDraft').checked,autoApplyObservation:$('autoApplyObservation').checked,keepClips:$('keepClips').checked});}
  function loadSettings(){const s=loadJson(SETTINGS_KEY,{});Object.entries(s).forEach(([k,v])=>{const el=$(k);if(!el)return;if(el.type==='checkbox')el.checked=!!v;else el.value=v;});updateSettingLabels();}
  function updateSettingLabels(){$('motionSensitivityValue').textContent=$('motionSensitivity').value;$('autoEndDelayValue').textContent=$('autoEndDelay').value+' sec';}

  function bind(){
    $('startCameraBtn').onclick=startCamera;$('refreshCamerasBtn').onclick=enumerateCameras;$('cameraSelect').onchange=startCamera;$('markSnapBtn').onclick=()=>markSnap(false);$('endPlayBtn').onclick=()=>endPlay(false);
    $('armAutoBtn').onclick=()=>{if(!state.autoArmed&&!window.AnalystAssistCalibration?.isComplete?.()){event('Auto detection blocked','Complete pregame setup first');window.AnalystAssistCalibration?.open?.();return;}state.autoArmed=!state.autoArmed;$('armAutoBtn').classList.toggle('active',state.autoArmed);event(state.autoArmed?'Auto detection armed':'Auto detection disarmed',`Threshold ${Math.round(threshold()*100)}%`);};
    $('recordBtn').onclick=toggleRecording;$('fullscreenBtn').onclick=()=>$('videoWrap').requestFullscreen?.();$('applyObservationBtn').onclick=applyObservation;$('confirmDraftBtn').onclick=confirmDraft;$('discardDraftBtn').onclick=discardDraft;$('speakDraftBtn').onclick=()=>state.recognition?.start();$('downloadClipsBtn').onclick=downloadLastClip;
    $('clearSessionBtn').onclick=()=>{state.sessionEvents=[];saveJson(SESSION_KEY,[]);renderEvents();};
    $('draftConcept').onchange=()=>{$('draftFamily').value=familyOf($('draftConcept').value);};
    document.querySelectorAll('.quick-situations button').forEach(b=>b.onclick=()=>applyPreset(b.dataset.preset));
    ['sitQuarter','sitDown','sitDistance','sitZone','obsFormation','obsPersonnel','obsStrength','obsHash','obsTempo','obsStar'].forEach(id=>$(id).addEventListener('change',renderPrediction));
    ['motionSensitivity','autoEndDelay','autoCreateDraft','autoApplyObservation','keepClips'].forEach(id=>$(id).addEventListener('input',()=>{updateSettingLabels();saveSettings();}));
    document.addEventListener('keydown',e=>{if(['INPUT','SELECT','TEXTAREA'].includes(document.activeElement.tagName))return;if(e.code==='Space'){e.preventDefault();markSnap(false);}if(e.code==='Enter'){e.preventDefault();endPlay(false);}if(e.key.toLowerCase()==='a')$('armAutoBtn').click();if(e.key.toLowerCase()==='r')toggleRecording();if(e.key.toLowerCase()==='c'&&state.draft)confirmDraft();});
    window.addEventListener('storage',e=>{if(e.key===STORAGE_KEY){populateMenus();renderPrediction();event('Coach Console data refreshed','Storage sync');}});window.addEventListener('beforeunload',stopCamera);
  }

  async function init(){populateMenus();loadSettings();bind();setupVoice();renderEvents();renderPrediction();window.AnalystAssistCalibration?.renderStatus?.();await enumerateCameras();try{await window.AnalystAssistVisionModel?.load?.();}catch{}event('Camera Assist opened','USB-first supervised mode');if(!window.AnalystAssistCalibration?.isComplete?.())setTimeout(()=>window.AnalystAssistCalibration?.open?.(0),350);}
  window.AnalystAssistCamera={trackLabel,startCamera,stopCamera,isLive:()=>!!state.stream};
  init();
})();
