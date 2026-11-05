(function(root,factory){const v=factory();if(typeof module==='object'&&module.exports)module.exports=v;else root.MWMotionTracking=v;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const finite=Number.isFinite,median=a=>{const x=a.filter(finite).slice().sort((a,b)=>a-b);return x.length?x[Math.floor(x.length/2)]:null};
const point=(p,i)=>{const v=p?.[i];return v&&finite(v.x)&&finite(v.y)&&(v.visibility==null||v.visibility>=0.5)?{x:v.x,y:v.y}:null};
function frame(p,time){
const l=point(p,11),r=point(p,12),lh=point(p,23),rh=point(p,24);if(!l||!r||!lh||!rh||!finite(time))return null;
const shoulder={x:(l.x+r.x)/2,y:(l.y+r.y)/2},hip={x:(lh.x+rh.x)/2,y:(lh.y+rh.y)/2},scale=Math.hypot(shoulder.x-hip.x,shoulder.y-hip.y);
if(scale<0.03)return null;
const legs=[0,1].map(side=>{const h=point(p,side?24:23),k=point(p,side?26:25),a=point(p,side?28:27),heel=point(p,side?30:29),toe=point(p,side?32:31);
return {side:side?'right':'left',valid:!!(h&&k&&a),ankle:a||null,knee:k||null,heel:heel||null,toe:toe||null,hip:h||null,heelHeight:h&&(heel||a)?(h.y-(heel||a).y)/scale:null,heelToHipX:h&&heel?(heel.x-h.x)/scale:null,toeY:toe?.y??null};});
const shoulderWidth=Math.hypot(l.x-r.x,l.y-r.y),hipWidth=Math.hypot(lh.x-rh.x,lh.y-rh.y);
const nose=point(p,0),leftEar=point(p,7),rightEar=point(p,8);
const legValid=legs.filter(x=>x.valid).length;
// Perspective is inferred from repeated width/depth evidence, not a dropdown.
const widthRatio=shoulderWidth/scale;
const faceObserved=!!(nose&&(leftEar||rightEar));
const faceUnseen=!!(p?.[0]&&Number(p[0].visibility)<0.35);
const viewEvidence=widthRatio>=0.72?(faceObserved?'front':'front_or_rear')
 :widthRatio<=0.28?'side':'diagonal';
const leftWrist=point(p,15),rightWrist=point(p,16);
const kneeLeft=point(p,25),kneeRight=point(p,26);
const bilateral={
 leftArm:leftWrist?{x:(leftWrist.x-l.x)/scale,y:(leftWrist.y-l.y)/scale}:null,
 rightArm:rightWrist?{x:(rightWrist.x-r.x)/scale,y:(rightWrist.y-r.y)/scale}:null,
 leftKnee:kneeLeft?{x:(kneeLeft.x-lh.x)/scale,y:(kneeLeft.y-lh.y)/scale}:null,
 rightKnee:kneeRight?{x:(kneeRight.x-rh.x)/scale,y:(kneeRight.y-rh.y)/scale}:null
};
const extremities=[leftWrist,rightWrist,point(p,27),point(p,28)].filter(Boolean);
const yPositions=[l,r,lh,rh,...extremities].map(x=>x.y);
const visibleHeight=yPositions.length>=6?Math.max(...yPositions)-Math.min(...yPositions):null;
return {time,trunk:Math.atan2(Math.abs(shoulder.x-hip.x),Math.abs(hip.y-shoulder.y))*180/Math.PI,legs,
  viewEvidence:faceUnseen&&viewEvidence==='front_or_rear'?'rear_candidate':viewEvidence,
  shoulderWidth,hipWidth,widthRatio,visibleHeight,legValid,bilateral};
}

function detectFootEvents(frames,meta={}){
  const ordered=frames.filter(f=>f&&Number.isFinite(f.time)).slice().sort((a,b)=>a.time-b.time);
  const gaps=ordered.slice(1).map((f,i)=>f.time-ordered[i].time).filter(n=>n>0),dt=median(gaps);
  const rate=dt?1/dt:0;
  const sideView=meta.cameraView==='side';
  // This is a candidate EVENT detector, not validated contact timing.
  // Pose toe coordinates cannot prove shoe-track contact, even with a high source frame rate.
  const outcome={status:'not_verified',candidateEvents:[],touchdown:null,toeOff:null,contactMilliseconds:null,
    effectiveFps:rate,reason:''};
  if(!sideView){outcome.reason='Side-view recording is needed to inspect foot motion relative to the track.';return outcome;}
  if(rate<90||ordered.length<45){outcome.reason='Foot-contact event detection needs time-ordered pose samples at 90 Hz or faster, with enough clear frames. This analysis was sampled below that threshold.';return outcome;}
  for(const side of ['left','right']){
    const legAt=f=>f.legs?.find(l=>l.side===side&&l.valid&&Number.isFinite(l.toeY));
    const rows=ordered.map(f=>({time:f.time,leg:legAt(f)})).filter(x=>x.leg);
    if(rows.length<45)continue;
    const y=rows.map(x=>x.leg.toeY);
    const ground=median(y.slice().sort((a,b)=>b-a).slice(0,Math.max(5,Math.floor(y.length/7))));
    // Segment each near-ground excursion once. A stationary foot is not a landing.
    // Store exploratory proximity windows, never treat them as measured foot-strike times.
    let approachSeen=false,windowStart=null,lastLowTime=null;
    for(let i=2;i<rows.length-2;i++){
      const yNow=rows[i].leg.toeY,t=rows[i].time;
      const near=ground-yNow<0.015;
      if(yNow<ground-0.04){approachSeen=true;}
      if(near&&approachSeen){
        if(windowStart===null)windowStart=t;
        lastLowTime=t;
      }else if(windowStart!==null){
        const lasted=lastLowTime-windowStart;
        if(lasted>=0.016&&lasted<=0.35){
          outcome.candidateEvents.push({side,start:windowStart,end:lastLowTime,kind:'unverified_ground_proximity_window',confidence:'unverified'});
        }
        windowStart=null;lastLowTime=null;approachSeen=false;
      }
    }
  }
  outcome.reason=outcome.candidateEvents.length?
    'Possible near-ground foot positions were located, but neither touchdown nor toe-off can be verified from pose alone. No contact durations are reported.':
    'No sufficiently clear foot-to-ground event candidates were found; exact contact duration is unavailable.';
  return outcome;
}
function analyzeHeelRecovery(frames,meta={}){
  const ordered=frames.filter(f=>f&&Number.isFinite(f.time)).slice().sort((a,b)=>a.time-b.time);
  return ['left','right'].map(side=>{
    const series=ordered.map(f=>({t:f.time,leg:f.legs?.find(l=>l.side===side&&l.valid)}))
      .filter(v=>v.leg&&Number.isFinite(v.leg.heelHeight));
    const vals=series.map(v=>v.leg.heelHeight);
    const samples=series.length,span=samples?series[samples-1].t-series[0].t:0;
    const gaps=series.slice(1).map((v,i)=>v.t-series[i].t).filter(n=>n>0);
    const stable=samples>=24&&span>=0.8&&(!gaps.length||Math.max(...gaps)<0.25);
    const third=Math.max(1,Math.floor(vals.length/3));
    const first=median(vals.slice(0,third)),last=median(vals.slice(-third));
    return {side,trackedFrames:vals.length,
      earlyRelativeHeight:first,lateRelativeHeight:last,
      change:stable&&finite(first)&&finite(last)?last-first:null,
      peakRelativeHeight:stable?Math.max(...vals):null,trackingAdequate:stable,
      rearwardFootSamples:series.filter(v=>Number.isFinite(v.leg.heelToHipX)).length,
      assessment:'not_verified',
      detail:!stable?'Not enough continuous heel positions for a temporal comparison.':
        'Heel-height trend was estimated relative to hip position, but excessive cycling or faulty recovery cannot be diagnosed without phase and direction calibration.'};
  });
}
function detectPerspective(frames){
 const rows=frames.filter(f=>f&&typeof f.viewEvidence==='string'&&finite(f.widthRatio));
 const counts={side:0,front:0,rear_candidate:0,front_or_rear:0,diagonal:0};
 for(const f of rows){if(Object.hasOwn(counts,f.viewEvidence))counts[f.viewEvidence]++;}
 const n=rows.length;
 if(n<12)return {view:'unknown',confidence:'insufficient',observations:n,reason:'Not enough reliable body geometry to estimate camera angle.'};
 const frontish=counts.front+counts.front_or_rear+counts.rear_candidate;
 const side=counts.side,diagonal=counts.diagonal;
 let view='mixed',winner=0;
 if(side/n>=0.65){view='side';winner=side;}
 else if(frontish/n>=0.65){
   view=counts.front/n>=0.55?'front':counts.rear_candidate/n>=0.55?'rear':'front_or_rear';winner=frontish;
 }else if(diagonal/n>=0.55){view='diagonal';winner=diagonal;}
 // Never force front-versus-rear from weak facial landmarks.
 const confidence=winner/n>=0.8&&n>=24?'moderate':winner/n>=0.65?'preliminary':'uncertain';
 return {view,confidence,observations:n,counts,reason:'Estimated from repeated 2-D shoulder width, torso scale and available facial landmarks; not a calibrated camera pose.'};
}
function distanceTracking(frames){
 const rows=frames.filter(f=>finite(f.visibleHeight)&&f.visibleHeight>=0.03);
 if(rows.length<16)return {status:'insufficient',startSize:null,endSize:null,relativeChange:null};
 const third=Math.max(4,Math.floor(rows.length/3));
 const first=median(rows.slice(0,third).map(f=>f.visibleHeight));
 const last=median(rows.slice(-third).map(f=>f.visibleHeight));
 const change=first&&last?(last-first)/first:null;
 return {status:change!==null&&change< -0.25?'runner_appears_smaller':change!==null&&change>0.25?'runner_appears_larger':'no_clear_scale_change',
   startSize:first,endSize:last,relativeChange:change};
}
function bilateralMotion(frames){
 const f=frames.filter(x=>x?.bilateral);
 const arms=f.filter(x=>x.bilateral.leftArm&&x.bilateral.rightArm);
 const legs=f.filter(x=>x.bilateral.leftKnee&&x.bilateral.rightKnee);
 const range=(points,axis)=>{const vals=points.map(p=>p[axis]).filter(finite);return vals.length>=12?Math.max(...vals)-Math.min(...vals):null;};
 const leftArmY=range(arms.map(x=>x.bilateral.leftArm),'y'),rightArmY=range(arms.map(x=>x.bilateral.rightArm),'y');
 const leftKneeY=range(legs.map(x=>x.bilateral.leftKnee),'y'),rightKneeY=range(legs.map(x=>x.bilateral.rightKnee),'y');
 const span=f.length?f[f.length-1].time-f[0].time:0;
 return {armFrames:arms.length,legFrames:legs.length,
   armMotionVisible:arms.length>=18&&span>=0.75&&finite(leftArmY)&&finite(rightArmY)&&leftArmY>=0.12&&rightArmY>=0.12,
   kneeMotionVisible:legs.length>=18&&span>=0.75&&finite(leftKneeY)&&finite(rightKneeY)&&leftKneeY>=0.12&&rightKneeY>=0.12,
   status:arms.length>=18||legs.length>=18?'preliminary':'limited'};
}
function generateCoachingFeedback(summary){
  const positives=[],issues=[],actions=[];
  if(summary.perspective.view==='side'&&summary.quality.adequateForPosture&&summary.phases.some(p=>p.name==='Rising posture / transition pattern')){
    positives.push({evidence:'Forward torso inclination decreased across this recording.',meaning:'A progressive rise can be appropriate during acceleration; this observation alone is not a technique grade.'});
    actions.push({focus:'Transition mechanics',instruction:'Review whether posture rises smoothly across successive steps. Confirm with a coach rather than forcing low heel recovery into upright running.'});
  }
  if(summary.quality.usableFrames>=8&&summary.quality.poseCoverage<0.55){
    positives.push({evidence:'MW tracked '+summary.quality.usableFrames+' visible body positions.',meaning:'Some movement was recovered despite limited tracking. This is a partial observation, not a sprint-technique grade.'});
    actions.unshift({focus:'Keep the runner visible',instruction:'For the next recording, keep the whole athlete in frame and large enough to see. Front, rear and side recordings are accepted; MW will report only what can be observed.'});
  }
  if(summary.perspective.view==='front'||summary.perspective.view==='rear'||summary.perspective.view==='front_or_rear'){
    positives.push({evidence:'Multiple frames show a broadly frontal or rear camera perspective.',meaning:'MW can inspect visible left-right positioning, but it cannot convert this recording into a calibrated side-view force measurement.'});
    if(summary.bilateral.armMotionVisible){
      positives.push({evidence:'Both arms showed measurable movement across '+summary.bilateral.armFrames+' tracked frames.',meaning:'MW can observe arm motion from this camera direction, but this alone does not establish correct or incorrect arm mechanics.'});
    }
    if(summary.bilateral.kneeMotionVisible){
      positives.push({evidence:'Left and right knee movement was visible across '+summary.bilateral.legFrames+' frames.',meaning:'This makes a basic front/rear coordination review possible, not a verified diagnosis of knee alignment or rotation.'});
    }
    actions.push({focus:'Left-right coordination',instruction:'Review the visible arm and knee paths from this angle. A single 2-D recording cannot verify joint rotation or a specific technical fault.'});
  }else if(summary.perspective.view==='diagonal'||summary.perspective.view==='mixed'){
    actions.push({focus:'Diagonal sprint review',instruction:'Review visible coordination and changes in posture without assigning exact phase boundaries or ground-contact times.'});
  }
  if(summary.distance.status==='runner_appears_smaller'){
    positives.push({evidence:'The runner appears smaller later in the recording.',meaning:'The athlete may be moving away from the camera. MW attempts to use visible motion but will limit detail when joints become too small.'});
  }
  issues.push({label:'Ground contact',reason:'Touchdown and toe-off have not been verified. Contact duration cannot be calculated from this recording, regardless of camera angle.'});
  const heels=(summary.heels||[]).filter(h=>h.trackingAdequate&&finite(h.change));
  if(summary.perspective.view==='side'&&heels.length===2&&summary.phases.some(p=>p.name==='Rising posture / transition pattern')){
    const bothRise=heels.every(h=>h.change>=0.15);
    const bothLower=heels.every(h=>h.change<=-0.15);
    if(bothRise){
      positives.push({evidence:'The tracked heel trajectories rose relative to the hips as the torso became more upright.',meaning:'This pattern may be consistent with a natural acceleration-to-upright transition. It is not a verified judgment of proper heel cycling.'});
    }else if(bothLower){
      issues.push({label:'Heel-recovery pattern',reason:'Both heel trajectories appeared lower relative to the hips later in the clip. Check that the camera and athlete remained in a stable side view before judging the movement.'});
      actions.push({focus:'Review the transition',instruction:'Look at several consecutive steps with a sprint coach. Let the leg recover naturally as the body rises; do not force a particular heel height.'});
    }
  }
  if(!heels.length)issues.push({label:'Heel recovery and cycling',reason:'The recording did not provide enough uninterrupted heel tracking for a phase-aware interpretation.'});
  else if(!summary.phases.length)issues.push({label:'Heel recovery and cycling',reason:'Heel movement was tracked, but the sprint phase was not identified reliably enough to judge cycling.'});
  if(!actions.length)actions.push({focus:'Review visible movement',instruction:'Use the clear sections of this recording to discuss the start, rhythm and posture with a coach. For better detail, keep the athlete large and fully visible; any camera angle is accepted.'});
  return {positives,issues,actions,diagnosticConfidence:'experimental',faultDetected:false};
}

function summarize(frames,meta={}){
const f=frames.filter(v=>v&&finite(v.time)&&finite(v.trunk)).slice().sort((a,b)=>a.time-b.time);
const span=f.length?f[f.length-1].time-f[0].time:0,gaps=f.slice(1).map((v,i)=>v.time-f[i].time).filter(n=>n>0),step=median(gaps);
const coverage=f.length/Math.max(1,meta.sampledFrames||f.length);
const maxGap=gaps.length?Math.max(...gaps):0;
const typicalGap=step||0;
const longestRun=(()=>{
  if(!f.length)return 0;
  let current=1,best=1;
  for(let i=1;i<f.length;i++){
    if(f[i].time-f[i-1].time<=Math.max(0.14,typicalGap*2.5))current++;
    else current=1;
    best=Math.max(best,current);
  }
  return best;
})();
const good=f.length>=18&&span>=0.75&&coverage>=0.55&&longestRun>=12,third=Math.max(1,Math.floor(f.length/3));
const early=median(f.slice(0,third).map(x=>x.trunk)),late=median(f.slice(-third).map(x=>x.trunk)),phases=[];
const perspective=detectPerspective(f),distance=distanceTracking(f),bilateral=bilateralMotion(f);
if(good&&perspective.view==='side'){
 const delta=early-late;
 const start=f[0].time,finish=f[f.length-1].time,transition=f[Math.min(f.length-1,third)].time;
 if(early>=22&&delta>=10){
   phases.push({name:'Early forward-lean pattern',startSeconds:start,endSeconds:transition,confidence:'preliminary',detail:'A forward-inclined posture was observed early in the recording.'});
   phases.push({name:'Rising posture / transition pattern',startSeconds:transition,endSeconds:finish,confidence:'preliminary',detail:'Torso inclination decreased over this part of the recording. A gradual rise can be normal.'});
 }else if(early<20&&late<20&&Math.abs(delta)<9){
   phases.push({name:'Mostly upright posture',startSeconds:start,endSeconds:finish,confidence:'preliminary',detail:'The torso remained relatively upright in the visible frames.'});
 }else if(early>=22&&late>=20&&Math.abs(delta)<10){
   phases.push({name:'Forward-inclined posture',startSeconds:start,endSeconds:finish,confidence:'preliminary',detail:'Forward torso lean was present, but individual acceleration phases cannot be confirmed.'});
 }
}
const heels=analyzeHeelRecovery(f,meta);
const groundContact=detectFootEvents(f,meta);
const result={perspective,distance,bilateral,quality:{usableFrames:f.length,sampledFrames:meta.sampledFrames||f.length,poseCoverage:coverage,spanSeconds:span,effectiveFps:step?1/step:0,largestGapSeconds:maxGap,longestContinuousRun:longestRun,adequateForPosture:good,adequateForContactTiming:false},phases,heels,groundContact};
result.coaching=generateCoachingFeedback(result);
return result;
}
return {frame,summarize,detectFootEvents,analyzeHeelRecovery,generateCoachingFeedback,detectPerspective,distanceTracking,bilateralMotion};
});