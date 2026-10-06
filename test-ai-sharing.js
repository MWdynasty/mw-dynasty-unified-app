'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const own='synthetic-user';let permission=false,upstream=0;
const fetch=async url=>{
 if(url.includes('ai_sharing_permissions'))return {ok:true,json:async()=>permission?[{own_ai:true,coach_ai:false,policy_version:'2026-10-06'}]:[]};
 upstream++;throw new Error('Unexpected upstream request without permission: '+url);
};
const helperContext={module:{exports:{}},require:()=>({SUPABASE_URL:'https://fixture.invalid',SUPABASE_KEY:'fixture'}),fetch};
vm.runInNewContext(fs.readFileSync('server/lib/mw-ai-consent.js','utf8'),helperContext);const helper=helperContext.module.exports;
function handler(file,auth){const c={module:{exports:{}},console,fetch,process:{env:{OPENAI_API_KEY:'fixture'}},require:name=>name.includes('mw-ai-consent')?helper:name.includes('mw-auth')?auth:name.includes('founder-auth')?{}:require('./'+name.replace(/^\.\.\//,'server/'))};vm.runInNewContext(fs.readFileSync(file,'utf8'),c);return c.module.exports}
function response(){return {code:0,data:null,setHeader(){},status(n){this.code=n;return this},json(d){this.data=d;return this}}}
(async()=>{
 await assert.rejects(()=>helper.requireConsent('fixture',own),/Allow sharing with OpenAI/);
 for(const file of ['server/api/chat.js','server/api/speak.js']){
  const h=handler(file,{getAthleteContext:async()=>({token:'fixture',user:{id:own},features:{access:{has_access:true}}}),authenticate:async()=>({token:'fixture',user:{id:own}})}),r=response();
  await h({method:'POST',headers:{authorization:'Bearer fixture'},body:{text:'Synthetic text',messages:[]}},r);assert.equal(r.code,403);assert.equal(upstream,0,'no provider request when permission is absent');
 }
 permission=true;await helper.requireConsent('fixture',own);permission=false;await assert.rejects(()=>helper.requireConsent('fixture',own),'withdrawal takes effect on the next request');
 const source={assignments:[{athlete_id:'a'},{athlete_id:'b'}],athletes:[{id:'a',user_id:'ua',date_of_birth:'2000-01-01'},{id:'b',secret:'excluded'}],attendance:[{athlete_id:'b'}],programState:[],prs:[],flags:[],athleteAvailability:[],performanceIntelligence:[{athleteId:'a'},{athleteId:'b'}],performance:{paceLogs:[{athlete_id:'a'},{athlete_id:'b'}]}};
 const filtered=helper.filterAthleteContext(source,new Set(['a']));assert.equal(filtered.athletes.length,1);assert.equal(filtered.performance.paceLogs.length,1);assert.equal(filtered.attendance.length,0);assert.equal(filtered.performanceIntelligence.length,1);assert.equal(filtered.athletes[0].date_of_birth,undefined);assert.equal(filtered.athletes[0].user_id,undefined);assert.ok(!JSON.stringify(filtered).includes('excluded'));
 console.log('PASS: real athlete chat/voice handlers block provider transmission before consent, revocation is immediate, and coach context excludes unpermitted athlete records.');
})().catch(e=>{console.error(e);process.exitCode=1});
