'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const G=require('./server/lib/mw-group-proposals');
const coach='22222222-2222-2222-2222-222222222222',other='44444444-4444-4444-4444-444444444444';
const roster=Array.from({length:20},(_,i)=>({id:'40000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),user_id:'30000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),name:(i<10?'Boy ':'Girl ')+(i%10+1),competition_division:i<10?'boys':'girls',prs:[{event:'200m',time_seconds:22+(i%10)*.2,mark_type:'race'}]}));
const spec={event:'200m',divisions:[{division:'boys',count:2},{division:'girls',count:2}],distanceM:150,intensityPct:90};
const plan=G.plan(spec,roster);assert.equal(plan.groups.length,4);assert.deepEqual(plan.groups.map(g=>g.athletes.length),[5,5,5,5]);assert.equal(new Set(plan.groups.flatMap(g=>g.athletes.map(a=>a.athleteId))).size,20);
for(const g of plan.groups){assert.ok(g.athletes.every(a=>a.targetSeconds>0));assert.ok(g.athletes.every(a=>roster.find(r=>r.id===a.athleteId).competition_division===g.division));}
assert.equal(plan.groups[0].athletes.at(-1).prSeconds<plan.groups[1].athletes[0].prSeconds,true);
const noTargets=G.plan({...spec,distanceM:null,intensityPct:null},roster);assert.ok(noTargets.groups.every(g=>g.athletes.every(a=>a.targetSeconds===null)));
const missing=roster.map(a=>({...a}));missing[0].prs=[];missing[10].competition_division=null;const partial=G.plan(spec,missing);assert.equal(partial.excluded.length,2);assert.deepEqual(partial.groups.map(g=>g.athletes.length),[5,4,5,4]);
assert.throws(()=>G.plan({...spec,event:null},roster),/Choose the PR distance/);assert.throws(()=>G.plan({...spec,divisions:[{division:'boys',count:11}]},roster),/nonempty/);
assert.throws(()=>G.plan({...spec,divisions:[{division:'boys',count:2},{division:'boys',count:2}]},roster),/listed once/);
const signed=G.sign(plan,coach,'fixture-key');assert.deepEqual(G.verify(signed.approvalToken,coach,'fixture-key'),plan);assert.throws(()=>G.verify(signed.approvalToken,other,'fixture-key'),/invalid/);assert.throws(()=>G.verify(signed.approvalToken+'x',coach,'fixture-key'),/invalid/);assert.throws(()=>G.verify(G.sign({...plan,createdAt:0},coach,'fixture-key').approvalToken,coach,'fixture-key'),/expired/);
async function apiTest(db){
 let tier='intelligence',providerCalls=0,modelAction=spec,actor=coach,writes=0;
 const get=async(url,options={})=>{
  const response=(data,status=200)=>({ok:status<400,status,json:async()=>data});
  if(url.includes('/auth/v1/user'))return response({id:actor});
  if(url.includes('/rpc/mw_coach_access_tier'))return response(tier);
  if(url.includes('/rpc/mw_coach_create_pr_groups')){writes++;if(!db)return response({groups:plan.groups});const body=JSON.parse(options.body);try{return response((await db.query('select public.mw_coach_create_pr_groups($1,$2::jsonb) as result',[body.p_request_id,JSON.stringify(body.p_groups)])).rows[0].result);}catch(e){return response({message:e.message},400)}}
  if(url.includes('api.openai.com')){providerCalls++;return response({output_text:'Ready for review.\nMW_ACTION_JSON: '+JSON.stringify({type:'groups_create',...modelAction})});}
  const table=new URL(url).pathname.split('/').pop();
  if(table==='profiles'){if(url.includes('role,account_status'))return response([{user_id:actor,role:'coach',account_status:'active'}]);return response(roster.map(a=>({user_id:a.user_id,first_name:a.name,last_name:''})));}
  if(table==='coach_assignments')return response(roster.map(a=>({athlete_id:a.id})));
  if(table==='athletes')return response(roster.map(({prs,name,...a})=>a));
  if(table==='athlete_prs')return response(roster.flatMap(a=>a.prs.map(p=>({...p,athlete_id:a.id}))));
  return response([]);
 };
 const consent={requireConsent:async()=>{},permittedAthleteIds:async()=>new Set(),filterAthleteContext:(context)=>require('./server/lib/mw-ai-consent').filterAthleteContext(context,new Set())};
 const context={module:{exports:{}},console:{info(){},warn(){}},process:{env:{OPENAI_API_KEY:'fixture-key'}},fetch:get,require:name=>name.includes('mw-ai-consent')?consent:name.includes('mw-group-proposals')?{...G,loadRoster:async(...args)=>{const original=global.fetch;global.fetch=get;try{return await G.loadRoster(...args)}finally{global.fetch=original}}}:require(require('node:path').resolve('server/api/coach',name))};
 vm.runInNewContext(fs.readFileSync('server/api/coach/coach-mw.js','utf8'),context);
 const call=async body=>{const res={status(n){this.code=n;return this},json(data){this.data=data;return this}};await context.module.exports({method:'POST',headers:{authorization:'Bearer fixture'},body},res);return res;};
 let r=await call({messages:[{role:'user',content:'Make two boys and two girls groups based on 200m PRs at 150m 90%'}]});assert.equal(r.code,200);assert.equal(r.data.action.groups.length,4);assert.equal(writes,0,'Preview makes no writes');
 const preview=r.data.action;assert.equal(preview.groups[0].athletes[0].name,'Boy 1');
 r=await call({approvedAction:{...preview,groups:[{athletes:[{athleteId:other}]}]}});assert.equal(r.code,200,'Only signed server proposal is executed, not changed client groups');assert.equal(providerCalls,1,'Approval makes no new AI call');
 r=await call({approvedAction:preview});assert.equal(r.code,200);if(db)assert.equal(r.data.replayed,true);
 actor=other;r=await call({approvedAction:preview});assert.equal(r.code,400);actor=coach;tier='core';r=await call({approvedAction:preview});assert.equal(r.code,403);
 console.log('PASS: 20 athletes / exact four division groups; PR sorting, missing data, targets, signed approval, coach/tier isolation, zero preview writes, and retry safety.');
 return preview;
}
async function run(){
 let db;
 if(process.env.MW_IDENTITY_PGLITE_PATH){
  const {fixture,role}=require('./test-workout-identity-db');db=await fixture();
  try{
   await db.exec(fs.readFileSync('test-fixtures/practice-groups.sql','utf8'));await db.exec(fs.readFileSync('supabase/migrations/20261010175610_coach_mw_pr_group_approval.sql','utf8'));
   for(const a of roster){await db.query('insert into auth.users values($1)',[a.user_id]);await db.query("insert into profiles values($1,'athlete','active')",[a.user_id]);await db.query('insert into athletes values($1,$2)',[a.id,a.user_id]);await db.query("insert into coach_assignments values($1,$2,'active')",[coach,a.id]);}
   await role(db,coach);await db.query("insert into coach_groups(coach_user_id,name) values($1,'Existing team')",[coach]);
   await apiTest(db);assert.equal((await db.query('select count(*)::int as n from coach_groups')).rows[0].n,5);assert.equal((await db.query('select count(*)::int as n from coach_group_members')).rows[0].n,20);
   const invalid=G.plan(spec,roster).groups.map(g=>({id:g.id,name:g.name+' invalid',athlete_ids:g.athletes.map(a=>a.athleteId)}));invalid[3].athlete_ids=[other];
   await assert.rejects(db.query('select public.mw_coach_create_pr_groups($1,$2::jsonb)',[crypto.randomUUID(),JSON.stringify(invalid)]),/assigned/);assert.equal((await db.query('select count(*)::int as n from coach_groups')).rows[0].n,5,'Last group failure rolls back all groups');
   await role(db,other);assert.equal((await db.query('select count(*)::int as n from coach_pr_group_receipts')).rows[0].n,0);await assert.rejects(db.query('select public.mw_coach_create_pr_groups($1,$2::jsonb)',[crypto.randomUUID(),JSON.stringify(invalid)]),/assigned/);
   console.log('PASS: real PostgreSQL atomic approval, 20 saved memberships, replay without duplicates, existing-group preservation, cross-coach denial and full rollback.');
  }finally{await db.close()}
 }else await apiTest();
}
run().catch(e=>{console.error(e);process.exitCode=1});
