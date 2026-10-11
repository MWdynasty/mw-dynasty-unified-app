'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require(process.env.MW_IDENTITY_PGLITE_PATH||'@electric-sql/pglite');
const migration=fs.readdirSync('supabase/migrations').find(x=>x.endsWith('_coach_pilot_athlete_invitations.sql'));
const ids={coach:'a1111111-1111-4111-8111-111111111111',otherCoach:'b2222222-2222-4222-8222-222222222222',athlete:'c3333333-3333-4333-8333-333333333333',otherAthlete:'d4444444-4444-4444-8444-444444444444'};
const sessions={coach:'a1111111-1111-4111-9111-111111111111',otherCoach:'b2222222-2222-4222-9222-222222222222',athlete:'c3333333-3333-4333-9333-333333333333',otherAthlete:'d4444444-4444-4444-9444-444444444444'};
async function run(){
 const db=new PGlite();
 try{
  await db.exec(fs.readFileSync('test-fixtures/coach-pilot.sql','utf8'));
  await db.exec(fs.readFileSync('supabase/migrations/'+migration,'utf8'));
  for(const [name,id]of Object.entries(ids)){
   const isCoach=name.toLowerCase().includes('coach');
   await db.query('insert into auth.users(id,email) values($1,$2)',[id,name+'@example.invalid']);
   await db.query('insert into auth.sessions(id,user_id) values($1,$2)',[sessions[name],id]);
   await db.query('insert into public.profiles(user_id,first_name,last_name,role,account_status) values($1,$2,$3,$4,$5)',[id,name,'Fixture',isCoach?'coach':'athlete',isCoach?'active':'invited']);
   if(isCoach)await db.query("insert into public.coach_access_entitlements(coach_user_id,access_tier,status,access_source) values($1,'intelligence','active','internal_test')",[id]);
   else await db.query('insert into public.athletes(user_id) values($1)',[id]);
  }
  await db.query("insert into private.mw_coach_pilots(coach_user_id,access_tier) values($1,'intelligence')",[ids.coach]);
  const login=async name=>{await db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({role:'authenticated',sub:ids[name],session_id:sessions[name]})]);};
  const scalar=async sql=>(await db.query(sql)).rows[0].result;
  await login('coach');assert.equal((await scalar('select public.mw_current_coach_pilot_status() as result')).active,true);
  await login('otherCoach');assert.equal((await scalar('select public.mw_current_coach_pilot_status() as result')).active,false);
  const invitation=await db.query("insert into public.coach_invitations(coach_user_id,athlete_email,invite_type,status,invite_token,expires_at,billing_type) values($1,'athlete@example.invalid','coach_invite','pending','11111111-1111-4111-8111-111111111111',now()+interval '7 days','self_pay') returning id,billing_type",[ids.coach]);
  assert.equal(invitation.rows[0].billing_type,'coach_pilot','approved coach cannot accidentally charge a pilot athlete');
  await assert.rejects(db.query("insert into public.coach_invitations(coach_user_id,athlete_email,invite_type,status,invite_token,billing_type) values($1,'otherAthlete@example.invalid','coach_invite','pending','22222222-2222-4222-8222-222222222222','coach_pilot')",[ids.otherCoach]),e=>e.code==='42501');
  await login('otherAthlete');
  await assert.rejects(db.query("select public.mw_complete_coach_pilot_registration('11111111-1111-4111-8111-111111111111','Other','Athlete','2005-01-01')"),e=>e.code==='42501');
  assert.equal(await scalar('select count(*)::integer as result from public.membership_entitlements'),0);
  await login('athlete');
  await assert.rejects(db.query("select public.mw_complete_coach_pilot_registration('11111111-1111-4111-8111-111111111111','Pilot','Athlete',(current_date-interval '12 years')::date)"),e=>e.code==='22023');
  assert.equal(await scalar('select count(*)::integer as result from public.coach_assignments'),0);
  const joined=await scalar("select public.mw_complete_coach_pilot_registration('11111111-1111-4111-8111-111111111111','Pilot','Athlete','2005-01-01') as result");
  assert.equal(joined.ok,true);assert.equal(joined.payment_required,false);assert.equal(joined.coach_user_id,ids.coach);
  const retried=await scalar("select public.mw_complete_coach_pilot_registration('11111111-1111-4111-8111-111111111111') as result");assert.equal(retried.reused,true);
  assert.equal(await scalar('select count(*)::integer as result from public.coach_assignments'),1);
  assert.equal(await scalar('select count(*)::integer as result from public.membership_entitlements'),1);
  assert.equal(await scalar('select count(*)::integer as result from public.billing_subscriptions'),0);
  const access=await scalar('select public.mw_my_feature_access() as result').catch(()=>scalar('select private.mw_athlete_access_profile() as result'));
  assert.equal(access.has_access,true);assert.equal(access.age_verified,true);assert.equal(access.coach_assigned_training,true);assert.equal(access.messaging,true);assert.equal(access.ai_intelligence,true);assert.equal(access.mw_training_system,false);
  const billing=await scalar('select public.mw_billing_status() as result');assert.equal(billing.billing_type,'coach_pilot');assert.equal(billing.payment_required,false);
  // Real paid access stays authoritative when an athlete also accepts a pilot invite.
  await db.query("insert into public.membership_entitlements(source,email,email_normalized,user_id,plan_code,status,access_starts_at) values('stripe','athlete@example.invalid','athlete@example.invalid',$1,'mw_athlete','active',now())",[ids.athlete]);
  assert.equal((await scalar('select private.mw_athlete_access_profile() as result')).mw_training_system,true);
  await db.query("update public.membership_entitlements set status='expired' where source='stripe'");
  await db.query("update private.mw_coach_pilots set status='revoked' where coach_user_id=$1",[ids.coach]);
  assert.equal((await scalar('select private.mw_athlete_access_profile() as result')).has_access,false);
  await db.query("update private.mw_coach_pilots set status='active',expires_at=now()-interval '1 minute' where coach_user_id=$1",[ids.coach]);
  assert.equal((await scalar('select private.mw_athlete_access_profile() as result')).has_access,false);
  await db.query("update private.mw_coach_pilots set expires_at=null where coach_user_id=$1",[ids.coach]);
  await db.query("update public.coach_assignments set status='ended'");
  assert.equal((await scalar('select private.mw_athlete_access_profile() as result')).has_access,false);
  await assert.rejects(db.query("select public.mw_complete_coach_pilot_registration('11111111-1111-4111-8111-111111111111')"),e=>e.code==='42501');
  await db.query("update public.coach_assignments set status='active'");
  await db.query("delete from auth.sessions where user_id=$1",[ids.athlete]);
  await assert.rejects(db.query("select public.mw_pilot_invitation_status('11111111-1111-4111-8111-111111111111')"),e=>e.code==='42501');
  assert.equal((await scalar('select private.mw_athlete_access_profile() as result')).has_access,false);
  await db.exec('set role authenticated');
  await assert.rejects(db.query('select * from private.mw_coach_pilots'),e=>e.code==='42501');
  console.log('PASS: free pilot grant, email ownership, 13+, duplicate acceptance, no billing creation, paid-access priority, pilot revocation/expiry, disconnect, revoked sessions, and private-ledger denial.');
 }finally{await db.close()}
}
run().catch(e=>{console.error(e);process.exitCode=1});
