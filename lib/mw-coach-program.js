(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.MWCoachProgram=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const days=['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const dayNumber=s=>days.findIndex(d=>new RegExp('^'+d.slice(0,3),'i').test(String(s).trim()))+1;
const num=v=>v===''||v==null?null:Number(v);
function duration(text,kind){const re=new RegExp('(\\d+(?:\\.\\d+)?)\\s*(minutes?|mins?|seconds?|secs?|s)\\s*(?:between|per)?\\s*'+kind,'i');const m=String(text).match(re);return m?Number(m[1])*(/^m/i.test(m[2])?60:1):null;}
// Recognize explicit recovery/rest days without converting unparsed running prescriptions.
function autoClassify(session){
 const work=String(session.work||'').replace(/\bno\b[^.!?\n]*(?:[.!?]|$)/gi,'');
 const clear=!session.blocks?.length&&/\b(rest|recovery)\b/i.test(session.title||'')&&!/(?:\d+(?:\.\d+)?\s*(?:m\b|meters?\b|metres?\b|reps?\b|sets?\b|[x×])|\b(?:sprints?|intervals?)\b)/i.test(work);
 if(clear){session.manualOnly=true;session.autoNonTimed=true;}else if(session.autoNonTimed){session.manualOnly=false;delete session.autoNonTimed;}
 return session;
}
function parse(text){
 const sessions=[];let week=1,current=null;
 for(const original of String(text).replace(/[×]/g,'x').split(/\r?\n/)){
  const line=original.trim();if(!line||/^Test file only|^\d+\s*\/\s*\d+\s*$/.test(line))continue;
  const wk=line.match(/\bweek\s*(\d+)\b/i);if(wk){week=Number(wk[1]);if(!/^\s*(mon|tue|wed|thu|fri|sat|sun)/i.test(line))continue;}
  const heading=line.match(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|Sun)\b\s*(?:[|:\-–]\s*)?(.*)$/i);
  if(heading){current={id:'w'+week+'d'+dayNumber(heading[1])+'s'+sessions.length,week,day:dayNumber(heading[1]),title:heading[2].replace(/^\/\s*Sunday\s*[|:\-–]?\s*/i,'')||heading[1],warmup:'',work:'',recovery:'',cooldown:'',notes:'',blocks:[]};sessions.push(current);if(/rest day/i.test(current.title)){current.work='Rest day.';}if(/^Saturday\s*\/\s*Sunday/i.test(line)){sessions.push({...current,id:'w'+week+'d7s'+sessions.length,day:7});}continue;}
  if(!current)continue;
  if(/^warm.?up\s*:/i.test(line)){current.warmup=line.replace(/^warm.?up\s*:\s*/i,'');continue;}
  if(/^cool.?down\s*:/i.test(line)){current.cooldown=line.replace(/^cool.?down\s*:\s*/i,'');continue;}
  if(/^recovery\s*:|^rest\s*:/i.test(line)){current.recovery+=(current.recovery?'\n':'')+line.replace(/^(recovery|rest)\s*:\s*/i,'');continue;}
  current.work+=(current.work?'\n':'')+line.replace(/^main session\s*:\s*/i,'');
  let m=line.match(/(\d+)\s*sets?\s*(?:of|x)\s*(\d+)\s*(?:reps?\s*)?x\s*(\d+(?:\.\d+)?)\s*(?:m\b|meters?\b|metres?\b)/i);let sets=1,reps,distance;
  if(m){sets=Number(m[1]);reps=Number(m[2]);distance=Number(m[3]);}
  else{m=line.match(/(\d+)\s*(?:reps?\s*)?x\s*(\d+(?:\.\d+)?)\s*(?:m\b|meters?\b|metres?\b)/i);if(m){reps=Number(m[1]);distance=Number(m[2]);}}
  if(m){const pct=line.match(/(\d+(?:\.\d+)?)\s*%/);current.blocks.push({id:'b'+current.blocks.length,sets,reps,distance,intensityPct:pct?Number(pct[1]):null,restSeconds:null,setRestSeconds:null});}
 }
 for(const s of sessions)for(const b of s.blocks){b.restSeconds=duration(s.recovery,'reps?');b.setRestSeconds=duration(s.recovery,'sets?');}
 sessions.forEach(autoClassify);
 return sessions;
}
function validate(sessions){const errors=[];if(!Array.isArray(sessions)||!sessions.length)return ['Add at least one workout day.'];if(sessions.length>287)return ['Keep the program to 41 weeks.'];const ids=new Set();
 for(const s of sessions){const label='Week '+s?.week+' · '+(days[Number(s?.day)-1]||'Choose day')+' · '+(s?.title||'Untitled workout');if(!s||typeof s!=='object'||!Array.isArray(s.blocks)){errors.push(label+': Every session needs a valid block list.');continue;}if(s.blocks.length>20){errors.push(label+': Maximum 20 timed blocks per day.');continue;}if(!s.id||ids.has(s.id))errors.push(label+': Each session must have a unique identifier.');ids.add(s.id);if(!Number.isInteger(num(s.week))||s.week<1||s.week>41||!Number.isInteger(num(s.day))||s.day<1||s.day>7)errors.push(label+': Every workout needs a week (1-41) and day (1-7).');if(!String(s.title||'').trim()||!String(s.work||'').trim())errors.push(label+': Every workout needs a title and prescription.');
  if(!s.blocks?.length&&!s.manualOnly)errors.push(label+': choose no rep timing for this day, or enter its sets, reps and distance.');
  for(const b of s.blocks||[]){if(!b||typeof b!=='object'){errors.push(label+': Invalid timed block.');continue;}if(!Number.isInteger(num(b.sets))||b.sets<1||!Number.isInteger(num(b.reps))||b.reps<1||b.reps*b.sets>200)errors.push(label+': sets and reps must be whole numbers (maximum 200 total).');if(!Number.isInteger(num(b.distance))||b.distance<1||b.distance>10000)errors.push(label+': enter a whole-meter distance.');if(b.intensityPct!=null&&(!(b.intensityPct>0)||b.intensityPct>100))errors.push(label+': intensity must be 1-100%.');if(b.restSeconds==null||!Number.isFinite(num(b.restSeconds))||b.restSeconds<0||b.restSeconds>3600)errors.push(label+': enter rep rest (0-3600 seconds).');if(b.sets>1&&(b.setRestSeconds==null||!Number.isFinite(num(b.setRestSeconds))||b.setRestSeconds<0||b.setRestSeconds>3600))errors.push(label+': enter set rest (0-3600 seconds).');}
 }return [...new Set(errors)];}
function datePosition(start,date){if(!/^\d{4}-\d{2}-\d{2}$/.test(start||'')||!/^\d{4}-\d{2}-\d{2}$/.test(date||''))return null;const startMs=Date.parse(start+'T12:00:00Z'),dateMs=Date.parse(date+'T12:00:00Z'),weekday=(new Date(startMs).getUTCDay()+6)%7;const monday=startMs-weekday*86400000,diff=Math.floor((dateMs-monday)/86400000);if(dateMs<startMs||diff<0)return null;return {week:Math.floor(diff/7)+1,day:diff%7+1};}
function today(program,start,date){const p=datePosition(start,date);return p?(program.content?.sessions||[]).filter(s=>Number(s.week)===p.week&&Number(s.day)===p.day):[];}
function plan(session,assignment,revision,athleteId,date,blockIndex=0){const b=session.blocks?.[blockIndex];if(!b)return null;const reps=b.sets*b.reps;return {reps,distance:b.distance,intensityPct:b.intensityPct,restSeconds:b.restSeconds,setRestSeconds:b.setRestSeconds,repsPerSet:b.reps,sets:b.sets,raw:session.work,intent:/accel|speed/i.test(session.title)?'speed':/recovery/i.test(session.title)?'recovery':'pace',week:session.week,day:session.day,sourceWeek:session.week,custom:true,assignmentId:assignment.id||assignment.assignment_id,customSessionId:session.id,blockIndex,revision,sessionDate:date,workoutKey:['custom',assignment.id||assignment.assignment_id,revision,session.id,blockIndex,athleteId,date].join(':')};}
return {parse,autoClassify,validate,today,plan,datePosition,days};
});
