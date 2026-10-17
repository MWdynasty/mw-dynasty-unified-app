const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
(async()=>{
 const validation=await import('../supabase/functions/mw-motion-pilot/validation.mjs');
 const reviewValidation=await import('../supabase/functions/mw-motion-pilot/review-validation.mjs');
 const seasonWeek=await import('../supabase/functions/mw-motion-pilot/season-week.mjs');
 const mediaValidation=await import('../supabase/functions/mw-motion-pilot/media-validation.mjs');
 const u1='11111111-1111-4111-8111-111111111111';
 const u2='22222222-2222-4222-8222-222222222222';
 const a1='33333333-3333-4333-8333-333333333333';
 const a2='44444444-4444-4444-8444-444444444444';
 const asset='55555555-5555-4555-8555-555555555555';
 const path=u1+'/'+a1+'/66666666-6666-4666-8666-666666666666.mp4';
 const origin='https://mwdynastyunifiedappv31tiered13plusdeploy-nk2s4i8ld-mw-sprint.vercel.app';
 const db={
  athletes:[{id:a1,user_id:u1,date_of_birth:'1998-04-20'},
   {id:a2,user_id:u2,date_of_birth:'1999-01-01'}],
  motion_pilot_approvals:[
   {user_id:u1,status:'active',expires_at:'2099-01-01T00:00:00Z',
    adult_verified_at:'2026-10-17T00:00:00Z',consent_policy_version:'pilot-v1'},
   {user_id:u2,status:'revoked',expires_at:'2099-01-01T00:00:00Z',
    adult_verified_at:'2026-10-17T00:00:00Z',consent_policy_version:'pilot-v1'}],
  motion_assessments:[
   {id:a1,created_by:u1,status:'uploaded',movement_type:'wickets',
    camera_view:'side',created_at:'2026-10-17T00:00:00Z'},
   {id:a2,created_by:u2,status:'uploaded',movement_type:'wickets',
    camera_view:'side',created_at:'2026-10-17T00:00:00Z'}],
  motion_assets:[{id:asset,assessment_id:a1,storage_path:path,bytes:1234,mime_type:'video/mp4'}],
  motion_audit_events:[]
 };
 let signed=0;
 function builder(table){
  let filters=[],limit=Infinity;
  const q={
   select(){return q;},eq(k,v){filters.push(row=>row[k]===v);return q;},
   neq(k,v){filters.push(row=>row[k]!==v);return q;},
   gte(k,v){filters.push(row=>row[k]>=v);return q;},
   order(){return q;},limit(n){limit=n;return q;},
   maybeSingle(){return Promise.resolve({data:db[table].filter(r=>filters.every(f=>f(r)))[0]||null,error:null});},
   single(){return q.maybeSingle();},
   insert(row){db[table].push(row);return Promise.resolve({error:null});},
   then(ok,bad){return Promise.resolve({data:db[table].filter(r=>filters.every(f=>f(r))).slice(0,limit),error:null}).then(ok,bad);}
  };
  return q;
 }
 const admin={
  auth:{getUser:async token=>({
   data:{user:token==='token-one'?{id:u1}:token==='token-two'?{id:u2}:null},
   error:token==='token-one'||token==='token-two'?null:{message:'bad token'}
  })},
  from:builder,
  storage:{from:()=>({createSignedUrl:async(storagePath,seconds)=>{
   signed++;assert.equal(storagePath,path);assert.equal(seconds,60);
   return {data:{signedUrl:'https://private.invalid/signed'},error:null};
  }})}
 };
 let handler;
 const source=fs.readFileSync('supabase/functions/mw-motion-pilot/index.ts','utf8')
  .replace(/^import \{ createClient \} from "[^"]+";\n/,'const createClient=globalThis.__createClient;\n')
  .replace(/^import \{([^}]+)\} from "\.\/validation\.mjs";\n/m,'const {$1}=globalThis.__validation;\n')
  .replace(/^import \{([^}]+)\} from "\.\/review-validation\.mjs";\n/m,'const {$1}=globalThis.__reviewValidation;\n')
  .replace(/^import \{([^}]+)\} from "\.\/season-week\.mjs";\n/m,'const {$1}=globalThis.__seasonWeek;\n')
  .replace(/^import \{([^}]+)\} from "\.\/media-validation\.mjs";\n/m,'const {$1}=globalThis.__mediaValidation;\n');
 const stripped=typeof stripTypeScriptTypes==='function'?
  stripTypeScriptTypes(source,{mode:'strip'}):
  source
   .replace('function json(status: number, body: unknown, origin: string | null = null): Response {',
    'function json(status, body, origin = null) {')
   .replace('function bad(status: number, message: string, origin: string | null): Response {',
    'function bad(status, message, origin) {')
   .replace('function safeError(e: unknown): string {','function safeError(e) {')
   .replace('function withinRetention(createdAt: unknown): boolean {','function withinRetention(createdAt) {')
   .replace('const headers: Record<string,string> = {','const headers = {')
   .replace('Deno.serve(async (req: Request) => {','Deno.serve(async (req) => {')
   .replace('let input: Record<string,unknown>;','let input;')
   .replace('const audit = async (assessmentId: string|null,event: string, details: Record<string,unknown>={}) => {',
    'const audit = async (assessmentId,event,details={}) => {')
   .replace('const own = async (id: unknown) => {','const own = async (id) => {')
   .replace('const mime = input.mimeType as string;','const mime = input.mimeType;')
   .replace('const bytes = input.bytes as number;','const bytes = input.bytes;')
   .replace('const week = input.weekNumber as number | undefined;','const week = input.weekNumber;')
   .replace('const assessmentId = assessment.id as string;','const assessmentId = assessment.id;')
   .replace('MIME_EXT[mime as string]','MIME_EXT[mime]')
   .replace('(o:{name:string})','(o)')
   .replace('(r:{id:string})','(r)')
   .replace('(r:{assessment_id:string})','(r)')
   .replace('(a:{athlete_id:string})','(a)')
   .replace('(a:{date_of_birth:string})','(a)')
   .replace('(a:{id:string})','(a)')
   .replace('(r:{athlete_id:string})','(r)');
 const context={__createClient:()=>admin,__validation:validation,__reviewValidation:reviewValidation,__seasonWeek:seasonWeek,__mediaValidation:mediaValidation,
  Deno:{env:{get:k=>k==='SUPABASE_URL'?'https://uuggbmccnyswiwkjgydo.supabase.co':
   k==='SUPABASE_SERVICE_ROLE_KEY'?'fake-server-only-secret':null},
   serve:fn=>{handler=fn;}},
  Response,Request,Date,console,crypto:globalThis.crypto};
 vm.runInNewContext(stripped,context,{filename:'motion-edge-isolation.js'});
 assert.equal(typeof handler,'function');
 async function call(token,action,fields={},customOrigin=origin){
  const req=new Request('https://staging.invalid/functions/v1/mw-motion-pilot',{
   method:'POST',headers:{Authorization:'Bearer '+token,Origin:customOrigin,
    'Content-Type':'application/json'},
   body:JSON.stringify({action,...fields})
  });
  const res=await handler(req);
  return {status:res.status,data:await res.json()};
 }
 let r=await call('token-one','eligibility');
 assert.equal(r.status,200);assert.equal(r.data.approved,true);
 r=await call('token-two','eligibility');
 assert.equal(r.status,200);assert.equal(r.data.approved,false);
 r=await call('not-a-user','eligibility');
 assert.equal(r.status,401);
 r=await call('token-one','eligibility',{},'https://evil.vercel.app');
 assert.equal(r.status,403);
 r=await call('token-one','playback',{assessmentId:a1,assetId:asset});
 assert.equal(r.status,200);assert.equal(r.data.expiresInSeconds,60);assert.equal(signed,1);
 r=await call('token-one','playback',{assessmentId:a2,assetId:asset});
 assert.equal(r.status,404);assert.equal(signed,1);
 r=await call('token-two','playback',{assessmentId:a1,assetId:asset});
 assert.equal(r.status,403);assert.equal(signed,1);
 r=await call('token-two','prepare',{consentAccepted:true,consentVersion:'pilot-v1',
  movementType:'wickets',cameraView:'side',mimeType:'video/mp4',bytes:1000});
 assert.equal(r.status,403);
 r=await call('token-two','finalize',{assessmentId:a2});
 assert.equal(r.status,403);
 r=await call('token-one','list');
 assert.equal(r.status,200);assert.equal(r.data.assessments.length,1);
 assert.equal(r.data.assessments[0].id,a1);
 db.motion_assessments[0].status='deleted';
 r=await call('token-one','playback',{assessmentId:a1,assetId:asset});
 assert.equal(r.status,404);assert.equal(signed,1);
 db.motion_assessments[0].status='uploaded';
 db.motion_pilot_approvals[0].status='revoked';
 r=await call('token-one','playback',{assessmentId:a1,assetId:asset});
 assert.equal(r.status,403);assert.equal(signed,1);
 r=await call('token-one','finalize',{assessmentId:a1});
 assert.equal(r.status,403);
 console.log('Actual Motion Edge handler: JWT, adult approval, revocation, ownership, signed playback and tombstone tests passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
