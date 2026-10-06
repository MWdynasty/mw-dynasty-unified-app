'use strict';
// Run with Node 24+. This executes the actual Edge handler with disposable transports;
// it does not delete a real Auth account or replace in-app deletion verification.
const {stripTypeScriptTypes}=require('node:module'),vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const source=stripTypeScriptTypes(fs.readFileSync('supabase/functions/mw-delete-account/index.ts','utf8').replace(/^import[^\n]*edge-runtime.d.ts[^\n]*\n/,''));
async function run(role,profileStatus=200,existingStatus=200,authenticated=true){
 let handler;const calls=[];
 vm.runInNewContext(source,{Response,Request,console,Deno:{env:{get:k=>({SUPABASE_URL:'https://fixture.invalid',SUPABASE_SERVICE_ROLE_KEY:'fixture-secret',SUPABASE_ANON_KEY:'fixture-public'})[k]},serve:h=>handler=h},fetch:async(url,opts={})=>{
  calls.push({url,method:opts.method||'GET'});
  if(url.endsWith('/auth/v1/user'))return Response.json({id:'synthetic-owner'});
  if(url.includes('/profiles?'))return Response.json([{role}],{status:profileStatus});
  if(url.includes('/account_deletion_requests?'))return Response.json([{id:'synthetic-request',requested_at:'2026-10-06'}],{status:existingStatus});
  if(opts.method==='DELETE'){assert.ok(url.endsWith('/synthetic-owner'));return Response.json({id:'synthetic-owner'})}
  throw Error('Unexpected write');
 }});
 const result=await handler(new Request('https://fixture.invalid/delete',{method:'POST',headers:authenticated?{authorization:'Bearer fixture'}:{},body:JSON.stringify({user_id:'different-user'})}));return {status:result.status,body:await result.json(),calls};
}
(async()=>{
 let r=await run('coach',500);assert.equal(r.status,503);assert.ok(!r.calls.some(x=>x.method==='DELETE'||x.method==='POST'),'failed role lookup must not delete a coach as an athlete');
 r=await run('coach',200,500);assert.equal(r.status,503);assert.ok(!r.calls.some(x=>x.method!=='GET'),'failed duplicate check must not create another request');
 r=await run('coach');assert.equal(r.status,200);assert.equal(r.body.requested,true);assert.equal(r.body.request_id,'synthetic-request');
 r=await run('athlete');assert.equal(r.body.deleted,true);assert.equal(r.calls.filter(x=>x.method==='DELETE').length,1);
 r=await run('admin');assert.equal(r.status,403);assert.ok(!r.calls.some(x=>x.method==='DELETE'));
 r=await run('athlete',200,200,false);assert.equal(r.status,401);assert.equal(r.calls.length,0);
 console.log('PASS: actual deletion handler fails closed on role/request lookup failures, reuses coach requests, rejects staff/unauthenticated callers, and deletes only the authenticated synthetic athlete.');
})().catch(e=>{console.error(e);process.exitCode=1});
