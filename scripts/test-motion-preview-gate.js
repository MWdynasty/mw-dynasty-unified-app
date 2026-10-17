const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('athlete/index.html','utf8');
const first=html.indexOf('<script>');
const end=html.indexOf('</script>',first);
assert.ok(first>=0&&end>first);
const code=html.slice(first+8,end);
assert.ok(code.includes('window.MW_MOTION_PILOT'),'Athlete staging gate missing');
function preview(hostname,search=''){
 const window={};
 const location={hostname,search};
 vm.runInNewContext(code,{window,location,URLSearchParams});
 return window;
}
const staging='https://uuggbmccnyswiwkjgydo.supabase.co';
const production='https://keqgunlfwhjgcsurynef.supabase.co';
const valid='mwdynastyunifiedappv31tiered13plusdeploy-57u30rh9g-mw-sprint.vercel.app';
for(const host of ['mwdynasty.com','app.mwdynasty.com','founder.mwdynasty.com',
 'evil.vercel.app',valid+'.evil.com','mwdynastyunifiedappv31tiered13plusdeploy-fake-mw-sprint.vercel.app.evil.com']){
 const result=preview(host,'?motionPilot=1');
 assert.equal(result.MW_MOTION_PILOT,false,host+' must never switch to staging');
 assert.equal(result.MW_SUPABASE_URL,production,host+' must retain production backend');
}
for(const h of [valid,'motion-staging.mwdynasty.com']){
 assert.equal(preview(h,'?motionPilot=1').MW_MOTION_PILOT,true);
 assert.equal(preview(h,'').MW_MOTION_PILOT,false);
}
const allowed=preview(valid,'?motionPilot=1');
assert.equal(allowed.MW_MOTION_PILOT,true);
assert.equal(allowed.MW_SUPABASE_URL,staging);
assert.equal(preview(valid,'').MW_MOTION_PILOT,false,'Preview without opt-in must not switch backends');
const motion=fs.readFileSync('athlete/motion.html','utf8');
const gate=motion.match(/const pilot=([\s\S]*?);\nif\(!pilot\)/);
assert.ok(gate,'Motion pilot standalone host gate missing');
function motionAllowed(hostname,search){
 return vm.runInNewContext(gate[1],{location:{hostname,search},URLSearchParams});
}
assert.equal(motionAllowed(valid,'?motionPilot=1'),true);
assert.equal(motionAllowed(valid,''),false);
assert.equal(motionAllowed('app.mwdynasty.com','?motionPilot=1'),false);
assert.equal(motionAllowed('evil.vercel.app','?motionPilot=1'),false);
console.log('Motion preview isolation passed: production, founder, and unrelated domains cannot switch to staging.');
