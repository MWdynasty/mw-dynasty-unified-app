const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
(async()=>{
 const validation=await import('../supabase/functions/mw-motion-pilot/validation.mjs');
 const founder='73ef4c5f-41da-4108-8572-a80b6a83c990';
 const uid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 const origin='https://motion-staging.mwdynasty.com';
 let user={id:founder,email_confirmed_at:'2026-01-01'},dob='1995-08-24',plans=[],approval=null;
 let wrongProject=false,created=false,identityMarker=founder,handler;
 const writes=[],productionWrites=[];
 const builder=(table,production=false)=>{
  const q={select(){return q;},eq(){return q;},limit(){return q;},
   maybeSingle:async()=>({data:production?{id:'athlete',date_of_birth:dob,program_start_date:'2026-10-19'}:approval,error:null}),
   upsert:async row=>{(production?productionWrites:writes).push({table,row});return {error:null};},
   insert:async row=>{(production?productionWrites:writes).push({table,row});return {error:null};},
   then:ok=>Promise.resolve({data:plans,error:null}).then(ok)};
  return q;
 };
 const admin={from:t=>builder(t),auth:{admin:{
  createUser:async data=>{
   assert.equal(data.app_metadata.motion_founder_production_user_id,founder);
   assert.equal(data.password,undefined,'Never copy a production password');
   const prior=created;created=true;return {error:prior?{code:'email_exists'}:null};
  },
  generateLink:async()=>({data:{user:{id:uid,app_metadata:{motion_founder_production_user_id:identityMarker}},
   properties:{hashed_token:'internal-once'}},error:null})
 }}};
 const production={auth:{getUser:async token=>({data:{user:token==='valid-production-token'?user:null},error:null})},
  from:t=>builder(t,true)};
 const stagePublic={auth:{verifyOtp:async input=>{
  assert.deepEqual(JSON.parse(JSON.stringify(input)),{token_hash:'internal-once',type:'magiclink'});
  return {data:{session:{access_token:'separate-staging-token',refresh_token:'separate-staging-refresh',expires_in:3600},user:{id:uid}},error:null};
 }}};
 const source=fs.readFileSync('supabase/functions/mw-motion-founder-access/index.ts','utf8')
  .replace(/import \{createClient\}[^\n]+\n/,'const createClient=__createClient;\n')
  .replace(/import \{ALLOWED_ORIGIN,adult\}[^\n]+\n/,'const {ALLOWED_ORIGIN,adult}=__validation;\n');
 vm.runInNewContext(source,{
  __validation:validation,__createClient:(url,key)=>url.includes('keqgun')?production:key==='server-secret'?admin:stagePublic,
  Deno:{env:{get:key=>key==='SUPABASE_URL'?(wrongProject?'https://production.invalid':'https://uuggbmccnyswiwkjgydo.supabase.co'):'server-secret'},serve:fn=>{handler=fn;}},
  Request,Response,Date,JSON,console
 });
 const call=async(token='valid-production-token',body={consentAccepted:true,consentVersion:'pilot-v1'},host=origin)=>{
  const response=await handler(new Request('https://staging.invalid',{method:'POST',headers:{
   Authorization:'Bearer '+token,Origin:host,'Content-Type':'application/json'},body:JSON.stringify(body)}));
  return {status:response.status,body:await response.json(),headers:response.headers};
 };
 assert.equal((await call('wrong-token')).status,401);
 user={id:'other',email_confirmed_at:'2026-01-01',user_metadata:{role:'founder_owner'}};
 assert.equal((await call()).status,403,'User metadata cannot grant founder access');
 user={id:founder,email_confirmed_at:'2026-01-01'};
 assert.equal((await call(undefined,{consentAccepted:false})).status,422);
 assert.equal((await call(undefined,undefined,'https://app.mwdynasty.com')).status,403);
 dob='2015-01-01';assert.equal((await call()).status,403);dob='1995-08-24';
 plans=[{season_start_date:'2026-10-19'},{season_start_date:'2026-11-02'}];
 assert.equal((await call()).status,409);plans=[];
 wrongProject=true;assert.equal((await call()).status,503);wrongProject=false;
 assert.equal(writes.length,0,'Unauthorized attempts must never provision access');
 let r=await call();assert.equal(r.status,200);
 assert.equal(r.body.access_token,'separate-staging-token');
 assert.ok(!JSON.stringify(r.body).includes('valid-production-token'));
 assert.equal(r.headers.get('cache-control'),'no-store');
 assert.equal(r.headers.get('access-control-allow-origin'),origin);
 assert.ok(writes.some(x=>x.table==='athletes'&&x.row.program_start_date==='2026-10-19'));
 assert.ok(writes.some(x=>x.table==='motion_pilot_approvals'&&x.row.expires_at==='2026-11-16T23:59:59Z'));
 const before=writes.length;
 approval={status:'revoked',expires_at:'2099-01-01'};
 assert.equal((await call()).status,403);
 assert.equal(writes.length,before,'Sign-in cannot reactivate revoked authorization');
 approval={status:'active',expires_at:'2020-01-01'};assert.equal((await call()).status,403);
 approval={status:'active',expires_at:'2099-01-01'};
 identityMarker='other';assert.equal((await call()).status,503);identityMarker=founder;
 plans=[{season_start_date:'2026-10-26'}];r=await call();assert.equal(r.status,200);
 assert.equal(writes.at(-2).row.program_start_date,'2026-10-26','Use the active shared season anchor');
 assert.equal(productionWrites.length,0,'The bridge must never modify production');
 console.log('Founder pilot access: verified identity, isolated sessions, consent, adult eligibility, schedule, revocation and no production writes passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
