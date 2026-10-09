(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.MWPace=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const distances=[60,100,150,200,300,400,500];
  // MW provisional assumption, not a validated race-performance prediction.
  // Personal paired marks replace this exponent as soon as usable pairs exist.
  const provisionalExponent=1.10;
  function normalize(input){
    let rows=Array.isArray(input)?input:Array.isArray(input?.prs)?input.prs:null;
    if(!rows)rows=distances.map(d=>({event:d+'m',time_seconds:input?.['p'+d]??input?.[d+'m']}));
    const byDistance=new Map();
    for(const row of rows){
      const distance=Number(String(row.event??row.distance??'').trim().replace(/m$/i,''));
      const time=Number(row.time_seconds??row.time);
      if(!distances.includes(distance)||!Number.isFinite(time)||time<=0)continue;
      byDistance.set(distance,{distance,time,markType:['race_pr','time_trial'].includes(row.mark_type)?row.mark_type:'unspecified',timingMethod:['fat','hand'].includes(row.timing_method)?row.timing_method:'unknown',date:row.date_recorded||null});
    }
    return [...byDistance.values()].sort((a,b)=>a.distance-b.distance);
  }
  function slope(a,b){
    const value=Math.log(b.time/a.time)/Math.log(b.distance/a.distance);
    return Number.isFinite(value)&&value>=.75&&value<=1.50?value:null;
  }
  function markLabel(mark){return mark.distance+'m '+(mark.markType==='time_trial'?'trial':mark.markType==='race_pr'?'race PR':'result');}
  function calculate(input,distance,intensity=1){
    distance=Number(distance);intensity=Number(intensity);
    if(!Number.isFinite(distance)||distance<=0||distance>500||!Number.isFinite(intensity)||intensity<=0||intensity>1)return null;
    const marks=normalize(input);if(!marks.length)return null;
    const exact=marks.find(m=>m.distance===distance);
    let time,anchors,method,note;
    if(exact){time=exact.time;anchors=[exact];method='measured';note='Target uses your recorded time at this distance.';}
    else{
      const lower=marks.filter(m=>m.distance<distance).at(-1),upper=marks.find(m=>m.distance>distance);
      let pair=lower&&upper?[lower,upper]:distance<marks[0].distance?marks.slice(0,2):marks.slice(-2);
      let exponent=pair.length===2?slope(pair[0],pair[1]):null;
      if(exponent!==null){
        anchors=pair;time=pair[0].time*Math.pow(distance/pair[0].distance,exponent);
        method=lower&&upper?'interpolated':'extrapolated';
        note=method==='interpolated'?'Estimated between your recorded distances.':'Starting estimate beyond your recorded distances; add a nearby trial to refine it.';
      }else{
        const nearest=marks.reduce((a,b)=>Math.abs(Math.log(b.distance/distance))<Math.abs(Math.log(a.distance/distance))?b:a);
        anchors=[nearest];time=nearest.time*Math.pow(distance/nearest.distance,provisionalExponent);method='provisional';
        note=marks.length===1?'Starting estimate from one result; add another trial to refine it.':'Starting estimate; recorded times do not form a consistent pace curve. Review trial conditions.';
      }
      if(Math.max(...anchors.map(m=>Math.max(distance/m.distance,m.distance/distance)))>2)note+=' The distance difference is large, so treat this target as provisional.';
    }
    const target=time/intensity;if(!Number.isFinite(target)||target<=0)return null;
    const estimated=method!=='measured';
    return {distance,intensity,referenceTime:time,target,low:target*.99,high:target*1.01,estimated,method,anchors,
      anchor:(estimated?'Starting estimate · ':'Recorded · ')+anchors.map(markLabel).join(' + '),note};
  }
  return {distances,normalize,calculate,provisionalExponent};
});
