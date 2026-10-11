'use strict';
const assert=require('node:assert/strict');
const handler=require('./server/api/coach/custom-program');
const C='22222222-2222-2222-2222-222222222222',P='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
async function run(){const original=global.fetch;let role='founder_owner',patches=[],mode='ok';try{
 global.fetch=async(url,opts={})=>{let data;if(url.includes('/auth/v1/user'))data={id:C};else if(url.includes('/profiles?'))data=[{user_id:C,role,account_status:'active'}];else if(url.includes('/athletes?'))data=[];else if(opts.method==='PATCH'){patches.push({url,opts});assert.equal(opts.headers.Authorization,'Bearer fixture');assert.equal(opts.headers.Prefer,'return=representation');assert.deepEqual(JSON.parse(opts.body),{status:'archived'});assert.ok(url.includes('id=eq.'+P+'&coach_user_id=eq.'+C));data=mode==='missing'?[]:mode==='bad'?[{id:P,status:'active'}]:[{id:P,status:'archived'}];if(mode==='fail')return {ok:false,status:503,json:async()=>({message:'Temporary delete failure'})};}else throw Error('Unexpected request '+url);return {ok:true,json:async()=>data};};
 const request=async(body,token='fixture',method='POST')=>{const res={code:0,body:null,setHeader(){},status(n){this.code=n;return this},json(x){this.body=x;return this}};await handler({method,headers:token?{authorization:'Bearer '+token}:{},body},res);return res};
 assert.equal((await request({action:'delete',programId:P},'')).code,401);assert.equal(patches.length,0);
 assert.equal((await request({action:'delete',programId:'bad'})).code,400);assert.equal(patches.length,0);
 role='athlete';assert.equal((await request({action:'delete',programId:P})).code,403);assert.equal(patches.length,0);role='founder_owner';
 mode='missing';assert.equal((await request({action:'delete',programId:P})).code,404);mode='bad';assert.equal((await request({action:'delete',programId:P})).code,404);mode='fail';assert.equal((await request({action:'delete',programId:P})).code,503);
 mode='ok';for(let i=0;i<2;i++){const r=await request({action:'delete',programId:P,coach_user_id:'other',status:'active'});assert.equal(r.code,200);assert.deepEqual(r.body,{ok:true,programId:P});}
 console.log('PASS: program delete uses authenticated owner-only archival; invalid IDs, missing auth, wrong role, unconfirmed writes, failures and idempotent retries.');
 }finally{global.fetch=original}}
run().catch(e=>{console.error(e);process.exitCode=1});
