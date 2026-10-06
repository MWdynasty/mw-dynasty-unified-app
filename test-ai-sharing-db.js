'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs');
const {fixture,role}=require('./test-workout-identity-db');
const AU='33333333-3333-3333-3333-333333333333',C='22222222-2222-2222-2222-222222222222',OTHER='44444444-4444-4444-4444-444444444444';
(async()=>{
 const db=await fixture();try{
  await db.exec(`grant select on public.coach_assignments to authenticated;
   alter table public.coach_assignments enable row level security;
   create policy assignment_read on public.coach_assignments for select to authenticated using(coach_user_id=auth.uid() or athlete_id=private.mw_own_athlete_id());`);
  await db.exec(fs.readFileSync('supabase/migrations/20261006203026_ai_sharing_permissions.sql','utf8'));
  await role(db,AU);assert.equal((await db.query('select * from ai_sharing_permissions')).rows.length,0);
  await db.query("insert into ai_sharing_permissions values($1,true,false,'2026-10-06',now())",[AU]);
  await role(db,C);assert.equal((await db.query('select * from ai_sharing_permissions')).rows.length,0,'coach cannot read an athlete who declined coach AI sharing');
  assert.equal((await db.query('update ai_sharing_permissions set coach_ai=true where user_id=$1 returning user_id',[AU])).rows.length,0,'coach cannot grant permission for an athlete');
  await role(db,AU);await db.query('update ai_sharing_permissions set coach_ai=true where user_id=$1',[AU]);
  await role(db,C);assert.equal((await db.query('select * from ai_sharing_permissions')).rows.length,1,'assigned coach can read the permitted flag');
  await role(db,OTHER);assert.equal((await db.query('select * from ai_sharing_permissions')).rows.length,0,'unassigned coach excluded');
  await assert.rejects(()=>db.query("insert into ai_sharing_permissions values($1,true,true,'2026-10-06',now())",[AU]),/row-level security|duplicate key/);
  await role(db,AU);await db.query('update ai_sharing_permissions set own_ai=false,coach_ai=false where user_id=$1',[AU]);
  await role(db,C);assert.equal((await db.query('select * from ai_sharing_permissions')).rows.length,0,'revocation removes coach visibility');
  await db.exec('reset role;set role anon');await assert.rejects(()=>db.query('select * from ai_sharing_permissions'),/permission denied/);
  console.log('PASS: PostgreSQL AI permissions default off, persist, restrict changes to owner, exclude unrelated coaches, and enforce revocation.');
 }finally{await db.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
