(() => {
  // Phase 2: MW School + Motion Intelligence. The analysis code stays preserved
  // for future release, but no public athlete/coach session can open it.
  const MOTION_PUBLIC_RELEASE_ENABLED=false;
  if(!MOTION_PUBLIC_RELEASE_ENABLED){
    window.mwOpenMotionIntelligence=async()=>false;
    window.mwOpenCoachMotionIntelligence=async()=>false;
    return;
  }
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
  // Seek-based analysis is intentionally distinct from high-speed contact timing.
  // Cover the entire clip instead of silently trimming to its first eight seconds.
  async function analyzeVideo(file,status){
    status.textContent='Loading on-device movement model...';
    const vision=await import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/vision_bundle.mjs');
    const resolver=await vision.FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm');
    const landmarker=await vision.PoseLandmarker.createFromOptions(resolver,{
      baseOptions:{modelAssetPath:'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',delegate:'CPU'},
      runningMode:'VIDEO',numPoses:1
    });
    const video=document.createElement('video');
    video.muted=true;video.playsInline=true;video.preload='auto';
    const objectUrl=URL.createObjectURL(file);
    video.src=objectUrl;
    let attempted=0,decodeErrors=0,decodeRetries=0,poseMisses=0;
    let sampledFrames=0,shortSegments=0,partial=false;
    const adaptiveStats={good:0,missing:0,skipped:0};
    const readings=[],tracking=[];
    // A local crop helps the existing pose model recover a distant runner.
    // It is a second attempt at a sampled frame, not an additional native frame.
    const cropCanvas=document.createElement('canvas');cropCanvas.width=512;cropCanvas.height=512;
    const cropCtx=cropCanvas.getContext('2d');
    let lastBodyBounds=null,lastBodyIndex=-100,recoveredCrops=0;
    const boundsFromPose=(pose)=>{
      const pts=[0,7,8,11,12,13,14,15,16,23,24,25,26,27,28,29,30,31,32]
        .map(i=>pose?.[i]).filter(v=>v&&Number.isFinite(v.x)&&Number.isFinite(v.y)&&(v.visibility??1)>=0.5);
      if(pts.length<6)return null;
      const minX=Math.max(0,Math.min(...pts.map(v=>v.x))),maxX=Math.min(1,Math.max(...pts.map(v=>v.x)));
      const minY=Math.max(0,Math.min(...pts.map(v=>v.y))),maxY=Math.min(1,Math.max(...pts.map(v=>v.y)));
      if(maxY-minY<0.045)return null;
      return {x:minX,y:minY,w:maxX-minX,h:maxY-minY};
    };
    const recoveryCrop=(bounds,videoW,videoH,misses)=>{
      if(!bounds||!cropCtx||!videoW||!videoH)return null;
      const pad=Math.min(3.2,1.55+misses*0.12);
      const cx=(bounds.x+bounds.w/2)*videoW,cy=(bounds.y+bounds.h/2)*videoH;
      const desired=Math.max(bounds.w*videoW*pad,bounds.h*videoH*pad,90);
      const size=Math.min(Math.min(videoW,videoH),desired);
      const x=Math.max(0,Math.min(videoW-size,cx-size/2));
      const y=Math.max(0,Math.min(videoH-size,cy-size/2));
      cropCtx.clearRect(0,0,512,512);
      cropCtx.drawImage(video,x,y,size,size,0,0,512,512);
      return {x:x/videoW,y:y/videoH,w:size/videoW,h:size/videoH};
    };
    const awaitMetadata=()=>new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error('Unable to read this video on your iPhone. Try a shorter MP4 recording.')),15000);
      video.onloadedmetadata=()=>{clearTimeout(timer);resolve();};
      video.onerror=()=>{clearTimeout(timer);reject(new Error('iPhone could not decode this video. Try an MP4 recording.'));};
      if(video.readyState>=1){clearTimeout(timer);resolve();}
    });
    // Some iOS/WebKit decoders don't fire seeked for a seek inside the same native frame.
    // Accept ready frames when already at target, and release listeners on every attempt.
    const seekTo=(second)=>new Promise((resolve,reject)=>{
      let done=false;
      const cleanup=()=>{video.removeEventListener('seeked',ok);video.removeEventListener('error',bad);clearTimeout(timer);};
      const finish=(err)=>{if(done)return;done=true;cleanup();err?reject(err):resolve();};
      const ok=()=>finish(),bad=()=>finish(new Error('Video frame decode event failed.'));
      const timer=setTimeout(()=>finish(new Error('Video frame seek timed out.')),3500);
      video.addEventListener('seeked',ok,{once:true});
      video.addEventListener('error',bad,{once:true});
      try{
        if(Math.abs(video.currentTime-second)<0.002&&video.readyState>=2){finish();return;}
        video.currentTime=second;
      }catch(error){finish(error);}
    });
    try{
      await awaitMetadata();
      const duration=Number(video.duration);
      if(!Number.isFinite(duration)||duration<0.25)throw new Error('The recording is too short or its duration is unavailable.');
      // One forward, time-ordered adaptive pass avoids repeatedly seeking inside the
      // same native video frame and preserves MediaPipe VIDEO timestamps.
      // Higher density is used where the athlete is visible; after misses or decode
      // failures, scan more broadly to recover. We do not know the native frame rate.
      const maxSamples=Math.min(300,Math.max(80,Math.ceil(duration*24)));
      const start=0.015,end=Math.max(start,duration-0.02);
      let position=start,missStreak=0,decodeStreak=0,lastSuccessTime=-1;
      const processFrame=(p,actualTime,i)=>{
        let body=p?boundsFromPose(p):null;
        if(!body&&lastBodyBounds&&i-lastBodyIndex<=14){
          try{
            const region=recoveryCrop(lastBodyBounds,video.videoWidth,video.videoHeight,i-lastBodyIndex);
            if(region){
              const cropped=landmarker.detectForVideo(cropCanvas,Math.round(actualTime*1000)+0.5)?.landmarks?.[0];
              if(cropped&&boundsFromPose(cropped)){
                p=cropped.map(v=>({...v,x:region.x+v.x*region.w,y:region.y+v.y*region.h}));
                body=boundsFromPose(p);
                if(body)recoveredCrops++;
              }
            }
          }catch(_cropError){/* Crop is optional; full frame remains usable. */}
        }
        if(body){lastBodyBounds=body;lastBodyIndex=i;}
        if(!p)return false;
        const tracked=window.MWMotionTracking?.frame(p,actualTime);
        if(tracked)tracking.push(tracked);
        const visible=id=>p[id]&&Number.isFinite(p[id].x)&&Number.isFinite(p[id].y)&&(p[id].visibility??1)>=0.5;
        if([11,12,23,24,25,26,27,28].every(visible)){
          const S={x:(p[11].x+p[12].x)/2,y:(p[11].y+p[12].y)/2};
          const H={x:(p[23].x+p[24].x)/2,y:(p[23].y+p[24].y)/2};
          const side=(p[25].visibility??1)>=(p[26].visibility??1)?25:26;
          const knee=p[side],hip=p[side-2],ankle=p[side+2],elbow=p[side===25?13:14],wrist=p[side===25?15:16];
          readings.push({trunk:Math.abs(Math.atan2(S.x-H.x,H.y-S.y)*180/Math.PI),
            knee:angle(hip,knee,ankle),
            shin:Math.abs(Math.atan2(ankle.x-knee.x,knee.y-ankle.y)*180/Math.PI),
            arm:visible(side===25?13:14)&&visible(side===25?15:16)?angle(S,elbow,wrist):null});
        }
        return !!tracked;
      };
      while(position<=end&&attempted<maxSamples){
        const i=attempted++;
        // Deliberately cap normal sampling near 20 Hz. This does not claim to
        // process all source frames or to provide verified contact timing.
        const interval=decodeStreak>=2?0.25:missStreak>=4?0.18:missStreak>0?0.12:0.05;
        let analyzed=false,decoded=false,actualTime=position;
        for(let retry=0;retry<2&&!decoded;retry++){
          try{
            const target=Math.min(end,position+(retry?0.018:0));
            await seekTo(target);
            if(video.readyState<2)throw new Error('Decoded video data unavailable.');
            actualTime=video.currentTime;
            // For codecs with coarse frame stepping, do not count the same
            // frame as another independent movement observation.
            if(actualTime<=lastSuccessTime+0.006){adaptiveStats.skipped++;decoded=true;break;}
            const output=landmarker.detectForVideo(video,Math.round(actualTime*1000));
            sampledFrames++;
            decoded=true;
            analyzed=processFrame(output?.landmarks?.[0],actualTime,i);
            lastSuccessTime=actualTime;
          }catch(error){if(retry===0)decodeRetries++;else decodeErrors++;}
        }
        if(decoded){
          decodeStreak=0;
          if(analyzed){missStreak=0;adaptiveStats.good++;}
          else {missStreak++;poseMisses++;adaptiveStats.missing++;}
        }else{
          decodeStreak++;
          shortSegments++;
          // Continue across difficult portions instead of aborting a clip
          // with dozens of successfully tracked frames.
          if(decodeStreak>=12&&tracking.length<8)break;
        }
        if(i%8===0){
          status.textContent='Reviewing video: '+Math.round(Math.min(100,position/duration*100))+'% ('+tracking.length+' usable body positions)';
          await new Promise(resolve=>setTimeout(resolve,0));
        }
        position+=interval;
      }
      partial=position<end||decodeErrors>0||poseMisses>0;
      if(tracking.length<8)throw new Error('Only '+tracking.length+' usable body positions were found. MW could not build a trustworthy review from this clip; try keeping the runner larger in frame.');
      const values={
        trunk:median(readings.map(x=>x.trunk)),knee:median(readings.map(x=>x.knee)),
        shin:median(readings.map(x=>x.shin)),arm:median(readings.map(x=>x.arm))
      };
      return {sampledFrames:sampledFrames||attempted,poseFrames:tracking.length,values,frames:tracking,analyzedSeconds:Math.min(duration,position),
        sourceSeconds:duration,decodeErrors,decodeRetries,poseMisses,shortSegments,partial,recoveredCrops,adaptiveStats,
        analysisMethod:'adaptive_forward_sampling_with_local_recovery'};
    }finally{
      try{video.pause();video.removeAttribute('src');video.load();}catch(_){}
      landmarker.close();
      URL.revokeObjectURL(objectUrl);
    }
  }
  // Preliminary behind-the-scenes classification from time-ordered posture landmarks.
  // Never equate torso posture with validated sprint phase, foot contact or technique quality.
  function buildMotionReport(result) {
    const frames=(result.frames||[]).filter(f=>Number.isFinite(f.trunk));
    if(frames.length<12||frames.length/Math.max(1,result.sampledFrames)<0.65) return {phases:[],message:'Not enough continuous tracked body positions to identify sprint phases reliably. Keep the whole runner clearly visible from whichever camera angle is available.'};
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
    const box=$('mwMotionAnalysis');
    if(!box)return;
    const engine=window.MWMotionTracking?.summarize(result.frames,{
      sampledFrames:result.sampledFrames,
      cameraView:null // Do not assume angle from a hidden/default dropdown; accept all views.
    });
    const quality=engine?.quality,coaching=engine?.coaching;
    const perspective=engine?.perspective||{view:'unknown',confidence:'insufficient'};
    const labels={side:'Side',front:'Front',rear:'Rear',front_or_rear:'Front/rear',diagonal:'Diagonal',mixed:'Mixed angle',unknown:'Unclear'};
    const perspectiveDescription='Estimated view: '+(labels[perspective.view]||'Unclear')+' ('+perspective.confidence+'). This is a preliminary 2-D estimate, not a verified camera calibration.';
    const section=(title,content)=>'<section style="border-top:1px solid #5c4b2e;padding:12px 0"><h3 style="margin:0 0 8px;color:#f2c864;font-size:16px">'+title+'</h3>'+content+'</section>';
    const row=(title,desc)=>'<p style="margin:7px 0;line-height:1.5"><strong>'+esc(title)+'</strong> '+esc(desc)+'</p>';
    const observed=coaching?.positives?.length
      ?coaching.positives.map(p=>row(p.evidence,p.meaning)).join('')
      :'<p>MW could not verify a specific technical strength from the visible frames.</p>';
    const concerns=coaching?.issues?.length
      ?coaching.issues.map(x=>row(x.label+':',x.reason)).join('')
      :'<p>No specific technical fault was verified in this recording.</p>';
    const actions=coaching?.actions?.length
      ?coaching.actions.map(x=>row(x.focus+':',x.instruction)).join('')
      :'<p>Keep the full athlete visible in the recording and review observable movement with a coach.</p>';
    const phases=engine?.phases?.length
      ?engine.phases.map(x=>row(x.name+' ('+Number(x.startSeconds).toFixed(1)+'–'+Number(x.endSeconds).toFixed(1)+'s):',x.detail)).join('')
      :'<p>No verified side-view phase pattern was identified. MW can still describe other observable movement from this angle.</p>';
    const contact=engine?.groundContact;
    const ground='<p>'+esc(contact?.status==='not_verified'?'Exact touchdown, toe-off and contact time are not verified.':'Ground-contact review unavailable.')+'</p>';
    const heel=engine?.heels?.length
      ?engine.heels.map(h=>row((h.side==='left'?'Left':'Right')+' leg:',h.trackedFrames+' tracked positions. '+(h.detail||'Recovery pattern not verified.'))).join('')
      :'<p>Heel recovery could not be tracked reliably.</p>';
    const asDegrees=n=>Number.isFinite(n)?n.toFixed(1)+'°':'Not measured';
    const includedSeconds=Number(result.analyzedSeconds||0).toFixed(1);
    const coveredSeconds=quality?.spanSeconds?quality.spanSeconds.toFixed(1):'0.0';
    const totalSeconds=Number(result.sourceSeconds||0).toFixed(1);
    const qualityStatement='Reviewed '+includedSeconds+' of '+totalSeconds+' seconds; '+(quality?.usableFrames||0)+' usable tracked positions from '+result.sampledFrames+' sampled timestamps.';
    const summary=quality?.adequateForPosture&&engine.phases.length
      ?'MW identified preliminary posture changes in the visible recording. These are observations, not a verified sprint-technique grade.'
      :'MW reviewed this footage, but the visible body positions do not support a reliable phase judgment. MW will report observable movement without guessing faults or demanding a particular camera angle.';
    const method='<p>'+esc(qualityStatement)+'</p>'
      +'<p>Continuous visible landmark coverage: '+Math.round((quality?.poseCoverage||0)*100)+'%. Longest usable run: '+(quality?.longestContinuousRun||0)+' frames.</p>'
      +'<p>Approximate trunk angle '+asDegrees(result.values.trunk)+', knee '+asDegrees(result.values.knee)+', shin '+asDegrees(result.values.shin)+', arm '+asDegrees(result.values.arm)+'.</p>'
      +'<p>'+esc(contact?.reason||'Contact detection unavailable.')+'</p>'
      +'<p>Ground-contact milliseconds are withheld until video event detection is validated. The model analyzes sampled frames, not every native camera frame.</p>'
      +'<p>Local crop recovery attempts that yielded visible landmarks: '+(result.recoveredCrops||0)+'.</p>'
      +'<p>Sampling: '+esc(result.analysisMethod)+'. Frame retries: '+(result.decodeRetries||0)+'. Unreadable samples: '+(result.decodeErrors||0)+'. Frames with no usable pose: '+(result.poseMisses||0)+'.</p>';
    box.hidden=false;
    box.style.padding='14px';
    box.style.lineHeight='1.55';
    box.innerHTML='<div style="max-width:100%;overflow-wrap:anywhere">'
      +'<div style="color:#f2c864;font-size:12px;letter-spacing:.07em;font-weight:800">MW DYNASTY</div>'
      +'<h2 style="font-size:21px;margin:3px 0 8px">Your Motion Intelligence Review</h2>'
      +'<p style="color:#d3d9e1">'+esc(summary)+'</p>'
      +section('What you are doing well',observed)
      +section('What needs improvement',concerns)
      +section('How to correct it',actions)
      +section('Automatic camera perspective', '<p>'+esc(perspectiveDescription)+'</p>')
      +section('Automatic movement-phase review',phases)
      +section('Ground contact and heel recovery',ground+heel)
      +section('Your next practice focus',coaching?.actions?.length?row(coaching.actions[0].focus+':',coaching.actions[0].instruction):'<p>Record with the full athlete visible; side, front and rear views are all accepted.</p>')
      +'<details style="border-top:1px solid #5c4b2e;padding-top:10px"><summary style="color:#e6c16d">Technical measurements and evidence</summary>'+method+'</details>'
      +'</div>';
    status.textContent='Private on-device review ready. No recording was uploaded or stored by this analysis.';
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
    root.style.paddingTop='max(18px, env(safe-area-inset-top))';
    root.style.scrollMarginTop='max(18px, env(safe-area-inset-top))';
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
