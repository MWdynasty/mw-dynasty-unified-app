const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const coach=require('../lib/mw-motion-coach-review.js');
const {buildPersonalPerformancePlan}=require('../server/lib/mw-season-intelligence.js');
const plan=buildPersonalPerformancePlan({startDate:'2026-01-05'});
for(let week=1;week<=41;week++){
 const context=coach.trainingFocus({weekNumber:week,programState:'active'});
 assert.ok(context.label.includes(plan.sourceWeekMap[String(week)].phaseLabel));
 assert.ok(context.label.includes('Week '+week+' of 41'));
 assert.ok(!context.focus.includes('championship'));
}
assert.equal(coach.trainingFocus({weekNumber:0}),null);
assert.equal(coach.trainingFocus({weekNumber:42}),null);
assert.match(coach.trainingFocus({weekNumber:null,programState:'scheduled',programStartDate:'2026-10-19'}).label,/Before Week 1/);
const config=JSON.parse(fs.readFileSync('vercel.json','utf8'));
function headers(path){
 const result={};
 for(const rule of config.headers)if(new RegExp('^'+rule.source+'$').test(path))
  for(const h of rule.headers)(result[h.key]??=[]).push(h.value);
 return result;
}
for(const path of ['/athlete/motion','/athlete/motion.html','/coach/motion','/coach/motion.html']){
 const h=headers(path);
 assert.equal(h['Content-Security-Policy'].length,1,'CSP policies must not intersect and block Motion');
 assert.match(h['Content-Security-Policy'][0],/wasm-unsafe-eval/);
 assert.match(h['Content-Security-Policy'][0],/media-src[^;]+uuggbmccnyswiwkjgydo/);
 assert.match(h['Content-Security-Policy'][0],/script-src[^;]+@supabase/);
 assert.match(h['Permissions-Policy'][0],/camera=\(self\)/);
}
for(const path of ['/athlete','/athlete/','/coach/','/founder/','/api/mw']){
 const h=headers(path);assert.equal(h['Content-Security-Policy'].length,1);
 assert.ok(!h['Content-Security-Policy'][0].includes('wasm-unsafe-eval'));
 assert.match(h['Permissions-Policy'][0],/camera=\(\)/);
}
const html=fs.readFileSync('athlete/motion.html','utf8');
const code=html.slice(html.lastIndexOf('<script>')+8,html.lastIndexOf('</script>'));
assert.doesNotThrow(()=>new vm.Script(code));
assert.match(html,/id="camera-clip"[^>]+capture="environment"/);
assert.ok(!html.match(/id="clip"[^>]+capture=/),'Saved-video upload must not force the camera');
assert.ok(html.includes("await production.auth.signOut({scope:'local'})"));
assert.ok(html.includes('if(activeUserId===uploadOwner&&feedbackAfterUpload)'));
assert.ok(!html.includes('analysis is not active yet'));
console.log('Release access: shared 41-week coaching focus, camera/upload paths, automatic feedback, scoped CSP and normal-page policy passed.');
