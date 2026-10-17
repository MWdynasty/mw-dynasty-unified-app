// Exercise the real Edge handler's upload -> finalize -> private playback -> delete
// lifecycle with two synthetic accounts. All network/database calls are mocked.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
(async()=>{
 const validation=await import('../supabase/functions/mw-motion-pilot/validation.mjs');
 const reviewValidation=await import('../supabase/functions/mw-motion-pilot/review-validation.mjs');
 const seasonWeek=await import('../supabase/functions/mw-motion-pilot/season-week.mjs');
 const mediaValidation=await import('../supabase/functions/mw-motion-pilot/media-validation.mjs');
 const {makeMedia}=require('./motion-media-fixture.js');
 const media=makeMedia(12000);
 const u1='11111111-1111-4111-8111-111111111111';
 const u2='22222222-2222-4222-8222-222222222222';
 const athlete1='33333333-3333-4333-8333-333333333333';
 const athlete2='44444444-4444-4444-8444-444444444444';
 const origin='https://mwdynastyunifiedappv31tiered13plusdeploy-p9lbgg99g-mw-sprint.vercel.app';
 const db={
  athletes:[{id:athlete1,user_id:u1,date_of_birth:'1998-01-01'},
    {id:athlete2,user_id:u2,date_of_birth:'1999-01-01'}],
  motion_pilot_approvals:[u1,u2].map(user_id=>({
    user_id,status:'active',adult_verified_at:'2026-10-17T00:00:00Z',
    consent_policy_version:'pilot-v1',expires_at:'2099-01-01T00:00:00Z'
  })),
  motion_assessments:[],motion_upload_intents:[],motion_assets:[],motion_audit_events:[],motion_reviews:[],motion_season_observations:[],coach_assignments:[]
 };
 const objects=new Map();
 let signCount=0,removeCount=0,playbackCount=0;
 function from(table){
  let op='select',payload=null,filters=[],countOnly=false,limit=Infinity,order=null,opts={};
  const matched=()=>db[table].filter(row=>filters.every(f=>f(row)));
  const query={
   select(_cols,options){
    if(op==='select'&&options?.head){countOnly=true;}
    return query;
   },
   eq(k,v){filters.push(row=>row[k]===v);return query;},
   neq(k,v){filters.push(row=>row[k]!==v);return query;},
   gte(k,v){filters.push(row=>row[k]>=v);return query;},
   gt(k,v){filters.push(row=>row[k]>v);return query;},
   in(k,values){filters.push(row=>values.includes(row[k]));return query;},
   lte(k,v){filters.push(row=>row[k]<=v);return query;},
   order(k,o){order={key:k,ascending:o?.ascending===true};return query;},
   limit(n){limit=n;return query;},
   insert(value){op='insert';payload=value;return query;},
   upsert(value,options){op='upsert';payload=value;opts=options||{};return query;},
   update(value){op='update';payload=value;return query;},
   delete(){op='delete';return query;},
   async execute(){
    let rows=matched();
    if(op==='insert'){
     const row={id:crypto.randomUUID(),created_at:new Date().toISOString(),
      status:table==='motion_upload_intents'?'pending':'draft',...payload};
     if(table==='motion_season_observations')row.expires_at=new Date(Date.now()+330*86400000).toISOString();
     if(table==='motion_upload_intents'&&!row.expires_at)
      row.expires_at=new Date(Date.now()+7200000).toISOString();
     db[table].push(row);rows=[row];
    }else if(op==='upsert'){
     const conflict=opts.onConflict||'id';
     let existing=db[table].find(row=>row[conflict]===payload[conflict]);
     if(existing){if(!opts.ignoreDuplicates)Object.assign(existing,payload);rows=[existing];}
     else{existing={id:crypto.randomUUID(),created_at:new Date().toISOString(),...payload};db[table].push(existing);rows=[existing];}
    }else if(op==='update'){
     rows.forEach(row=>Object.assign(row,payload));
    }else if(op==='delete'){
     db[table]=db[table].filter(row=>!rows.includes(row));
    }else{
     if(order)rows.sort((a,b)=>{
      const cmp=String(a[order.key]).localeCompare(String(b[order.key]));
      return order.ascending?cmp:-cmp;
     });
     rows=rows.slice(0,limit);
    }
    return {data:countOnly?null:rows,error:null,count:countOnly?rows.length:null};
   },
   async single(){const r=await query.execute();return {...r,data:r.data?.[0]||null};},
   async maybeSingle(){const r=await query.execute();return {...r,data:r.data?.[0]||null};},
   then(resolve,reject){return query.execute().then(resolve,reject);}
  };
  return query;
 }
 const admin={
  auth:{getUser:async token=>({
   data:{user:token==='token-one'?{id:u1}:token==='token-two'?{id:u2}:null},
   error:token==='token-one'||token==='token-two'?null:{message:'invalid'}
  })},
  from,
  storage:{from:bucket=>{
   assert.equal(bucket,'motion-private');
   return {
    createSignedUploadUrl:async path=>{
     signCount++;return {data:{token:'signed-upload-token-'+signCount,path},error:null};
    },
    list:async(prefix,options)=>{
     const data=[...objects.entries()].filter(([path])=>path.startsWith(prefix+'/'))
      .map(([path,metadata])=>({name:path.split('/').at(-1),metadata}))
      .filter(row=>row.name.includes(options.search));
     return {data,error:null};
    },
    createSignedUrl:async(path,seconds)=>{
     assert.equal(seconds,60);
     const row=db.motion_assessments.find(r=>r.id===path.split('/')[1]);
     if(row?.status==='uploaded')playbackCount++;
     return objects.has(path)?
      {data:{signedUrl:'https://uuggbmccnyswiwkjgydo.supabase.co/storage/v1/object/sign/motion-private/'+path+'?token=redacted'},error:null}:
      {data:null,error:{message:'Not found'}};
    },
    remove:async(paths)=>{
     removeCount++;
     for(const path of paths)objects.delete(path);
     return {data:paths,error:null};
    }
   };
  }}
 };
 const source=fs.readFileSync('supabase/functions/mw-motion-pilot/index.ts','utf8')
  .replace(/^import \{ createClient \} from "[^"]+";\n/,'const createClient=globalThis.__createClient;\n')
  .replace(/^import \{([^}]+)\} from "\.\/validation\.mjs";\n/m,'const {$1}=globalThis.__validation;\n')
  .replace(/^import \{([^}]+)\} from "\.\/review-validation\.mjs";\n/m,'const {$1}=globalThis.__reviewValidation;\n')
  .replace(/^import \{([^}]+)\} from "\.\/season-week\.mjs";\n/m,'const {$1}=globalThis.__seasonWeek;\n')
  .replace(/^import \{([^}]+)\} from "\.\/media-validation\.mjs";\n/m,'const {$1}=globalThis.__mediaValidation;\n');
 const stripped=typeof stripTypeScriptTypes==='function'?
  stripTypeScriptTypes(source,{mode:'strip'}):
  source.replace('function json(status: number, body: unknown, origin: string | null = null): Response {',
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
 let handler;
 vm.runInNewContext(stripped,{
  __createClient:()=>admin,__validation:validation,__reviewValidation:reviewValidation,__seasonWeek:seasonWeek,
  __mediaValidation:{
   verifyIsoVideo:mediaValidation.verifyIsoVideo,
   signedRangeReader:args=>mediaValidation.signedRangeReader({...args,fetchFn:async(url,opts)=>{
    assert.ok(url.startsWith('https://uuggbmccnyswiwkjgydo.supabase.co/'));
    const match=/bytes=(\d+)-(\d+)/.exec(opts.headers.Range);
    const start=Number(match[1]),end=Number(match[2]);
    return new Response(media.subarray(start,end+1),{
     status:206,headers:{'Content-Range':'bytes '+start+'-'+end+'/'+media.length,
      'Content-Length':String(end-start+1)}
    });
   }})
  },
  Deno:{env:{get:k=>k==='SUPABASE_URL'?
   'https://uuggbmccnyswiwkjgydo.supabase.co':
   k==='SUPABASE_SERVICE_ROLE_KEY'?'synthetic-secret':null},
   serve:fn=>{handler=fn;}},
  Response,Request,Date,console,crypto:globalThis.crypto
 },{filename:'motion-edge-lifecycle.js'});
 assert.equal(typeof handler,'function');
 async function call(user,action,fields={}){
  const response=await handler(new Request('https://staging.invalid/functions/v1/mw-motion-pilot',{
   method:'POST',headers:{Origin:origin,Authorization:'Bearer '+user,
    'Content-Type':'application/json'},
   body:JSON.stringify({action,...fields})
  }));
  return {status:response.status,data:await response.json()};
 }
 const valid={
  movementType:'wickets',cameraView:'side',mimeType:'video/mp4',bytes:media.length,
  consentAccepted:true,consentVersion:'pilot-v1',weekNumber:8
 };
 let r=await call('token-one','prepare',valid);
 assert.equal(r.status,200,JSON.stringify(r));
 assert.equal(signCount,1);
 const assessmentId=r.data.assessmentId,path=r.data.path;
 assert.ok(validation.pathOwned(path,u1,assessmentId));
 assert.equal(db.motion_assessments[0].status,'draft');
 assert.equal(db.motion_upload_intents[0].owner_user_id,u1);
 r=await call('token-two','finalize',{assessmentId});
 assert.equal(r.status,404,'Cross-user finalization denied');
 r=await call('token-one','finalize',{assessmentId});
 assert.equal(r.status,409,'Cannot finalize a missing video');
 objects.set(path,{size:media.length,mimetype:'video/mp4'});
 r=await call('token-one','finalize',{assessmentId});
 assert.equal(r.status,200,JSON.stringify(r));
 assert.equal(r.data.status,'uploaded');
 assert.equal(r.data.durationVerified,true);
 assert.equal(r.data.durationMs,12000);
 assert.equal(db.motion_assessments[0].status,'uploaded');
 assert.equal(db.motion_upload_intents[0].status,'finalized');
 assert.equal(db.motion_assets.length,1);
 const assetId=db.motion_assets[0].id;
 r=await call('token-one','finalize',{assessmentId});
 assert.equal(r.status,200,'Duplicate finalization must be idempotent');
 assert.equal(db.motion_assets.length,1);
 r=await call('token-one','playback',{assessmentId,assetId});
 assert.equal(r.status,200);
 assert.equal(playbackCount,1);
 const review={sampledFrames:12,poseFrames:10,metrics:[
  {name:'knee_angle_2d',samples:8,medianDegrees:92.3,earlyDegrees:90,lateDegrees:95}
 ]};
 r=await call('token-one','save_review',{assessmentId,review});
 assert.equal(r.status,422,'Measurement persistence must require separate consent');
 r=await call('token-two','save_review',{assessmentId,review,consentToStoreMeasurements:true,consentVersion:'motion-review-v1'});
 assert.equal(r.status,404,'Other athletes cannot store measurements on this recording');
 r=await call('token-one','save_review',{assessmentId,review:{...review,metrics:[{...review.metrics[0],medianDegrees:999}]},consentToStoreMeasurements:true,consentVersion:'motion-review-v1'});
 assert.equal(r.status,422,'Impossible angles must be rejected');
 r=await call('token-one','save_review',{assessmentId,review,consentToStoreMeasurements:true,consentVersion:'motion-review-v1'});
 assert.equal(r.status,200,JSON.stringify(r));
 assert.equal(db.motion_reviews.length,1);
 assert.equal(db.motion_reviews[0].provenance,'unverified_client_2d');
 r=await call('token-one','reviews');
 assert.equal(r.status,200);
 assert.equal(r.data.reviews.length,1);
 r=await call('token-two','reviews');
 assert.equal(r.status,200);
 assert.equal(r.data.reviews.length,0);
 r=await call('token-one','save_review',{assessmentId,review,consentToStoreMeasurements:true,consentVersion:'motion-review-v1'});
 assert.equal(r.status,200);
 assert.equal(db.motion_reviews.length,1,'Review saves must be idempotent');
 // Separate 330-day season consent, opt-in coach sharing, owner revocation.
 r=await call('token-one','save_season',{assessmentId,review});
 assert.equal(r.status,422,'Long-term observations need separate explicit consent');
 r=await call('token-two','save_season',{assessmentId,review,consentToSeasonHistory:true,consentVersion:'motion-season-v1'});
 assert.equal(r.status,404,'Another athlete cannot save a season observation');
 r=await call('token-one','save_season',{assessmentId,review,consentToSeasonHistory:true,consentVersion:'motion-season-v1'});
 assert.equal(r.status,200,JSON.stringify(r));
 assert.equal(db.motion_season_observations.length,1);
 assert.equal(db.motion_season_observations[0].week_number,8);
 assert.equal(db.motion_season_observations[0].share_with_assigned_coach,false);
 const observationId=db.motion_season_observations[0].id;
 r=await call('token-one','save_season',{assessmentId,review,consentToSeasonHistory:true,consentVersion:'motion-season-v1'});
 assert.equal(r.data.alreadySaved,true);
 assert.equal(db.motion_season_observations.length,1);
 r=await call('token-one','season');
 assert.equal(r.data.observations.length,1);
 r=await call('token-two','season');
 assert.equal(r.data.observations.length,0);
 r=await call('token-two','coach_season');
 assert.equal(r.data.observations.length,0);
 db.coach_assignments.push({athlete_id:athlete1,coach_user_id:u2,status:'active'});
 r=await call('token-two','coach_season');
 assert.equal(r.data.observations.length,0,'Coach must not see unshared observation');
 r=await call('token-one','share_season',{observationId,share:true});
 assert.equal(r.status,200);
 r=await call('token-two','coach_season');
 assert.equal(r.data.observations.length,1,'Active assigned coach sees consented observation');
 db.coach_assignments[0].status='ended';
 r=await call('token-two','coach_season');
 assert.equal(r.data.observations.length,0,'Ended assignment must revoke coach access');
 db.coach_assignments[0].status='active';
 r=await call('token-one','share_season',{observationId,share:false});
 assert.equal(r.status,200);
 r=await call('token-two','coach_season');
 assert.equal(r.data.observations.length,0,'Sharing revocation must take effect');
 r=await call('token-two','share_season',{observationId,share:true});
 assert.equal(r.status,404,'Another user cannot change sharing');
 r=await call('token-two','playback',{assessmentId,assetId});
 assert.equal(r.status,404);
 assert.equal(playbackCount,1);
 r=await call('token-two','list');
 assert.equal(r.status,200);
 assert.equal(r.data.assessments.length,0);
 // Expired recordings are inaccessible immediately, even if scheduled
 // deletion has not yet run.
 const originalCreatedAt=db.motion_assessments[0].created_at;
 db.motion_assessments[0].created_at=new Date(Date.now()-15*86400000).toISOString();
 r=await call('token-one','playback',{assessmentId,assetId});
 assert.equal(r.status,404,'Playback must deny video beyond retention');
 r=await call('token-one','list');
 assert.equal(r.data.assessments.length,0,'Expired recording must be hidden from history');
 r=await call('token-one','reviews');
 assert.equal(r.data.reviews.length,0,'Expired recording reviews must be hidden');
 db.motion_assessments[0].created_at=originalCreatedAt;
 r=await call('token-one','playback',{assessmentId,assetId});
 assert.equal(r.status,200,'Unexpired completed recording still playable');
 // Long-term opt-in observations are independent from the 14-day video lifecycle.
 r=await call('token-one','delete',{assessmentId});
 assert.equal(r.status,200,JSON.stringify(r));
 assert.equal(db.motion_assessments[0].status,'deleted');
 r=await call('token-one','season');
 assert.equal(r.data.observations.length,1,'Consented season observation survives video deletion');

 r=await call('token-one','reviews');
 assert.equal(r.data.reviews.length,0,'Deleted recording reviews must be hidden');
 assert.equal(objects.has(path),false);
 assert.equal(removeCount,1);
 r=await call('token-one','playback',{assessmentId,assetId});
 assert.equal(r.status,404);
 r=await call('token-one','finalize',{assessmentId});
 assert.equal(r.status,404);
 r=await call('token-one','list');
 assert.equal(r.status,200);
 assert.equal(r.data.assessments.length,0);
 // A real uploaded object with mismatched metadata is never finalized.
 r=await call('token-one','prepare',valid);
 assert.equal(r.status,200);
 const badId=r.data.assessmentId,badPath=r.data.path;
 objects.set(badPath,{size:1235,mimetype:'video/mp4'});
 r=await call('token-one','finalize',{assessmentId:badId});
 assert.equal(r.status,422);
 assert.equal(db.motion_assessments.find(x=>x.id===badId).status,'deleted');
 assert.equal(objects.has(badPath),false,'Rejected video bytes removed immediately');
 assert.equal(db.motion_upload_intents.find(x=>x.assessment_id===badId).status,'failed');
 // A partially written asset must never be playable before finalization.
 const partialAssetId=crypto.randomUUID();
 db.motion_assets.push({id:partialAssetId,assessment_id:badId,storage_path:badPath});
 r=await call('token-one','playback',{assessmentId:badId,assetId:partialAssetId});
 assert.equal(r.status,404,'Rejected recordings must not be playable');
 // Corrupted metadata must not delete an unrelated athlete's storage object.
 const alien=u2+'/'+assessmentId+'/66666666-6666-4666-8666-666666666666.mp4';
 objects.set(alien,{size:50,mimetype:'video/mp4'});
 db.motion_upload_intents.find(x=>x.assessment_id===badId).storage_path=alien;
 const removalsBefore=removeCount;
 r=await call('token-one','delete',{assessmentId:badId});
 assert.equal(r.status,409);
 assert.equal(removeCount,removalsBefore);
 assert.equal(objects.has(alien),true);
 assert.equal(db.motion_assessments.find(x=>x.id===badId).status,'deleted');
 // Revocation denies any new signed upload, finalize, or playback requests.
 db.motion_pilot_approvals[0].status='revoked';
 r=await call('token-one','season');
 assert.equal(r.status,200,'Privacy access remains available after pilot revocation');
 assert.equal(r.data.observations.length,1);
 r=await call('token-one','share_season',{observationId,share:true});
 assert.equal(r.status,403,'Revoked athlete cannot enable new sharing');
 r=await call('token-one','share_season',{observationId,share:false});
 assert.equal(r.status,200,'Revoked athlete can always withdraw sharing');
 r=await call('token-one','delete_season',{observationId});
 assert.equal(r.status,200,'Revoked athlete can always delete history');
 assert.equal(db.motion_season_observations.length,0);
 r=await call('token-one','season');
 assert.equal(r.data.observations.length,0);
 r=await call('token-one','prepare',valid);
 assert.equal(r.status,403);
 r=await call('token-one','finalize',{assessmentId:badId});
 assert.equal(r.status,403);
 console.log('Motion Edge lifecycle passed: two-user isolation, upload/finalize, signed playback, deletion, malformed path and revocation.');
})().catch(e=>{console.error(e);process.exitCode=1});
