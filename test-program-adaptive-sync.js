'use strict';
const assert=require('node:assert/strict');
const root=process.cwd();
function stub(file,exports){const id=require.resolve(file);require.cache[id]={id,filename:id,loaded:true,exports};}
stub(root+'/server/lib/mw-auth.js',{getAccountContext:async()=>({token:'athlete-token',user:{id:'athlete-user'},profile:{role:'athlete'},athlete:{id:'athlete-row',user_id:'athlete-user',experience_level:'performance'},programState:{onboarding_assessment_completed_at:'2026-01-01',current_week:8},features:{access:{mw_training_system:true,access_mode:'coach_linked'}}}),SUPABASE_URL:'https://db.test',SUPABASE_KEY:'publishable'});
stub(root+'/server/lib/mw-season-intelligence.js',{reconcileSeasonPlan:async()=>null,positionForPlan:()=>null,uiPhaseForCode:x=>x});
stub(root+'/server/lib/mw-program-service.js',{PROGRAM_VERSION:'test',normalizeTier:x=>x||'performance',normalizeEventGroup:()=> '100_200',programWeek:()=>({track:{sessions:[{day:1,prescribedWork:'original Monday'},{day:2,prescribedWork:'original Tuesday'}]},strength:{sections:[]}})});
stub(root+'/server/lib/mw-developmental-load.js',{developmentalLoadProfile:()=>({})});
stub(root+'/server/lib/mw-authoritative-state.js',{resolveAuthoritativeState:async()=>({week:8,day:2,authority:'test',calendar:{calendarOwner:'coach'}})});
stub(root+'/server/lib/mw-performance-intelligence.js',{loadPerformanceContext:async()=>({}),evaluatePerformance:()=>({status:'normal',directive:'Continue'})});
const handler=require('./server/api/program');
const originalFetch=global.fetch;let requested='';
global.fetch=async url=>{requested=String(url);return{ok:true,json:async()=>[{id:'review-1',program_week:8,program_day:2,session_kind:'sprint',review_status:'modified',approved_prescription:{track:{prescribedWork:'coach-adjusted Tuesday'}}}]}};
const headers={};const res={setHeader:(k,v)=>headers[k]=v,status(code){this.code=code;return this},json(body){this.body=body;return this}};
handler({method:'GET',headers:{authorization:'Bearer athlete-token'},query:{}},res).then(()=>{
  assert.equal(res.code,200);assert.equal(headers['Cache-Control'],'no-store, private');
  assert.equal(res.body.track.sessions[1].prescribedWork,'coach-adjusted Tuesday');
  assert.equal(res.body.track.sessions[0].prescribedWork,'original Monday');
  assert.equal(res.body.adaptiveAdjustmentStatus,'applied');assert.equal(res.body.adaptiveAdjustment.reviewId,'review-1');
  assert.match(requested,/athlete_id=eq\.athlete-user/);assert.match(requested,/program_week=eq\.8/);assert.match(requested,/program_day=eq\.2/);
  console.log('PASS: the authenticated athlete program endpoint loads only the signed-in athlete’s approved current-day adjustment and applies it to the returned schedule.');
}).catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{global.fetch=originalFetch});
