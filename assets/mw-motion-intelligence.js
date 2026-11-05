(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const token = () => window.mwGetSessionToken?.() || '';
  const coachMode = () => location.pathname.startsWith('/coach') || document.body.classList.contains('mw-hybrid-coach');
  const endpoint = () => `${window.MW_SUPABASE_URL}/functions/v1/mw-motion`;
  async function call(action, payload = {}) {
    const accessToken=token();
    if(!accessToken) throw new Error('Motion Intelligence requires an active sign-in. Please sign in again.');
    const r = await fetch(endpoint(), {method:'POST', headers:{apikey:window.MW_SUPABASE_KEY,Authorization:`Bearer ${accessToken}`,'Content-Type':'application/json'}, body:JSON.stringify({action,...payload})});
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || (r.status===401?'Motion session expired. Sign in again.':'Motion Intelligence is unavailable right now.'));
    return d;
  }
  function panel() { return $('mwMotionPanel'); }
  function renderHistory(items) {
    const box = $('mwMotionHistory'); if (!box) return;
    box.innerHTML = items?.length ? items.map(x => `<div style="padding:10px 0;border-top:1px solid #314252"><b>${esc(String(x.movement_type||'Sprint movement').replaceAll('_',' '))}</b><small style="display:block;color:#aab7c2">${esc(x.camera_view||'')} Â· ${x.status==='uploaded'?'Uploaded securely':'Draft'} Â· ${new Date(x.created_at).toLocaleDateString()}</small></div>`).join('') : '<p class="muted">No motion recordings yet.</p>';
  }
  async function loadHistory() { try { renderHistory((await call('list')).assessments || []); } catch (e) { const s=$('mwMotionStatus'); if(s) s.textContent=e.message; } }
  const angle=(a,b,c)=>{const ab=[a.x-b.x,a.y-b.y],cb=[c.x-b.x,c.y-b.y],dot=ab[0]*cb[0]+ab[1]*cb[1],den=Math.hypot(...ab)*Math.hypot(...cb);return den?Math.acos(Math.max(-1,Math.min(1,dot/den)))*180/Math.PI:null};
  const median=a=>{const x=a.filter(Number.isFinite).sort((m,n)=>m-n);return x.length?x[Math.floor(x.length/2)]:null};
  async function analyzeVideo(file, status) {
    status.textContent='Loading on-device motion modelâ¦';
    // 0.10.22 was never published to npm/jsDelivr, which made WKWebView report
    // the unhelpful "Importing a module script failed" error. Keep this pinned
    // to a real, stable package version and surface a useful fallback if the
    // device/network cannot load the model.
    const vision=await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/vision_bundle.mjs');
    const resolver=await vision.FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm');
    const landmarker=await vision.PoseLandmarker.createFromOptions(resolver,{baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',delegate:'CPU'},runningMode:'VIDEO',numPoses:1});
    const video=document.createElement('video');video.muted=true;video.playsInline=true;const objectUrl=URL.createObjectURL(file);video.src=objectUrl;
    try { await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Video could not be opened on this iPhone. Try a short MP4 recording.')),12000);video.onloadedmetadata=()=>{clearTimeout(timer);resolve();};video.onerror=()=>{clearTimeout(timer);reject(new Error('This video format could not be opened. Try MP4.'));};}); } catch(error) {landmarker.close();URL.revokeObjectURL(objectUrl);throw error;}
    const duration=Math.min(8,Number(video.duration)||0), samples=Math.max(18,Math.min(96,Math.round(duration*12)));const readings=[],tracking=[];
    if(!Number.isFinite(duration)||duration<0.2){landmarker.close();URL.revokeObjectURL(objectUrl);throw new Error('Video is too short or its duration is unavailable. Choose a short MP4 sprint recording.');}
    for(let i=0;i<samples;i++){const seekTime=Math.max(0.02,Math.min(duration-0.02,duration*(i/(samples-1))));
      await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Video frame could not be read on this device. Try a different MP4 recording.')),10000);video.onseeked=()=>{clearTimeout(timer);resolve();};video.onerror=()=>{clearTimeout(timer);reject(new Error('Video decoding failed. Try MP4.'));};video.currentTime=seekTime;});const out=landmarker.detectForVideo(video,Math.round(video.currentTime*1000)),p=out?.landmarks?.[0];if(!p)continue;
      const S={x:(p[11].x+p[12].x)/2,y:(p[11].y+p[12].y)/2},H={x:(p[23].x+p[24].x)/2,y:(p[23].y+p[24].y)/2};const side=p[25].visibility>p[26].visibility?25:26,knee=p[side],hip=p[side-2],ankle=p[side+2],elbow=p[side===25?13:14],wrist=p[side===25?15:16];
      readings.push({trunk:Math.abs(Math.atan2(S.x-H.x,H.y-S.y)*180/Math.PI),knee:angle(hip,knee,ankle),shin:Math.abs(Math.atan2(ankle.x-knee.x,knee.y-ankle.y)*180/Math.PI),arm:angle(S,elbow,wrist)});
      const tracked=window.MWMotionTracking?.frame(p,video.currentTime);if(tracked)tracking.push(tracked);
      status.textContent=`Analyzing on this iPhoneâ¦ ${i+1}/${samples}`;
    }
    landmarker.close();URL.revokeObjectURL(objectUrl);if(readings.length<5)throw Error(`Only ${readings.length} usable body-position frames were detected. This is not enough for a reliable motion read. Try a brighter, steady side-view sprint recording showing the full athlete.`);
    const values={trunk:median(readings.map(x=>x.trunk)),knee:median(readings.map(x=>x.knee)),shin:median(readings.map(x=>x.shin)),arm:median(readings.map(x=>x.arm))};
    if(![values.trunk,values.knee,values.shin].every(Number.isFinite))throw Error('The video did not contain enough clear side-on landmarks for a safe first read.');
    return {sampledFrames:samples,poseFrames:readings.length,values,frames:tracking,analyzedSeconds:duration,sourceSeconds:video.duration};
  }
  // Preliminary behind-the-scenes classification from time-ordered posture landmarks.
  // Never equate torso posture with validated sprint phase, foot contact or technique quality.
  function buildMotionReport(result) {
    const frames=(result.frames||[]).filter(f=>Number.isFinite(f.trunk));
    if(frames.length<12||frames.length/Math.max(1,result.sampledFrames)<0.65) return {phases:[],message:'Not enough continuous tracked body positions to identify sprint phases reliably. Use a steady side-view recording showing the whole runner.'};
    const section=Math.ceil(frames.length/3);
    const first=median(frames.slice(0,section).map(f=>f.trunk));
    const last=median(frames.slice(-section).map(f=>f.trunk));
    const difference=first-last,phases=[];
    if(first>=24&&difference>=12){
      phases.push({name:'Early forward-lean pattern',detail:'Greater forward lean appeared early in this clip. This may be consistent with acceleration, but a block exit is not verified.'});
      phases.push({name:'Transition toward upright posture',detail:'Forward trunk lean decreased by about '+difference.toFixed(0)+' degrees across the sampled clip. A progressive rise is not automatically a fault.'});
    }else if(first>=24&&last>=20&&Math.abs(difference)<12){
      phases.push({name:'Forward-lean posture',detail:'A forward trunk lean was visible, but the specific acceleration phases could not be separated.'});
    }else if(first<20&&last<20&&Math.abs(difference)<10){
      phases.push({name:'Mostly upright posture',detail:'The torso appeared comparatively upright. This is not proof that maximum-velocity mechanics are correct.'});
    }
    return {phases,message:phases.length?'Preliminary posture patterns, not validated sprint-phase diagnosis.':'Movement phase could not be reliably inferred from the available video.'};
  }
  function paintAnalysis(result,status){
    const box=$('mwMotionAnalysis');if(!box)return;
    const v=result.values,engine=window.MWMotionTracking?.summarize(result.frames,{sampledFrames:result.sampledFrames,cameraView:coachMode()?null:$('mwMotionView')?.value}),report=engine?{phases:engine.phases.map(p=>({name:p.name,detail:p.detail})),message:engine.quality.adequateForPosture?'Preliminary torso-posture patterns; sprint phases and ground contact remain unverified.':'Not enough continuous visible positions to make a posture assessment.'}:buildMotionReport(result);
    const angleText=n=>Number.isFinite(n)?n.toFixed(1)+' degrees':'Unavailable';
    const phaseRows=report.phases.length?report.phases.map(p=>'<div style="border-top:1px solid #314252;padding:10px 0"><b>'+esc(p.name)+'</b><p>'+esc(p.detail)+'</p></div>').join(''):'<p>No reliable phase classification from this recording.</p>';
    const coachFindings=engine?.coaching;
    const rightRows=coachFindings?.positives.length?coachFindings.positives.map(x=>'<p><b>Observed:</b> '+esc(x.evidence)+' <small>'+esc(x.meaning)+'</small></p>').join(''):'<p>There is not enough evidence yet to confirm a specific technique strength.</p>';
    const concernRows=coachFindings?.issues.length?coachFindings.issues.map(x=>'<p><b>'+esc(x.label)+':</b> '+esc(x.reason)+'</p>').join(''):'<p>No mechanics fault has been established from this video.</p>';
    const drillRows=coachFindings?.actions.length?coachFindings.actions.map(x=>'<p><b>'+esc(x.focus)+':</b> '+esc(x.instruction)+'</p>').join(''):'<p>Review a clear side-view clip with a qualified sprint coach.</p>';
    const footRows=engine?'<p>'+esc(engine.groundContact.reason)+'</p><p>Possible near-ground foot positions: '+engine.groundContact.candidateEvents.length+' (unverified).</p>':'<p>Foot event detector unavailable.</p>';
    const heelRows=engine?engine.heels.map(x=>'<p>'+esc(x.side)+' leg: '+esc(x.detail)+' '+(Number.isFinite(x.change)?'Relative heel-height trend: '+x.change.toFixed(2)+' (uncalibrated).':'')+'</p>').join(''):'<p>Heel trajectory detector unavailable.</p>';
    box.hidden=false;
    box.innerHTML='<h3>MW MOTION INTELLIGENCE - COMPLETE VIDEO REVIEW</h3>'
      +'<p>Analyzed '+result.poseFrames+' usable body-position frames from '+result.sampledFrames+' sampled frames. Measurements are experimental 2D observations.</p>'
      +'<h3>Movement phases</h3>'+phaseRows+'<p>'+esc(report.message)+'</p>'
      +'<h3>What am I doing right?</h3>'+rightRows
      +'<h3>What needs improvement?</h3>'+concernRows+'<h3>Ground-contact tracking</h3>'+footRows+'<h3>Heel-recovery tracking</h3>'+heelRows
      +'<h3>Behind-the-scenes tracking</h3><p>'+esc(engine?'Tracked '+engine.quality.usableFrames+' ordered body poses over '+engine.quality.spanSeconds.toFixed(1)+' seconds; left and right leg trajectories inspected.':'Time-ordered motion tracking is unavailable.')+'</p>'
      +'<h3>How do I improve?</h3>'+drillRows
      +'<h3>Preliminary measurements</h3><p>Trunk: '+angleText(v.trunk)+' | Knee: '+angleText(v.knee)+' | Shin: '+angleText(v.shin)+' | Arm: '+angleText(v.arm)+'</p>'
      +'<small>Exact touchdown, toe-off and contact duration are not measured. Validated high-speed foot-ground event detection is still required. '+(result.sourceSeconds>result.analyzedSeconds?'The first '+result.analyzedSeconds.toFixed(1)+' seconds of the recording were analyzed to protect iPhone performance.':'')+'</small>';
    status.textContent='One on-device review completed. No video was uploaded or stored by this analysis.';
  }
  // Coaches can only see adult-athlete observations explicitly shared with an active assigned coach.
  // The private video-upload endpoint is intentionally athlete-only and must not be exposed here.
  window.mwOpenCoachMotionIntelligence = async () => {
    // Retain the private on-device video review available to coaches, without granting cloud upload rights.
    await window.mwOpenMotionIntelligence();
    const root = panel();
    if (!root) throw new Error('Motion Intelligence screen is unavailable.');
    root.insertAdjacentHTML('beforeend','<section class="tile" aria-label="Shared Motion Intelligence" style="margin-top:14px"><h3>Shared athlete observations</h3><p>Only observations explicitly shared by eligible adult athletes with their assigned coach appear here. Private recordings are not accessible.</p><p id="mwMotionCoachStatus" role="status">Checking shared observations…</p><div id="mwMotionCoachObservations"></div><p class="muted">Measurements are experimental 2D observations, not verified biomechanics or medical advice.</p></section>');
    const status = $('mwMotionCoachStatus'), list = $('mwMotionCoachObservations');
    if (!token()) { status.textContent = 'Your Coach session has expired. Please sign in again.'; return; }
    try {
      const response = await call('coach_season');
      if (!root.isConnected) return;
      const records = Array.isArray(response.observations) ? response.observations : [];
      if (!records.length) { status.textContent = 'No motion observations have been shared with you yet.'; return; }
      status.textContent = records.length + ' shared observation' + (records.length === 1 ? '' : 's');
      list.innerHTML = records.map((item) => {
        const movement = esc(String(item.movement_type || 'Sprint movement').replaceAll('_',' '));
        const week = Number.isInteger(item.week_number) ? 'Week ' + item.week_number : 'Week not assigned';
        const date = item.observed_at || item.created_at;
        const dateText = date && Number.isFinite(Date.parse(date)) ? new Date(date).toLocaleDateString() : 'Date unavailable';
        const metrics = Array.isArray(item.metrics) ? item.metrics : [];
        const metricText = metrics.filter(m => m && Number.isFinite(Number(m.medianDegrees)) && typeof m.name === 'string').slice(0,3).map(m => '<span style="display:inline-block;margin:4px 10px 4px 0">' + esc(m.name.replaceAll('_',' ')) + ': <b>' + Number(m.medianDegrees).toFixed(1) + '°</b></span>').join('');
        return '<article class="tile" style="margin-top:12px"><h3>' + movement + '</h3><p>' + esc(week) + ' · ' + esc(dateText) + '</p><p>' + (metricText || 'Observation shared without angle metrics.') + '</p></article>';
      }).join('');
    } catch (error) {
      if (root.isConnected) status.textContent = error?.message || 'Shared observations could not be loaded. Please retry.';
    }
  };
  window.mwOpenMotionIntelligence = async () => {
    let root = panel();
    if (!root) {
      window.openView?.('pacer', true);
      await new Promise(resolve => setTimeout(resolve, 40));
      root = panel();
    }
    if (!root) return;
    root.innerHTML = `<button class="back" type="button" id="mwMotionBack" style="margin:8px 0 12px">← Back to Performance Tools</button><div class="card" style="margin-top:14px;border-color:#c89d3b"><div class="cardHead"><span>MOTION INTELLIGENCE</span><span class="smalllink">SECURE VIDEO REVIEW</span></div><h2>Show MW how you move.</h2><p class="muted">Select one sprint recording. MW will analyze the available movement patterns and present one complete review. Secure pilot uploads may require additional recording information.</p><button class="save" id="mwMotion3D" type="button" hidden>USE NATIVE 3-D CAMERA</button><label style="display:block;margin:10px 0 4px">Movement<select id="mwMotionMovement" style="width:100%;padding:12px;border-radius:10px;background:#07121b;color:#fff;border:1px solid #8b6b2c"><option value="block_start">Block start</option><option value="two_point_start">Two-point start</option><option value="three_point_start">Three-point start</option><option value="four_point_start">Four-point start</option><option value="acceleration_30m">30m acceleration</option><option value="front_side">Front-side mechanics</option><option value="wickets">Wickets</option></select></label><label style="display:block;margin:10px 0 4px">Camera view<select id="mwMotionView" style="width:100%;padding:12px;border-radius:10px;background:#07121b;color:#fff;border:1px solid #8b6b2c"><option value="side">Side</option><option value="front">Front</option><option value="rear">Rear</option></select></label><label style="display:block;margin:10px 0 4px">Sprint video<input id="mwMotionFile" type="file" accept="video/mp4,video/quicktime" style="width:100%;padding:10px 0;color:#cbd6df"></label><label style="display:flex;gap:8px;align-items:flex-start;margin:10px 0;color:#cbd6df;font-size:12px"><input id="mwMotionConsent" type="checkbox" style="margin-top:3px"> I consent to MW securely storing this recording for up to 14 days for Motion Intelligence review.</label><button class="save" id="mwMotionUpload" type="button">UPLOAD FOR MOTION REVIEW</button><button class="save" id="mwMotionAnalyze" type="button" hidden>ANALYZE ON THIS IPHONE</button><div id="mwMotionAnalysis" class="lockNote" hidden></div><p id="mwMotionStatus" class="muted" role="status" style="margin-top:10px"></p><details style="margin-top:12px"><summary style="color:#f0c557">My motion recordings</summary><div id="mwMotionHistory" style="margin-top:8px"></div></details></div>`;
    $('mwMotionBack')?.addEventListener('click',()=>{ if(window.mwCoachOpenPage) window.mwCoachOpenPage('tools'); else window.openView?.('pacer',true); });
    if(window.mwNativeMotion3D){$('mwMotion3D').hidden=false;$('mwMotion3D').onclick=()=>{window.mwNativeMotion3D.start();$('mwMotionStatus').textContent='Starting native 3-D body trackingâ¦'};window.mwNativeMotion3DResult=(r)=>{if(r?.state==='tracking')$('mwMotionStatus').textContent='Native 3-D body tracking is active. Keep the athlete fully in frame.';else if(r?.error)$('mwMotionStatus').textContent=r.error;};}
    const coach=coachMode(), status=$('mwMotionStatus'), upload=$('mwMotionUpload'), analyze=$('mwMotionAnalyze');
    // Server upload access is restricted to approved adult athlete pilots.
    // Coaches may run a private device-only observation; don't imply cloud upload access.
    if(coach){
      // Private Coach review requires only the video: never ask the coach to label movement or phases.
      for(const id of ['mwMotionMovement','mwMotionView']){const field=$(id);if(field?.parentElement)field.parentElement.style.display='none';}
      upload.hidden=true;
      analyze.hidden=false;
      const consentRow=$('mwMotionConsent')?.parentElement;if(consentRow){consentRow.hidden=true;consentRow.style.display='none';}
      status.textContent='Coach preview: select a sprint video for an on-device movement review. The recording will not be uploaded or saved. Secure coach uploads are not enabled yet.';
    }else{
      try {
        const access=await call('eligibility');
        if(!access.approved){
          upload.hidden=true;
          status.textContent='Secure uploads require approved adult pilot access. You can still review a sprint video on this device.';
        } else await loadHistory();
      }catch(error){upload.hidden=true;status.textContent=error.message;}
      analyze.hidden=false;
    }
    analyze.onclick=async()=>{
      const file=$('mwMotionFile').files?.[0];
      if(!file){status.textContent='Select a sprint video first.';return;}
      if(!['video/mp4','video/quicktime'].includes(file.type)||file.size<1||file.size>100*1024*1024){status.textContent='Choose an MP4 or QuickTime video up to 100 MB.';return;}
      analyze.disabled=true;
      const previous=$('mwMotionAnalysis');if(previous){previous.hidden=true;previous.innerHTML='';}
      try{
        const result=await analyzeVideo(file,status);
        paintAnalysis(result,status);
        status.textContent='On-device movement review complete. No recording was uploaded or stored.';
      }catch(error){status.textContent=error.message||'On-device analysis failed.';}finally{analyze.disabled=false;}
    };
    $('mwMotionUpload').onclick = async () => {
      const file = $('mwMotionFile').files?.[0], status = $('mwMotionStatus'), btn = $('mwMotionUpload');
      if (!file) { status.textContent='Choose an MP4 or QuickTime sprint video first.'; return; }
      if (!$('mwMotionConsent').checked) { status.textContent='Accept the recording consent before uploading.'; return; }
      if (!['video/mp4','video/quicktime'].includes(file.type) || file.size < 1 || file.size > 100*1024*1024) { status.textContent='Use an MP4 or QuickTime video up to 100 MB.'; return; }
      btn.disabled=true; status.textContent='Preparing secure uploadâ¦';
      try {
        const prepared = await call('prepare',{movementType:$('mwMotionMovement').value,cameraView:$('mwMotionView').value,mimeType:file.type,bytes:file.size,weekNumber:Number(window.mwSeasonCalendar?.week||window.mwRemoteProfile?.week||1),consentAccepted:true,consentVersion:'pilot-v1'});
        status.textContent='Uploading securelyâ¦';
        const uploadUrl = `${window.MW_SUPABASE_URL}/storage/v1/object/upload/sign/motion-private/${prepared.path.split('/').map(encodeURIComponent).join('/')}?token=${encodeURIComponent(prepared.token)}`;
        const up = await fetch(uploadUrl,{method:'PUT',headers:{apikey:window.MW_SUPABASE_KEY,Authorization:`Bearer ${token()}`,'Content-Type':file.type,'x-upsert':'false'},body:file});
        if(!up.ok) throw new Error('Secure upload failed.');
        status.textContent='Verifying recordingâ¦';
        const done=await call('finalize',{assessmentId:prepared.assessmentId});
        status.textContent=done.durationVerified?`â Recording saved (${Math.round(Number(done.durationMs||0)/1000)}s).`:'Recording saved securely.';
        // Local analysis is a separate explicit action; do not upload measurements automatically.
        await loadHistory();
      } catch(e) { status.textContent=e.message||'Motion upload failed.'; } finally { btn.disabled=false; }
    };
  };
  document.addEventListener('click', event => {
    const button = event.target.closest?.('button');
    if (!button || !/MOTION INTELLIGENCE/i.test(button.textContent || '')) return;
    // Coach navigation uses its dedicated route; do not also trigger the Athlete click handler.
    if (location.pathname.startsWith('/coach') || document.body.classList.contains('mw-hybrid-coach')) return;
    event.preventDefault();
    window.openView?.('pacer', true);
    setTimeout(() => window.mwOpenMotionIntelligence?.(), 100);
  }, true);
})();
