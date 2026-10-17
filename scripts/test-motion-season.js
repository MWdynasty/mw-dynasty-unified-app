const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const sql=fs.readFileSync('supabase/migrations/20261017150000_motion_season_observations.sql','utf8');
const edge=fs.readFileSync('supabase/functions/mw-motion-pilot/index.ts','utf8');
const athlete=fs.readFileSync('athlete/motion.html','utf8');
const coach=fs.readFileSync('coach/motion.html','utf8');
for(const [html,label] of [[athlete,'athlete'],[coach,'coach']]){
 const start=html.lastIndexOf('<script>'),end=html.indexOf('</script>',start);
 assert.ok(start>=0&&end>start,label+' script missing');
 assert.doesNotThrow(()=>new vm.Script(html.slice(start+8,end),{filename:label+'-motion.js'}));
 assert.match(html,/mwdynastyunifiedappv31tiered13plusdeploy-\[a-z0-9\]/);
 assert.match(html,/motionPilot/);
}
for(const term of ['enable row level security','revoke all','share_with_assigned_coach boolean not null default false',
 'on delete set null','coach_assignments','status=\'active\'','expires_at>now()',
 'grant select','consent_version','330 days']){
 assert.ok(sql.includes(term),'Missing season schema safeguard: '+term);
}
for(const action of ['save_season','season','share_season','delete_season','coach_season']){
 assert.ok(edge.includes('action==="'+action+'"'),'Missing Edge action '+action);
}
assert.ok(edge.includes('consentToSeasonHistory!==true'));
assert.ok(edge.includes('consentVersion!=="motion-season-v1"'));
assert.ok(edge.includes('.eq("coach_user_id",user.id).eq("status","active")'));
assert.ok(edge.includes('.eq("share_with_assigned_coach",true)'));
assert.ok(edge.includes('adult(a.date_of_birth)'));
assert.ok(athlete.includes('season-consent'));
assert.ok(athlete.includes('SAVE TO 41-WEEK PROGRESSION'));
assert.ok(athlete.includes("call('delete_season'"));
assert.ok(athlete.includes("call('share_season'"));
assert.ok(coach.includes("action:'coach_season'"));
assert.ok(!coach.includes('playback_requested'));
const progress=require('../lib/mw-motion-progress.js');
const base={provenance:'unverified_client_2d',movement_type:'wickets',metrics:[{name:'knee_angle_2d',medianDegrees:92}],week_number:1};
const r=progress.summarize([{...base,id:'first',assessment_id:null,created_at:'2026-10-01T00:00:00Z'},
 {...base,id:'second',assessment_id:null,created_at:'2026-10-02T00:00:00Z',week_number:41,metrics:[{name:'knee_angle_2d',medianDegrees:93}]}]);
assert.equal(r.length,1,'Deleted source video must not break consented season comparisons');
assert.equal(r[0].lastWeek,41);
console.log('41-week consent, adult-only coach RLS, revocable sharing, no video access and browser syntax checks passed.');
