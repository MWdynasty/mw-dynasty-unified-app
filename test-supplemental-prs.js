'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('athlete/index.html','utf8');
const normalize=html.match(/function prsToProfile\(prs=\[\]\)\{[^\n]+/)[0];
const sandbox={};vm.runInNewContext(normalize+';this.normalize=prsToProfile',sandbox);
const marks=[{event:'150m',time_seconds:17.6},{event:'300m',time_seconds:36.7},{event:'500m',time_seconds:68.3}];
const out=sandbox.normalize(marks);
assert.equal(out.p150,'17.6');assert.equal(out.p300,'36.7');assert.equal(out.p500,'68.3');assert.equal(out.p100,'');
for(const distance of [150,300,500]){
  assert.equal((html.match(new RegExp(`id="entryPr${distance}"`,'g'))||[]).length,1);
  assert(html.includes(`id="entryPr${distance}Timing"`));
  assert(html.includes(`id="p${distance}"`));
  assert(html.includes(`entryPr${distance}:mwRemoteProfile.p${distance}`));
}
async function request(file,body){
 const calls=[];const context={module:{exports:{}},require(name){
   if(name.endsWith('mw-auth'))return {SUPABASE_URL:'https://example.test',SUPABASE_KEY:'test',authenticate:async()=>({token:'test',user:{id:'u'}}),getAthleteContext:async()=>({athlete:{id:'a'},features:{access:{smart_entry:true}},user:{id:'u'}})};
   if(name.endsWith('mw-season-calendar'))return {effectiveCalendar:async()=>({week:1,phase:1})};
   if(name.endsWith('mw-developmental-load'))return {ageOn:()=>20};
   return {};
 },fetch:async(url,options)=>{calls.push({url,body:JSON.parse(options.body||'{}')});if(url.includes('mw_submit_smart_entry'))throw new Error('test stopped after PR persistence');return {ok:true,json:async()=>({prs:marks})}},Date,Number,String,Promise,Set,JSON,Object,Math};
 vm.runInNewContext(fs.readFileSync(file,'utf8'),context);
 const res={setHeader(){},status(n){this.code=n;return this},json(data){this.data=data;return this}};
 await context.module.exports({method:'POST',body,headers:{}},res);return {res,calls};
}
(async()=>{
 const prs={'150m':'17.6','300m':'36.7','500m':'68.3'};
 const base={firstName:'Test',lastName:'Athlete',dateOfBirth:'2005-01-01',events:['100m'],prs,prTiming:{'150m':'hand','300m':'fat','500m':'unknown'}};
 const saved=await request('server/api/smart-entry.js',base);
 const writes=saved.calls.filter(x=>x.url.includes('athlete_prs?')).map(x=>x.body);
 assert.deepEqual(writes.map(x=>x.event),['150m','300m','500m']);
 assert.deepEqual(writes.map(x=>x.timing_method),['hand','fat','unknown']);
 assert(writes.every(x=>x.athlete_id==='a'&&x.verified===false));
 const invalid=await request('server/api/smart-entry.js',{...base,prs:{'500m':'-4'}});
 assert.equal(invalid.res.code,400);assert.equal(invalid.calls.length,0);
 const profile=await request('server/api/profile.js',{first_name:'Test',prs});
 assert.equal(profile.res.code,200);
 const rpc=profile.calls.find(x=>x.url.includes('mw_update_athlete_profile'));
 assert.deepEqual(rpc.body.p_prs,prs);
 const empty=await request('server/api/profile.js',{first_name:'Test',prs:{'150m':'','300m':'','500m':''}});
 assert.equal(empty.res.code,200);assert.deepEqual(empty.calls.at(-1).body.p_prs,{});
 console.log('PASS: supplemental PRs persist independently of race selection, retain timing methods, hydrate after reload, remain optional, and reject invalid times.');
})().catch(e=>{console.error(e);process.exitCode=1});
