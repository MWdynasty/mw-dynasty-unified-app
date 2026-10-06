'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const bundles=['coach/app.js','coach/app-live-20261005-r1.js'];
for(const path of bundles){
 const source=fs.readFileSync(path,'utf8'),calls=[];
 const fn=source.slice(source.indexOf('function handleCoachAccessFailure('),source.indexOf('async function holdCoachEntering('));
 const ctx={renderCoachMembershipSelection:s=>calls.push(['membership',s]),clearSession:()=>calls.push(['clear']),renderLogin:m=>calls.push(['login',m])};
 vm.runInNewContext(fn,ctx);
 const session={fixture:true};ctx.handleCoachAccessFailure(session,{code:'COACH_MEMBERSHIP_REQUIRED',message:'Membership required'});
 assert.deepEqual(calls,[['membership',session]],path+' genuine unpaid coach retains purchase path');
 for(const code of ['COACH_ROLE_REQUIRED','',undefined]){
  calls.length=0;ctx.handleCoachAccessFailure(session,{code,status:403,message:'Use Athlete sign in'});
  assert.deepEqual(calls,[['clear'],['login','Use Athlete sign in']],path+' wrong-role/unknown denial must not claim verification or offer checkout');
 }
 assert.ok(source.includes('handleCoachAccessFailure(session,accessErr)'));
 assert.ok(source.includes('handleCoachAccessFailure(active,accessErr)'),'returning session uses same role guard');
 assert.ok(source.includes("err.code=d.code||''"),'retain server access reason');
}
assert.equal(fs.readFileSync(bundles[0],'utf8'),fs.readFileSync(bundles[1],'utf8'));
// Exercise the actual server authentication helper, not an invented access model.
const authSource=fs.readFileSync('server/lib/mw-coach-auth.js','utf8');
async function auth(role){
 const context={module:{exports:{}},process:{env:{}},fetch:async url=>({ok:true,json:async()=>
  url.endsWith('/auth/v1/user')?{id:'fixture-user',email:'fixture@example.invalid'}:
  url.includes('/profiles?')?[{user_id:'fixture-user',role,account_status:'active'}]:
  url.includes('/athletes?')?[{id:'fixture-athlete'}]:[]})};
 vm.runInNewContext(authSource,context);
 return context.module.exports.getAccountContext({headers:{authorization:'Bearer fixture'}});
}
(async()=>{
 await assert.rejects(auth('coach'),e=>e.status===403&&e.code==='COACH_MEMBERSHIP_REQUIRED');
 const athlete=await auth('athlete');assert.equal(athlete.profile.role,'athlete');
 const handler=fs.readFileSync('server/api/coach/access.js','utf8'),ctx={module:{exports:{}},require:name=>name.includes('mw-coach-auth')?{getAccountContext:async()=>athlete}: {coachSeasonCapabilities:()=>({})}};
 vm.runInNewContext(handler,ctx);let status,body;
 await ctx.module.exports({method:'GET'},{setHeader(){},status(s){status=s;return this},json(b){body=b;return this}});
 assert.equal(status,403);assert.equal(body.code,'COACH_ROLE_REQUIRED');assert.match(body.error,/Athlete sign in/);
 console.log('PASS: actual Coach access routes reject athlete accounts without checkout; only verified unpaid Coaches reach membership selection, including returning sessions.');
})().catch(e=>{console.error(e);process.exitCode=1});
