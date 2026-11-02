'use strict';

const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {PGlite}=require('@electric-sql/pglite');
const {Window}=require('happy-dom');

const migration=fs.readFileSync('supabase/migrations/20261101_performance_progression_history.sql','utf8');
const asset=fs.readFileSync('assets/mw-performance-progression.js','utf8');
const ids={userA:'11111111-1111-4111-8111-111111111111',userB:'22222222-2222-4222-8222-222222222222',athleteA:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',athleteB:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'};

async function database(){
  const db=new PGlite();
  try{
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table public.athletes(id uuid primary key,user_id uuid not null,created_at timestamptz default now());
      create table public.athlete_program_state(athlete_id uuid primary key,current_week integer);
      create table public.athlete_practice_rep_results(
        id uuid primary key default gen_random_uuid(),athlete_id uuid not null,workout_key text,
        program_week integer,program_day integer,rep_number integer,distance_m integer,time_seconds numeric,
        target_seconds numeric,target_min_seconds numeric,target_max_seconds numeric,pace_status text,
        recorded_at timestamptz,mw_intent text,mw_interpretation text,result_status text,workout_cycle_id uuid
      );
      create table public.workout_completions(athlete_id uuid,program_week integer,completion_status text);
      create table public.athlete_strength_session_logs(
        athlete_id uuid,program_week integer,program_day integer,exercise_name text,set_number integer,
        reps_completed integer,actual_load numeric,weight_unit text,recorded_at timestamptz,training_cycle_key text
      );
      alter table public.athlete_practice_rep_results enable row level security;
      alter table public.workout_completions enable row level security;
      alter table public.athlete_strength_session_logs enable row level security;
      create policy own_results on public.athlete_practice_rep_results for select to authenticated
        using (athlete_id=(select id from public.athletes where user_id=auth.uid()));
      create policy own_completions on public.workout_completions for select to authenticated
        using (athlete_id=(select id from public.athletes where user_id=auth.uid()));
      create policy own_strength on public.athlete_strength_session_logs for select to authenticated
        using (athlete_id=(select id from public.athletes where user_id=auth.uid()));
      grant usage on schema public,auth to authenticated,anon;
      grant select on public.athletes,public.athlete_program_state,public.athlete_practice_rep_results,public.workout_completions,public.athlete_strength_session_logs to authenticated;
      grant execute on function auth.uid() to authenticated,anon;
    `);
    await db.exec(migration);
    await db.query('insert into public.athletes(id,user_id) values($1,$2),($3,$4)',[ids.athleteA,ids.userA,ids.athleteB,ids.userB]);
    await db.query('insert into public.athlete_program_state values($1,7),($2,3)',[ids.athleteA,ids.athleteB]);
    const reps=[
      [ids.athleteA,'mw-a-w1-d1',1,1,100,12.1,'acceleration','on_pace','2026-01-05'],
      [ids.athleteA,'mw-a-w2-d1',2,1,100,11.8,'acceleration','on_pace','2026-01-12'],
      [ids.athleteA,'mw-a-w2-d2',2,2,100,14.0,'tempo','outside_target','2026-01-13'],
      [ids.athleteA,'mw-a-w2-d3',2,3,30,5.1,'technical wickets','on_pace','2026-01-14'],
      [ids.athleteA,'mw-a-w3-d1',3,1,30,4.0,'maximum velocity fly','on_pace','2026-01-19'],
      [ids.athleteA,'mw-a-w3-d2',3,2,100,9.0,'acceleration','on_pace','2026-01-20','dnf'],
      [ids.athleteB,'mw-b-w1-d1',1,1,100,13.0,'acceleration','on_pace','2026-01-05']
    ];
    for(const row of reps){
      const [athlete,key,w,distanceDay,meters,time,intent,pace,date,status]=row;
      await db.query(`insert into public.athlete_practice_rep_results(athlete_id,workout_key,program_week,program_day,rep_number,distance_m,time_seconds,target_seconds,pace_status,recorded_at,mw_intent,result_status)
        values($1,$2,$3,$4,1,$5,$6,12,$7,$8,$9,$10)`,[athlete,key,w,distanceDay,meters,time,pace,date+'T12:00:00Z',intent,status||'completed']);
    }
    await db.query("insert into public.workout_completions values($1,1,'completed'),($1,2,'completed'),($1,2,'completed'),($2,1,'completed')",[ids.athleteA,ids.athleteB]);
    await db.query("insert into public.athlete_strength_session_logs values($1,1,2,'Back Squat',1,5,100,'lb','2026-01-06T12:00:00Z','cycle-a'),($1,2,2,'Back Squat',1,5,110,'lb','2026-01-13T12:00:00Z','cycle-a'),($2,1,2,'Back Squat',1,5,180,'lb','2026-01-06T12:00:00Z','cycle-b')",[ids.athleteA,ids.athleteB]);

    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids.userA]);
    await db.exec('set role authenticated');
    const result=(await db.query('select public.mw_get_performance_progression_history() as data')).rows[0].data;
    assert.equal(result.current_week,7);
    assert.equal(result.speed_history.length,5,'DNF and the second athlete are excluded, while tempo and technical remain visible');
    assert.deepEqual([...new Set(result.speed_history.map(r=>r.intent_group))].sort(),['acceleration','maximum_velocity','technical','tempo']);
    assert.equal(result.speed_history.filter(r=>r.intent_group==='acceleration').every(r=>r.speed_test_eligible),true);
    assert.equal(result.speed_history.find(r=>r.intent_group==='tempo').speed_test_eligible,false);
    assert.equal(result.speed_history.find(r=>r.intent_group==='technical').speed_test_eligible,false);
    assert.equal(result.strength_history.length,2);
    assert.equal(result.strength_history[0].estimated_1rm,116.67);
    assert.equal(result.strength_history[1].estimated_1rm,128.33);
    assert.equal(result.consistency.completed_workouts,3);
    assert.equal(result.consistency.program_weeks,2);

    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub','',false)");
    await db.exec('set role authenticated');
    await assert.rejects(db.query('select public.mw_get_performance_progression_history()'),e=>e.code==='42501','anonymous identity must not receive history');
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids.userB]);
    await db.exec('set role authenticated');
    const other=(await db.query('select public.mw_get_performance_progression_history() as data')).rows[0].data;
    assert.equal(other.speed_history.length,1,'row level security isolates one athlete from another');
    assert.equal(other.speed_history[0].time_seconds,13);
    assert.equal(other.strength_history.length,1,'strength rows are isolated by the same account boundary');
  }finally{await db.close()}
}

async function client(){
  const page=new Window({url:'https://app.mwdynasty.com/athlete/'});
  page.document.body.innerHTML='<main id="home"><header class="top">Today</header></main><section id="progress"><div class="mwProgressHero">Program progress</div></section><nav class="nav"><button data-v="progress">Progression</button></nav>';
  page.window.MWAccountStorage={local:{getItem:key=>key==='mwSupabaseSession'?JSON.stringify({access_token:'athlete-token',user:{id:ids.userA}}):null},session:{getItem:()=>null}};
  const sessionResults={
    status:'ok',current_week:7,
    speed_history:[
      {recorded_at:'2026-01-05T12:00:00Z',distance_m:100,time_seconds:12.1,intent_group:'acceleration',speed_test_eligible:true,program_week:1,program_day:1,workout_key:'a1'},
      {recorded_at:'2026-01-12T12:00:00Z',distance_m:100,time_seconds:11.8,intent_group:'acceleration',speed_test_eligible:true,program_week:2,program_day:1,workout_key:'a2'},
      {recorded_at:'2026-01-12T13:00:00Z',distance_m:100,time_seconds:14,intent_group:'tempo',speed_test_eligible:false,program_week:2,program_day:2,workout_key:'t1'},
      {recorded_at:'2026-01-19T12:00:00Z',distance_m:100,time_seconds:13.8,intent_group:'tempo',speed_test_eligible:false,program_week:3,program_day:2,workout_key:'t2'},
      {recorded_at:'2026-01-13T12:00:00Z',distance_m:100,time_seconds:9.7,intent_group:'technical',speed_test_eligible:false,program_week:2,program_day:3,workout_key:'x1'}
    ],
    strength_history:[
      {recorded_at:'2026-01-06T12:00:00Z',exercise:'Back Squat',weight:100,reps:5,unit:'lb',estimated_1rm:116.7,program_week:1,program_day:2,training_cycle_key:'cycle-1'},
      {recorded_at:'2026-01-20T12:00:00Z',exercise:'Back Squat',weight:110,reps:5,unit:'lb',estimated_1rm:128.3,program_week:3,program_day:2,training_cycle_key:'cycle-1'}
    ],
    consistency:{completed_workouts:5,program_weeks:3}
  };
  const calls=[];
  const context={window:page.window,document:page.document,location:page.location,localStorage:page.localStorage,sessionStorage:page.sessionStorage,
    navigator:page.navigator,MutationObserver:page.MutationObserver,fetch:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>sessionResults}},console,Intl,Date,Set,Map,Number,Math,JSON,Promise,setTimeout,clearTimeout};
  vm.runInNewContext(asset,context);
  await new Promise(resolve=>setTimeout(resolve,0));
  const section=page.document.getElementById('mw-performance-progression');
  assert(section,'performance dashboard mounts in the Progression view');
  assert.equal(section.parentElement.id,'progress','performance details live with program progression');
  assert.equal(page.document.getElementById('home').querySelector('#mw-performance-progression'),null,'Home stays focused on today’s training');
  assert.equal(calls.length,1);
  assert.match(calls[0].url,/rpc\/mw_get_performance_progression_history/);
  assert.equal(calls[0].options.headers.Authorization,'Bearer athlete-token');
  assert.equal(section.querySelectorAll('svg').length,2,'speed and strength graphs render');
  assert.match(section.textContent,/First 12\.10s · Latest 11\.80s/);
  assert.match(section.textContent,/5 completed workouts/);
  assert.match(section.textContent,/3 of 41 program weeks/);
  const selects=section.querySelectorAll('select');
  assert.equal(selects.length,5,'sprint purpose, distance, and period plus strength exercise and period are selectable');
  selects[0].value='tempo';selects[0].dispatchEvent(new page.Event('change'));
  assert.doesNotMatch(section.textContent,/First 14\.00s · Latest 13\.80s/,'tempo times never become a maximum-speed improvement claim');
  assert.match(section.textContent,/faster time is not automatically an improvement for tempo/);
  selects[0].value='technical';selects[0].dispatchEvent(new page.Event('change'));
  assert.match(section.textContent,/faster time is not automatically an improvement for technical/);
  page.close();
}

(async()=>{await database();await client();console.log('PASS: isolated authenticated performance history, intent-aware speed comparisons, strength estimates, consistency counts, and interactive athlete graphs.')})().catch(error=>{console.error(error);process.exitCode=1});
