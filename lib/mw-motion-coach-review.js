/* MW Motion Intelligence — deterministic, evidence-bounded athlete review.
 * Uses only locally computed 2D pose measurements. No network, AI inference,
 * performance grading, normative angle targets, or medical conclusions.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.MWMotionCoachReview=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const SKILLS=Object.freeze({
 block_start:{name:'Block start',focus:'Set up a consistent block position and film the first few steps from the side.',cue:'Push through the start, then allow your posture to rise naturally.',watch:'The first push and the first few contacts'},
 two_point_start:{name:'Two-point start',focus:'Repeat the same two-point setup for each rep.',cue:'Push the ground behind you and keep your movement directed forward.',watch:'Your push and first few steps'},
 three_point_start:{name:'Three-point start',focus:'Repeat the same three-point setup for each rep.',cue:'Drive out smoothly rather than rushing upright.',watch:'The push-off and early steps'},
 four_point_start:{name:'Four-point start',focus:'Set the same starting posture before each rep.',cue:'Push away from the line and let your body rise through acceleration.',watch:'The initial push and body rise'},
 acceleration_30m:{name:'First 30m acceleration',focus:'Use a stable side-view clip covering the first 30 meters.',cue:'Build speed through progressive steps instead of forcing an early upright position.',watch:'How posture changes across the run'},
 front_side:{name:'Front-side mechanics',focus:'Keep the entire body in view during front-side drill repetitions.',cue:'Move rhythmically and think about bringing the foot back down under the body.',watch:'Leg recovery and contact rhythm'},
 wickets:{name:'Wicket drill',focus:'Capture a side view with several clear wicket contacts.',cue:'Stay rhythmic through the wickets without reaching for each marker.',watch:'Rhythm and step placement'}
});
const METRICS=Object.freeze({
 trunk_tilt_2d:'Trunk tilt',
 knee_angle_2d:'Knee angle',
 shin_tilt_2d:'Shin tilt'
});
function round(v){return Math.round(v*10)/10;}
function median(values){
 const s=values.slice().sort((a,b)=>a-b);
 if(!s.length)return null;
 const i=Math.floor(s.length/2);
 return s.length%2?s[i]:((s[i-1]+s[i])/2);
}
function format(n){return Number(n).toFixed(1)+'°';}
function review({analysis,movementType,attemptedFrames,poseFrames}={}){
 if(!analysis||typeof analysis!=='object')throw new Error('Motion analysis required.');
 const skill=SKILLS[analysis.movementType||movementType]||null;
 const sampled=Number.isInteger(attemptedFrames)&&attemptedFrames>=0?attemptedFrames:0;
 const detected=Number.isInteger(poseFrames)&&poseFrames>=0?Math.min(poseFrames,sampled):0;
 const coverage=sampled?Math.round(100*detected/sampled):0;
 const common={
  skill:skill?.name||'Sprint technique',
  status:'not_assessed',
  evidenceSummary:sampled?detected+' of '+sampled+' sampled frames had a visible pose ('+coverage+'%).':'No usable sampled frames.',
  observations:[],
  focus:skill?.focus||'Film the movement clearly from the side.',
  cue:null,
  watch:skill?.watch||'Movement rhythm',
  disclaimer:'Experimental 2D observations only. No technique grade, injury assessment, or validated performance prediction.'
 };
 if(analysis.status!=='estimated_2d'||!skill||!Array.isArray(analysis.metrics)||!analysis.metrics.length){
  return {...common,reason:analysis.reason||'Insufficient reliable evidence for a technique review.',
   nextStep:'Retake a steady side-view clip with your full body visible.'};
 }
 const observations=[];
 for(const metric of analysis.metrics){
  if(!Object.prototype.hasOwnProperty.call(METRICS,metric.name)||
    !Number.isFinite(metric.value)||!Array.isArray(metric.evidence))continue;
  const valid=metric.evidence.filter(e=>Number.isFinite(e?.timeMs)&&
    Number.isFinite(e?.value)&&e.value>=0&&e.value<=180)
   .sort((a,b)=>a.timeMs-b.timeMs);
  if(valid.length<5)continue;
  const n=Math.max(2,Math.floor(valid.length/3));
  const early=median(valid.slice(0,n).map(e=>e.value));
  const late=median(valid.slice(-n).map(e=>e.value));
  observations.push({
   name:metric.name,label:METRICS[metric.name],
   medianDegrees:round(metric.value),
   earlyDegrees:round(early),lateDegrees:round(late),
   changeDegrees:round(late-early),
   samples:valid.length,
   summary:METRICS[metric.name]+' was '+format(metric.value)+' at the clip median; earlier samples '+format(early)+', later samples '+format(late)+'.'
  });
 }
 if(!observations.length){
  return {...common,reason:'Not enough trustworthy joint measurements were available.',
   nextStep:'Retake a side-view clip with your hips, knees, shoulders and ankles visible.'};
 }
 return {...common,status:'observations_available',observations,
  cue:skill.cue,
  nextStep:'For your next repetition, focus on: '+skill.watch.toLowerCase()+'. The camera angles alone cannot tell whether a movement was correct or incorrect.'};
}
function spokenText(result){
 if(!result||typeof result!=='object')return '';
 const pieces=['Coach MW motion review for '+result.skill+'.',result.evidenceSummary];
 if(result.status==='observations_available'){
  pieces.push('What the camera estimated:');
  for(const o of result.observations)pieces.push(o.label+' median '+format(o.medianDegrees)+'.');
  pieces.push('Practice focus: '+result.focus);
  if(result.cue)pieces.push('Cue: '+result.cue);
 }else pieces.push(result.reason||'There is not enough reliable evidence.');
 pieces.push(result.nextStep,result.disclaimer);
 return pieces.filter(Boolean).join(' ');
}
return Object.freeze({SKILLS,METRICS,review,spokenText});
});
