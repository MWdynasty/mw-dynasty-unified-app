/* MW Motion Intelligence: observational 2D pose measurements.
 * No video processing, no lab-grade 3D claims, and no coaching prescriptions.
 * Input: time-stamped MediaPipe-style normalized landmarks from a future pose extractor.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.MWMotionBiomechanics=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const REQUIRED_VISIBILITY=0.8,MIN_FRAMES=5;
const CATEGORIES=Object.freeze({
 block_start:['trunk_tilt_2d','knee_angle_2d','shin_tilt_2d'],
 two_point_start:['trunk_tilt_2d','knee_angle_2d','shin_tilt_2d'],
 three_point_start:['trunk_tilt_2d','knee_angle_2d','shin_tilt_2d'],
 four_point_start:['trunk_tilt_2d','knee_angle_2d','shin_tilt_2d'],
 acceleration_30m:['trunk_tilt_2d','shin_tilt_2d'],
 front_side:['knee_angle_2d','trunk_tilt_2d'],
 wickets:['knee_angle_2d','trunk_tilt_2d']
});
const SIDES=[{shoulder:11,hip:23,knee:25,ankle:27},{shoulder:12,hip:24,knee:26,ankle:28}];
function point(p){
 if(!p||![p.x,p.y,p.visibility].every(Number.isFinite)||p.visibility<REQUIRED_VISIBILITY||
 p.x<0||p.x>1||p.y<0||p.y>1)return null;
 return p;
}
function angle2d(a,b,c){
 if(!a||!b||!c)return null;
 const u=[a.x-b.x,a.y-b.y],v=[c.x-b.x,c.y-b.y];
 const norm=Math.hypot(...u)*Math.hypot(...v);
 if(norm<1e-8)return null;
 return Math.acos(Math.max(-1,Math.min(1,(u[0]*v[0]+u[1]*v[1])/norm)))*180/Math.PI;
}
function tiltFromVertical(a,b){
 if(!a||!b)return null;
 const dx=Math.abs(a.x-b.x),dy=Math.abs(a.y-b.y);
 if(dx+dy<1e-8)return null;
 return Math.atan2(dx,dy)*180/Math.PI;
}
function median(numbers){
 if(!numbers.length)return null;
 const sorted=numbers.slice().sort((a,b)=>a-b);
 return sorted.length%2?sorted[(sorted.length-1)/2]:(sorted[sorted.length/2-1]+sorted[sorted.length/2])/2;
}
function measureFrame(frame){
 if(!frame||!Array.isArray(frame.landmarks)||!Number.isFinite(frame.timeMs)||frame.timeMs<0)return null;
 const candidates=SIDES.map(side=>{
  const p={};
  for(const [key,index] of Object.entries(side))p[key]=point(frame.landmarks[index]);
  const complete=Object.values(p).filter(Boolean);
  return {p,complete:complete.length,confidence:complete.length?Math.min(...complete.map(q=>q.visibility)):0};
 }).sort((a,b)=>b.complete-a.complete||b.confidence-a.confidence);
 const chosen=candidates[0];
 if(chosen.complete!==4)return null;
 const p=chosen.p;
 return {timeMs:frame.timeMs,confidence:chosen.confidence,
  trunk_tilt_2d:tiltFromVertical(p.shoulder,p.hip),
  knee_angle_2d:angle2d(p.hip,p.knee,p.ankle),
  shin_tilt_2d:tiltFromVertical(p.knee,p.ankle)};
}
function analyze({movementType,cameraView,frames}={}){
 if(!Object.prototype.hasOwnProperty.call(CATEGORIES,movementType))throw new Error('Unsupported movement');
 const limitations=['2D camera-perspective estimates only; not calibrated 3D biomechanics.',
 'Camera angle, occlusion, clothing and image quality may affect landmark positions.',
 'Do not infer ground-reaction forces, performance gains or optimal technique from these values.'];
 if(cameraView!=='side')return {status:'insufficient_evidence',reason:'Standardized side-view footage required for angle estimates.',metrics:[],limitations};
 if(!Array.isArray(frames)||frames.length<MIN_FRAMES)return {status:'insufficient_evidence',reason:'Not enough frames for analysis.',metrics:[],limitations};
 const samples=frames.map(measureFrame).filter(Boolean);
 if(samples.length<MIN_FRAMES)return {status:'insufficient_evidence',reason:'Body landmarks are not consistently visible.',metrics:[],limitations};
 const metrics=CATEGORIES[movementType].map(key=>{
  const evidence=samples.filter(x=>Number.isFinite(x[key])).map(x=>({timeMs:x.timeMs,value:x[key],visibility:x.confidence}));
  if(evidence.length<MIN_FRAMES)return null;
  return {name:key,unit:'degrees',method:'estimated_2d',value:Math.round(median(evidence.map(x=>x.value))*10)/10,
   sampleCount:evidence.length,visibilityFloor:Math.min(...evidence.map(x=>x.visibility)),
   evidence:evidence.slice(0,60)};
 }).filter(Boolean);
 if(!metrics.length)return {status:'insufficient_evidence',reason:'Angles could not be estimated reliably.',metrics:[],limitations};
 return {status:'estimated_2d',movementType,cameraView,metrics,limitations};
}
return Object.freeze({REQUIRED_VISIBILITY,MIN_FRAMES,CATEGORIES,angle2d,tiltFromVertical,measureFrame,analyze});
});
