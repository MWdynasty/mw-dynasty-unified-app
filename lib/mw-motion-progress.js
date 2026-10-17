/* MW Dynasty — conservative comparison of recent, private 2D motion estimates.
 * No inference of speed, improvement, technique quality, injury, or fatigue.
 */
(function(root,factory){
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.MWMotionProgress=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const NAMES=Object.freeze({trunk_tilt_2d:'Trunk tilt',knee_angle_2d:'Knee angle',shin_tilt_2d:'Shin tilt'});
 function summarize(reviews){
  if(!Array.isArray(reviews))return [];
  const groups=new Map();
  for(const review of reviews){
   if(!review||review.provenance!=='unverified_client_2d'||
      typeof review.movement_type!=='string'||
      !Array.isArray(review.metrics)||!Number.isFinite(Date.parse(review.created_at)))continue;
   const list=groups.get(review.movement_type)||[];
   list.push(review);groups.set(review.movement_type,list);
  }
  const summaries=[];
  for(const [movement,items] of groups){
   items.sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at));
   if(items.length<2)continue;
   const first=items[0],last=items.at(-1);
   if((first.id||first.assessment_id)===(last.id||last.assessment_id))continue;
   const metrics=[];
   for(const metric of last.metrics){
    if(!Object.prototype.hasOwnProperty.call(NAMES,metric.name)||
       !Number.isFinite(metric.medianDegrees)||metric.medianDegrees<0||metric.medianDegrees>180)continue;
    const baseline=first.metrics.find(m=>m.name===metric.name);
    if(!baseline||!Number.isFinite(baseline.medianDegrees)||
       baseline.medianDegrees<0||baseline.medianDegrees>180)continue;
    metrics.push({
     name:metric.name,label:NAMES[metric.name],
     earlier:Math.round(baseline.medianDegrees*10)/10,
     later:Math.round(metric.medianDegrees*10)/10,
     difference:Math.round((metric.medianDegrees-baseline.medianDegrees)*10)/10
    });
   }
   if(metrics.length)summaries.push({
    movementType:movement,recordings:items.length,
    firstWeek:Number.isInteger(first.week_number)?first.week_number:null,
    lastWeek:Number.isInteger(last.week_number)?last.week_number:null,
    metrics,
    disclaimer:'Differences are uncalibrated 2D camera estimates. A change does not mean better or worse sprint technique.'
   });
  }
  return summaries.sort((a,b)=>a.movementType.localeCompare(b.movementType));
 }
 return Object.freeze({summarize});
});
