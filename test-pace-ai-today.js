const fs=require('fs');
const assert=require('assert');

const html=fs.readFileSync('pace-ai/index.html','utf8');

assert(html.includes('id="loadWorkout"'),'Pace AI Load Today button must exist');
assert(html.includes('<option value="5">5 · FRI</option>'),'Pace AI day selector must include Friday / Day 5');
assert(!html.includes('Math.min(4,s.current_day)'),'Pace AI must not clamp Friday to Thursday');
assert(html.includes("$('#loadWorkout').onclick=loadTodayWorkout"),'Load Today button must use the authoritative today loader');
assert(html.includes("fetch('/api/program'"),'Load Today must fetch the authoritative MW program without a stale selected-week dependency');
assert(html.includes('d.seasonIntelligence?.week||d.officialWeek||d.week'),'Load Today must prefer Season Intelligence week');
assert(html.includes('d.seasonIntelligence?.day||d.officialDay'),'Load Today must prefer Season Intelligence day');
assert(html.includes("session?.prescribedWork||session?.work||session?.structure"),'Pace AI must read V3 prescribedWork');
assert(html.includes('day&&day>=1&&day<=5'),'Pace AI questions must support Friday / Day 5');
assert(html.includes("setTimeout(()=>{loadTodayWorkout()},100)"),'Authenticated athlete context must trigger the authoritative today loader');

const inline=[...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m=>m[1]).filter(s=>s.trim());
for(const [i,script] of inline.entries()){
  assert.doesNotThrow(()=>new Function(script),'Pace AI inline script '+i+' must parse');
}

console.log('PASS: Pace AI Load Today follows authoritative Season Intelligence, supports Friday, and reads V3 prescriptions.');
