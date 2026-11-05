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
return {time,trunk:Math.atan2(Math.abs(shoulder.x-hip.x),Math.abs(hip.y-shoulder.y))*180/Math.PI,legs};
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
    for(let i=3;i<rows.length-3;i++){
      const left=rows[i-2],right=rows[i+2],center=rows[i];
      const near=ground-center.leg.toeY<0.015;
      const speed=Math.abs((right.leg.toeY-left.leg.toeY)/(right.time-left.time||1));
      // Require an approach from a visibly higher foot position rather than a stationary foot.
      const prior=rows.slice(Math.max(0,i-24),i);
      const approached=prior.some(r=>r.leg.toeY<ground-0.04);
      const inSequence=prior.slice(-4).every(r=>r.leg.toeY<=center.leg.toeY+0.025);
      if(near&&approached&&inSequence&&speed<0.17){
        const prev=outcome.candidateEvents[outcome.candidateEvents.length-1];
        if(!prev||prev.side!==side||center.time-prev.time>0.12)
          outcome.candidateEvents.push({side,time:center.time,kind:'possible_track_proximity',confidence:'unverified'});
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
    const third=Math.max(1,Math.floor(vals.length/3));
    const first=median(vals.slice(0,third)),last=median(vals.slice(-third));
    return {side,trackedFrames:vals.length,
      earlyRelativeHeight:first,lateRelativeHeight:last,
      change:finite(first)&&finite(last)?last-first:null,
      rearwardFootSamples:series.filter(v=>Number.isFinite(v.leg.heelToHipX)).length,
      assessment:'not_verified',
      detail:vals.length<24?'Not enough heel trajectory samples for a temporal comparison.':
        'Heel-height trend was estimated relative to hip position, but excessive cycling or faulty recovery cannot be diagnosed without phase and direction calibration.'};
  });
}
function generateCoachingFeedback(summary){
  const positives=[],issues=[],actions=[];
  if(summary.quality.adequateForPosture&&summary.phases.some(p=>p.name==='Rising posture / transition pattern')){
    positives.push({evidence:'Forward torso inclination decreased across this recording.',meaning:'A progressive rise can be appropriate during acceleration; this observation alone is not a technique grade.'});
    actions.push({focus:'Transition mechanics',instruction:'Review whether posture rises smoothly across successive steps. Confirm with a coach rather than forcing low heel recovery into upright running.'});
  }
  issues.push({label:'Ground contact',reason:'Touchdown and toe-off have not been verified. Contact duration cannot be calculated from this recording.'});
  issues.push({label:'Heel recovery and cycling',reason:'No validated phase-aware fault was detected. The tracked foot trajectory is not enough to prescribe a correction.'});
  if(!actions.length)actions.push({focus:'Obtain clear evidence',instruction:'Capture a steady, full-body side view and review the first steps through the transition with a sprint coach.'});
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
if(good){const delta=early-late;
if(early>=22&&delta>=10){phases.push({name:'Early forward-lean pattern',detail:'A forward-inclined posture was observed in the early part of the recording.'});phases.push({name:'Rising posture / transition pattern',detail:'Torso inclination decreased during the recording. A gradual rise can be normal.'});}
else if(early<20&&late<20&&Math.abs(delta)<9)phases.push({name:'Mostly upright posture',detail:'The torso remained relatively upright in the visible frames.'});
else if(early>=22&&late>=20&&Math.abs(delta)<10)phases.push({name:'Forward-inclined posture',detail:'Forward torso lean was present; individual acceleration phases cannot yet be confirmed.'});
}
const heels=analyzeHeelRecovery(f,meta);
const groundContact=detectFootEvents(f,meta);
const result={quality:{usableFrames:f.length,sampledFrames:meta.sampledFrames||f.length,poseCoverage:coverage,spanSeconds:span,effectiveFps:step?1/step:0,largestGapSeconds:maxGap,longestContinuousRun:longestRun,adequateForPosture:good,adequateForContactTiming:false},phases,heels,groundContact};
result.coaching=generateCoachingFeedback(result);
return result;
}
return {frame,summarize,detectFootEvents,analyzeHeelRecovery,generateCoachingFeedback};
});