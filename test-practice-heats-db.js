'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {fixture,role,scalar}=require('./test-workout-identity-db');
const Identity=require('./lib/mw-workout-identity');
const C='22222222-2222-2222-2222-222222222222',OTHER='44444444-4444-4444-4444-444444444444';
const read=name=>fs.readFileSync('supabase/migrations/'+name,'utf8');
async function run(){
 const db=await fixture();let win;
 try{
  for(const name of ['20261002030901_canonical_workout_identity.sql','20261003004000_atomic_practice_commit.sql','20261003024000_lock_completed_practice_workouts.sql','20261003025500_serialize_workout_completion_writes.sql','20261003031000_local_program_day_and_completion_authority.sql','20261003032000_refresh_coach_practice_program_position.sql','20261003155114_stabilize_legacy_program_refresh.sql','20261003155417_preserve_atomic_practice_intent.sql','20261003190541_immutable_completed_practice_retries.sql','20261003191637_protect_completed_practice_table_evidence.sql','20261003192608_validate_coach_evidence_session_links.sql'])await db.exec(read(name));
  await db.exec(fs.readFileSync('test-fixtures/practice-groups.sql','utf8'));
  await db.exec(read('20261006152137_coach_saved_practice_groups.sql'));
  const {today,day}=await scalar(db,'select current_date::text as today,extract(isodow from current_date)::int as day');
  const roster=[];
  for(let i=0;i<16;i++){
   const suffix=String(i+1).padStart(12,'0'),user='30000000-0000-4000-8000-'+suffix,id='40000000-0000-4000-8000-'+suffix;
   await db.query('insert into auth.users values($1)',[user]);await db.query("insert into profiles values($1,'athlete','active')",[user]);await db.query('insert into athletes values($1,$2)',[id,user]);await db.query("insert into coach_assignments values($1,$2,'active')",[C,id]);
   await db.query("insert into athlete_program_state(athlete_id,current_week,current_day,current_phase,program_status,starting_week,start_date) values($1,1,$2,1,'active',1,current_date)",[id,day]);
   const state=await scalar(db,'select * from athlete_program_state where athlete_id=$1',[id]);
   roster.push({...state,id,user,name:(i<8?'Boy ':'Girl ')+(i%8+1),competition_division:i<8?'boys':'girls'});
  }
  await role(db,C);
  const groupRpc=body=>scalar(db,'select public.mw_coach_save_training_group($1,$2,$3::uuid[]) as result',[body.p_group_id,body.p_name,body.p_athlete_ids]).then(r=>r.result);
  assert.equal((await scalar(db,"select has_function_privilege('anon','public.mw_coach_save_training_group(uuid,text,uuid[])','execute') as allowed")).allowed,false);
  // The real handler executes the real PostgreSQL commit RPC; transport and identity
  // are disposable fixtures, never a substitute for production login verification.
  const apiContext={module:{exports:{}},console,require:name=>name==='../../lib/mw-coach-auth'?{SUPABASE_URL:'https://fixture.invalid',SUPABASE_KEY:'fixture',getAccountContext:async()=>({token:'fixture',user:{id:C},profile:{role:'coach'}})}:require(name.replace('../../../','./').replace('../../','./server/')),fetch:async(url,options={})=>{
   const target=new URL(url),path=target.pathname.split('/').pop(),p=options.body?JSON.parse(options.body):null;let data;
   try{
    if(path==='coach_practice_timing_results')data=(await db.query('select * from coach_practice_timing_results where session_id=$1 and coach_user_id=$2',[target.searchParams.get('session_id').slice(3),C])).rows.map(r=>({...r,session_date:r.session_date instanceof Date?r.session_date.toISOString().slice(0,10):r.session_date}));
    else if(path==='athlete_practice_rep_results')data=(await db.query('select * from athlete_practice_rep_results where coach_session_id=$1 and coach_user_id=$2',[target.searchParams.get('coach_session_id').slice(3),C])).rows;
    else if(path==='athlete_program_state')data=(await db.query('select * from athlete_program_state where athlete_id=any($1::uuid[])',[target.searchParams.get('athlete_id').slice(4,-1).split(',')])).rows;
    else if(path==='workout_completions')data=(await db.query("select * from workout_completions where athlete_id=$1 and program_week=$2 and program_day=$3 and completion_status='completed'",[target.searchParams.get('athlete_id').slice(3),Number(target.searchParams.get('program_week').slice(3)),Number(target.searchParams.get('program_day').slice(3))])).rows;
    else if(path==='mw_coach_refresh_assigned_athlete_program_position')data=(await scalar(db,'select public.mw_coach_refresh_assigned_athlete_program_position($1,$2::date) as result',[p.p_athlete_id,p.p_session_date])).result;
    else if(path==='mw_coach_commit_practice_session')data=(await scalar(db,'select public.mw_coach_commit_practice_session($1,$2::jsonb) as result',[p.p_session_id,JSON.stringify(p.p_results)])).result;
    else if(path==='mw_coach_sync_practice_intelligence')data=(await scalar(db,'select public.mw_coach_sync_practice_intelligence($1,$2,$3) as result',[p.p_session_id,p.p_athlete_id,p.p_workout_key])).result;
    else throw Error('Unexpected transport '+path);
    return {ok:true,json:async()=>data};
   }catch(e){return {ok:false,status:400,json:async()=>({message:e.message})}}
  }};
  vm.createContext(apiContext);vm.runInContext(fs.readFileSync('server/api/coach/practice-timing.js','utf8'),apiContext);
  const payloads=[],apiSave=async body=>{const result={},res={setHeader(){},status(n){result.status=n;return this},json(data){result.data=data;return this}};await apiContext.module.exports({method:'POST',headers:{},body},res);return result};
  const {Window}=await import(process.env.MW_PRACTICE_DOM_PATH||'happy-dom');
  win=new Window({url:'https://fixture.invalid/coach/'});win.confirm=()=>true;
  let now=1000;win.Date.now=()=>now;
  win.eval(fs.readFileSync('lib/mw-practice-heats.js','utf8'));win.eval(fs.readFileSync('coach/timing-tools.js','utf8'));win.eval(fs.readFileSync('coach/practice-heats.js','utf8'));
  win.fetch=async(url,options)=>{const body=JSON.parse(options.body);payloads.push(body);const r=await apiSave(body);return {ok:r.status===200,json:async()=>r.data}};
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const d={escapeHtml:esc,project:'fixture',mwCurrentUser:async()=>({id:C}),mwLocalIsoDate:()=>today,mwClientTimeZone:()=> 'UTC',mwSessionToken:()=> 'fixture',hydrateCoachTodayPractice(){},pageBase:(title,sub,html)=>{win.document.body.innerHTML='<main class="page"><div class="panel">'+html+'</div></main>'},mwModal:(title,html)=>{win.document.getElementById('mwModal')?.remove();const el=win.document.createElement('section');el.id='mwModal';el.innerHTML=html;win.document.body.append(el)},openPage(){},coachPracticeTier:()=> 'foundation',coachPracticeStrengthTier:()=> 'foundation',coachPracticeEventGroup:()=> '100_200',coachProgramData:async()=>({track:{sessions:[{day,title:'Technical speed',prescribedWork:'2 x 30m'}]}}),coachSessionDayNumber:n=>n,mwCoachPracticePrescription:()=>({reps:2,distance:30,raw:'2 x 30m'}),mwCoachPracticeRecommendedTarget:()=>({target:3}),coachPracticeIdentity:(a,w=1,d=day)=>Identity.create({athleteId:a.id,workoutCycleId:a.workout_cycle_id,week:w,day:d}),coachPracticeWorkoutComplete:a=>!!a?.latest_workout,fetchCoachRoster:async()=>({athletes:await Promise.all(roster.map(async a=>({...a,latest_workout:(await db.query("select * from workout_completions where athlete_id=$1 and completion_status='completed'",[a.id])).rows[0]})))}),sbRest:async(path,options={})=>{
   if(path.startsWith('rpc/'))return groupRpc(options.body);
   return (await db.query('select g.id,g.name,coalesce(jsonb_agg(jsonb_build_object(\'athlete_id\',m.athlete_id)) filter(where m.athlete_id is not null),\'[]\'::jsonb) as coach_group_members from coach_groups g left join coach_group_members m on m.group_id=g.id where not g.archived group by g.id order by g.created_at,g.id')).rows;
  }};
  let controller=await win.MWCoachPractice.mount(d),q=id=>win.document.getElementById(id);
  assert.equal(q('heatAttendance'),null,'Attendance remains in Menu, not Practice');
  assert.equal(q('heatAdd'),null);assert.equal(q('heatEdit'),null);assert.equal(q('heatAutoGroups'),null);assert.equal(win.document.querySelector('.mwHeatGroupMenu'),null,'Practice has no group-management controls');
  assert.equal(q('heatStart').disabled,true,'Practice waits for a saved Team group');
  async function createGroup(name,indices){const saved=await groupRpc({p_group_id:null,p_name:name,p_athlete_ids:indices.map(i=>roster[i].id)});controller=await win.MWCoachPractice.mount(d);q('heatGroup').value=saved.id;q('heatGroup').onchange();}
  for(let i=0;i<4;i++)await createGroup((i<2?'Boys':'Girls')+' '+(i%2+1),Array.from({length:4},(_,j)=>i*4+j));
  let groups=(await d.sbRest('coach_groups')).map(g=>g.id);assert.equal(groups.length,4);
  await groupRpc({p_group_id:groups[0],p_name:'Acceleration boys',p_athlete_ids:roster.slice(0,4).map(a=>a.id)});controller=await win.MWCoachPractice.mount(d);q('heatGroup').value=groups[0];q('heatGroup').onchange();
  assert.equal((await scalar(db,'select name from coach_groups where id=$1',[groups[0]])).name,'Acceleration boys');
  for(let i=0;i<4;i++){
   q('heatGroup').value=groups[i];q('heatGroup').onchange();assert.equal(q('heatLanes').children.length,4);
   const stage=q('heatTimingStage');assert.ok(stage.contains(q('heatStart'))&&stage.contains(q('heatStop'))&&stage.contains(q('heatReset'))&&stage.contains(q('heatClock'))&&stage.contains(q('heatLanes')),'one pinned surface contains clock, Start/Stop/Reset and all finish pads');
   q('heatStart').click();assert.equal(q('heatGroup').disabled,true);assert.equal(q('mwHeatRun').classList.contains('mwHeatTimingFocus'),true);
   for(const b of [...q('heatLanes').querySelectorAll('button')]){now+=500;win.document.querySelector('[data-heat-athlete="'+b.dataset.heatAthlete+'"]').click()}
   assert.equal(q('mwHeatRun').classList.contains('mwHeatTimingFocus'),false,'last athlete finishing releases timing focus');
   now+=2000;q('heatNext').click();assert.equal(controller.model.heats[controller.model.active].rep,2);
  }
  const draft=win.localStorage.getItem('mw-practice-heats-v1:fixture:'+C+':'+today);assert.ok(draft);
  controller=await win.MWCoachPractice.mount(d);assert.equal(controller.model.toSave().reduce((n,b)=>n+b.results.length,0),16);
  q('heatGroup').value=groups[0];q('heatGroup').onchange();const first=controller.model.heats[controller.model.active];
  q('heatRestToggle').click();const paused=controller.model.rest();now+=6000;assert.equal(controller.model.rest(),paused);q('heatRestToggle').click();now+=1000;assert.equal(controller.model.rest(),paused+1000);
  q('heatStart').click();now+=500;q('heatLanes').querySelector('button').click();
  q('heatStart').click();assert.equal(q('heatStart').textContent,'RESUME REP');now+=3000;assert.equal(controller.model.elapsed(),500,'paused stopwatch excludes pause time');
  assert.equal(q('mwHeatRun').classList.contains('mwHeatTimingFocus'),true,'Pause keeps all controls pinned');
  q('heatStart').click();now+=500;q('heatStop').click();assert.equal(controller.model.elapsed(),1000);assert.equal(q('heatGroup').disabled,true,'stopped unfinished heat cannot be mixed with another group');
  assert.equal(q('mwHeatRun').classList.contains('mwHeatTimingFocus'),true,'Stop keeps remaining finish pads and Reset pinned');
  q('heatReset').click();assert.equal(first.results.length,4);assert.equal(first.repResults.length,0);
  assert.equal(q('mwHeatRun').classList.contains('mwHeatTimingFocus'),false,'Reset returns to group setup');
  for(let i=0;i<4;i++){
   q('heatGroup').value=groups[i];q('heatGroup').onchange();q('heatStart').click();for(const b of [...q('heatLanes').querySelectorAll('button')]){now+=500;win.document.querySelector('[data-heat-athlete="'+b.dataset.heatAthlete+'"]').click()}
  }
  await createGroup('Relay pool',[0,1,2,3,4,5,6,7]);assert.equal(q('heatGroup').options.length,5);assert.equal(q('heatPicker').options.length,2);assert.equal(q('heatStart').disabled,true,'overlapping pending athletes cannot be retimed');
  controller=await win.MWCoachPractice.mount(d);await q('heatSave').onclick();assert.match(q('heatStatus').textContent,/32 times saved/);
  assert.equal(payloads.length,4);
  await role(db,C);assert.equal((await scalar(db,'select count(*)::int as n from coach_practice_timing_results')).n,32);assert.equal((await scalar(db,"select count(*)::int as n from workout_completions where completion_status='completed'")).n,16);
  for(const a of roster){await role(db,a.user);assert.equal((await scalar(db,'select count(*)::int as n from athlete_practice_rep_results')).n,2,'each athlete sees only own two reps');assert.equal((await scalar(db,'select count(*)::int as n from workout_completions')).n,1,'one completion on own profile')}
  await role(db,C);for(const body of payloads){const replay=await apiSave(body);assert.equal(replay.status,200,JSON.stringify(replay));assert.equal(replay.data.replayed,true)}
  assert.equal((await scalar(db,'select count(*)::int as n from coach_practice_timing_results')).n,32,'response-loss retries do not duplicate logs');
  controller=await win.MWCoachPractice.mount(d);assert.equal(controller.model.toSave().length,0);assert.equal(q('heatSave').disabled,true);assert.equal(q('heatGroup').options.length,5,'group names/members loaded from DB on fresh session');
  assert.equal(q('heatClockState').textContent,'Workouts already saved');assert.equal(q('heatReset').disabled,true);assert.match(q('heatStatus').textContent,/already saved.*protected/,'completed workouts explain why timing is disabled instead of saying ready');
  await role(db,OTHER);assert.equal((await scalar(db,'select count(*)::int as n from coach_groups')).n,0);await assert.rejects(groupRpc({p_group_id:groups[0],p_name:'Intrusion',p_athlete_ids:[roster[0].id]}),/assigned/);
  await role(db,C);const original=(await db.query('select athlete_id from coach_group_members where group_id=$1 order by athlete_id',[groups[0]])).rows;
  await assert.rejects(groupRpc({p_group_id:groups[0],p_name:'Invalid edit',p_athlete_ids:[OTHER]}),/assigned/);assert.deepEqual((await db.query('select athlete_id from coach_group_members where group_id=$1 order by athlete_id',[groups[0]])).rows,original,'invalid edit is atomic');
  // Exercise the actual Team create/cancel and recoverable Archive handlers.
  const appSource=fs.readFileSync('coach/app.js','utf8');
  win.mwModal=(title,html)=>{q('mwModal')?.remove();const modal=win.document.createElement('section');modal.id='mwModal';modal.innerHTML='<button data-close-modal>Close</button>'+html;win.document.body.append(modal);return modal;};
  win.mwCurrentUser=async()=>({id:C});win.logCoachAction=async()=>{};win.teamsPage=()=>{};win.toast=()=>{};win.escapeHtml=esc;
  let groupWrites=0;
  win.sbRest=async(path,options)=>{
   groupWrites++;
   if(options.method==='POST')return (await db.query('insert into coach_groups(coach_user_id,name,event_group,description) values($1,$2,$3,$4) returning *',[options.body.coach_user_id,options.body.name,options.body.event_group,options.body.description])).rows;
   assert.equal(options.method,'PATCH');assert.deepEqual(JSON.parse(JSON.stringify(options.body)),{archived:true});
   const params=new URL('https://fixture.invalid/'+path).searchParams;
   return (await db.query('update coach_groups set archived=true where id=$1 and coach_user_id=$2 and archived=false returning *',[params.get('id').slice(3),params.get('coach_user_id').slice(3)])).rows;
  };
  win.eval(appSource.slice(appSource.indexOf('function createGroupModal()'),appSource.indexOf('async function groupWorkspaceLive(')));
  win.createGroupModal();q('groupName').value='Cancelled team';q('cancelGroup').click();assert.equal(q('mwModal'),null);assert.equal(groupWrites,0,'Team Cancel makes no API write');
  win.createGroupModal();q('groupName').value='Accidental team';const saving=q('saveGroup').onclick();await q('saveGroup').onclick();await saving;assert.equal(groupWrites,1,'double Save creates only one group');
  const accidental=await scalar(db,"select id from coach_groups where name='Accidental team'");
  win.confirmCoachGroupArchive=async()=>false;assert.equal(await win.archiveCoachGroup(accidental.id,'Accidental team'),false);assert.equal(groupWrites,1,'declining archive makes no write');
  win.confirmCoachGroupArchive=async()=>true;await win.archiveCoachGroup(accidental.id,'Accidental team');assert.equal((await scalar(db,'select archived from coach_groups where id=$1',[accidental.id])).archived,true);
  await role(db,OTHER);win.mwCurrentUser=async()=>({id:OTHER});await assert.rejects(win.archiveCoachGroup(groups[0],'Another coach group'),/could not be archived/);
  await role(db,C);win.mwCurrentUser=async()=>({id:C});await win.archiveCoachGroup(groups[0],'Acceleration boys');
  assert.equal((await db.query('select athlete_id from coach_group_members where group_id=$1',[groups[0]])).rows.length,0,'archived group memberships are hidden by RLS');
  assert.equal((await scalar(db,'select count(*)::int as n from coach_practice_timing_results')).n,32,'Archive keeps all saved coach times');
  assert.equal((await scalar(db,'select count(*)::int as n from athlete_practice_rep_results')).n,32,'Archive keeps athlete times');
  await db.query('update coach_groups set archived=false where id=$1',[groups[0]]);
  assert.deepEqual((await db.query('select athlete_id from coach_group_members where group_id=$1 order by athlete_id',[groups[0]])).rows,original,'Archive keeps memberships, visible again when restored');
  assert.equal((await scalar(db,'select count(*)::int as n from coach_groups where not archived')).n,5,'archive is reversible without recreating groups');
  console.log('PASS: real Practice DOM controls + Node save handler + PostgreSQL RPC/RLS: 16 athletes, 5 named groups, membership/rename persistence, independent heat reps/rest, reset, refresh draft recovery, 32 durable results visible to each correct athlete and coach, completion uniqueness, replay safety, and cross-coach denial.');
 }finally{if(win)await win.happyDOM.abort();await db.close()}
}
run().catch(e=>{console.error(e);process.exitCode=1});
