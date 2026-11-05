(function(root,factory){const v=factory();if(typeof module==='object'&&module.exports)module.exports=v;else root.MWMotionTracking=v;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const finite=Number.isFinite,median=a=>{const x=a.filter(finite).slice().sort((a,b)=>a-b);return x.length?x[Math.floor(x.length/2)]:null};
const point=(p,i)=>{const v=p?.[i];return v&&finite(v.x)&&finite(v.y)&&(v.visibility==null||v.visibility>=0.5)?{x:v.x,y:v.y}:null};
function frame(p,time){
const l=point(p,11),r=point(p,12),lh=point(p,23),rh=point(p,24);if(!l||!r||!lh||!rh||!finite(time))return null;
const shoulder={x:(l.x+r.x)/2,y:(l.y+r.y)/2},hip={x:(lh.x+rh.x)/2,y:(lh.y+rh.y)/2},scale=Math.hypot(shoulder.x-hip.x,shoulder.y-hip.y);
if(scale<0.03)return null;
const legs=[0,1].map(side=>{const h=point(p,side?24:23),k=point(p,side?26:25),a=point(p,side?28:27);
return {side:side?'right':'left',valid:!!(h&&k&&a),ankle:a||null,knee:k||null,heelHeight:h&&a?(h.y-a.y)/scale:null};});
return {time,trunk:Math.atan2(Math.abs(shoulder.x-hip.x),Math.abs(hip.y-shoulder.y))*180/Math.PI,legs};
}
function summarize(frames,meta={}){
const f=frames.filter(v=>v&&finite(v.time)&&finite(v.trunk)).slice().sort((a,b)=>a.time-b.time);
const span=f.length?f[f.length-1].time-f[0].time:0,gaps=f.slice(1).map((v,i)=>v.time-f[i].time).filter(n=>n>0),step=median(gaps);
const good=f.length>=18&&span>=0.75&&f.length/Math.max(1,meta.sampledFrames||f.length)>=0.55,third=Math.max(1,Math.floor(f.length/3));
const early=median(f.slice(0,third).map(x=>x.trunk)),late=median(f.slice(-third).map(x=>x.trunk)),phases=[];
if(good){const delta=early-late;
if(early>=22&&delta>=10){phases.push({name:'Early forward-lean pattern',detail:'A forward-inclined posture was observed in the early part of the recording.'});phases.push({name:'Rising posture / transition pattern',detail:'Torso inclination decreased during the recording. A gradual rise can be normal.'});}
else if(early<20&&late<20&&Math.abs(delta)<9)phases.push({name:'Mostly upright posture',detail:'The torso remained relatively upright in the visible frames.'});
else if(early>=22&&late>=20&&Math.abs(delta)<10)phases.push({name:'Forward-inclined posture',detail:'Forward torso lean was present; individual acceleration phases cannot yet be confirmed.'});
}
const heels=['left','right'].map(side=>{const vals=f.map(v=>v.legs?.find(x=>x.side===side&&x.valid)?.heelHeight).filter(finite);return {side,trackedFrames:vals.length,range:vals.length>=18?Math.max(...vals)-Math.min(...vals):null};});
return {quality:{usableFrames:f.length,sampledFrames:meta.sampledFrames||f.length,spanSeconds:span,effectiveFps:step?1/step:0,adequateForPosture:good,adequateForContactTiming:false},phases,heels,
groundContact:{status:'not_verified',touchdown:null,toeOff:null,contactMilliseconds:null,reason:'Foot-to-track contact cannot be established from image-space ankle positions without a calibrated event detector.'}};
}
return {frame,summarize};
});