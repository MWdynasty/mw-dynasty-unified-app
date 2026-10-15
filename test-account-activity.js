'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {PGlite}=require('@electric-sql/pglite');
const migration=fs.readFileSync('supabase/migrations/'+fs.readdirSync('supabase/migrations').find(x=>x.endsWith('_founder_account_activity.sql')),'utf8');
const ids={coach:'11111111-1111-4111-8111-111111111111',athlete:'22222222-2222-4222-8222-222222222222',founder:'33333333-3333-4333-8333-333333333333',unused:'44444444-4444-4444-8444-444444444444'};
async function database(){
 const db=new PGlite();
 try{
  await db.exec(`create role anon; create role authenticated; create schema auth; create schema private;
   create table auth.users(id uuid primary key,last_sign_in_at timestamptz);
   create table auth.sessions(user_id uuid primary key);
   create table public.profiles(user_id uuid primary key,role text,account_status text);
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create function private.mw_authenticated_uid() returns uuid language sql stable security definer set search_path='' as $$select s.user_id from auth.sessions s where s.user_id=auth.uid()$$;
   create function private.mw_is_founder() returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.profiles where user_id=auth.uid() and role='founder_owner')$$;
   grant usage on schema private,public,auth to authenticated,anon;
   grant execute on function auth.uid() to authenticated,anon;`);
  await db.exec(migration);
  for(const [name,id]of Object.entries(ids)){
   await db.query("insert into auth.users values($1,case when $2='unused' then null else '2026-10-01T12:00Z'::timestamptz end)",[id,name]);
   await db.query('insert into auth.sessions values($1)',[id]);
   await db.query("insert into public.profiles values($1,$2,'active')",[id,name==='unused'?'coach':name==='founder'?'founder_owner':name]);
  }
  const login=async(name,role='authenticated')=>{
   await db.exec('reset role');
   await db.query("select set_config('request.jwt.claim.sub',$1,false)",[ids[name]||'']);
   await db.exec('set role '+role);
  };
  const result=async sql=>(await db.query(sql)).rows[0].result;
  await login('coach');
  assert.equal(await result("select public.mw_record_account_activity('web') as result"),true);
  await assert.rejects(db.query('select * from private.mw_account_activity'),e=>e.code==='42501');
  await assert.rejects(db.query('select public.mw_founder_account_activity()'),e=>e.code==='42501');
  await assert.rejects(db.query("select public.mw_record_account_activity('invalid')"),e=>e.code==='22023');
  await db.exec('reset role');
  const first=await result("select last_active_at::text as result from private.mw_account_activity where user_id='"+ids.coach+"'");
  await login('coach');await db.query("select public.mw_record_account_activity('ios')");
  await db.exec('reset role');
  assert.equal(await result("select last_active_at::text as result from private.mw_account_activity where user_id='"+ids.coach+"'"),first,'duplicate tabs/events must be throttled');
  await db.query("update private.mw_account_activity set last_active_at=now()-interval '2 minutes'");
  await login('coach');await db.query("select public.mw_record_account_activity('ios')");
  await login('athlete');await db.query("select public.mw_record_account_activity('web')");
  await assert.rejects(db.query('select public.mw_founder_account_activity()'),e=>e.code==='42501');
  await login('founder');
  const snapshot=await result('select public.mw_founder_account_activity() as result');
  assert.equal(snapshot.items.length,3);
  const coach=snapshot.items.find(x=>x.user_id===ids.coach),athlete=snapshot.items.find(x=>x.user_id===ids.athlete),unused=snapshot.items.find(x=>x.user_id===ids.unused);
  assert.equal(coach.last_active_surface,'coach');assert.equal(coach.last_active_platform,'ios');
  assert.equal(athlete.last_active_surface,'athlete');assert.equal(unused.last_sign_in_at,null);assert.equal(unused.last_active_at,null);
  assert.equal(new Date(coach.last_sign_in_at).toISOString(),'2026-10-01T12:00:00.000Z','app activity cannot change authentication history');
  await login('', 'anon');await assert.rejects(db.query('select public.mw_record_account_activity()'),e=>e.code==='42501');
  await login('coach');await db.exec('reset role');await db.query('delete from auth.sessions where user_id=$1',[ids.coach]);
  await login('coach');await assert.rejects(db.query('select public.mw_record_account_activity()'),e=>e.code==='42501');
  await db.exec('reset role');await db.query("update public.profiles set account_status='disabled' where user_id=$1",[ids.athlete]);
  await login('athlete');await assert.rejects(db.query('select public.mw_record_account_activity()'),e=>e.code==='42501');
  await db.exec('reset role');await db.query('delete from auth.users where id=$1',[ids.coach]);
  assert.equal(await result("select count(*)::integer as result from private.mw_account_activity where user_id='"+ids.coach+"'"),0,'account deletion removes usage summary');
 }finally{await db.close()}
}
async function client(){
 let now=100000,calls=[],stored={access_token:'token-a',user:{id:'coach-a'}};
 const events={},winEvents={},context={
  location:{pathname:'/coach/'},navigator:{onLine:true,userAgent:'MWDynasty-iOS/14'},
  document:{hidden:false,documentElement:{classList:{contains:()=>false}},addEventListener:(k,fn)=>{events[k]=fn}},
  Date:{now:()=>now},fetch:async(url,opts)=>{calls.push({url,opts});return {ok:true}},
  window:{MWAccountStorage:{local:{getItem:()=>JSON.stringify(stored)},session:{getItem:()=>null}},addEventListener:(k,fn)=>{winEvents[k]=fn}}
 };
 vm.runInNewContext(fs.readFileSync('assets/mw-account-activity.js','utf8'),context);
 const tick=()=>new Promise(resolve=>setImmediate(resolve));
 events.pointerdown({isTrusted:true});await tick();assert.equal(calls.length,0,'login form interaction is not app use');
 context.window.MWAccountActivity.start('athlete');await tick();assert.equal(calls.length,0,'wrong audience cannot start activity');
 context.window.MWAccountActivity.start('coach');await tick();assert.equal(calls.length,1);
 assert.deepEqual(JSON.parse(calls[0].opts.body),{p_platform:'ios'});
 now+=30000;events.keydown({isTrusted:true});await tick();assert.equal(calls.length,1);
 now+=300000;await tick();assert.equal(calls.length,1,'idle time must not heartbeat');
 context.window.MWAccountActivity.start('coach');await tick();assert.equal(calls.length,1,'background access refresh must not count as use');
 events.pointerdown({isTrusted:false});await tick();assert.equal(calls.length,1,'scripted events must not create activity');
 context.document.hidden=true;events.pointerdown({isTrusted:true});await tick();assert.equal(calls.length,1);
 context.document.hidden=false;events.visibilitychange();await tick();assert.equal(calls.length,2);
 now+=60001;stored={access_token:'token-b',user:{id:'coach-b'}};events.keydown({isTrusted:true});await tick();assert.equal(calls.length,2,'old page cannot record for another account');
 context.window.MWAccountActivity.start('coach');await tick();assert.equal(calls.length,3);assert.equal(calls[2].opts.headers.Authorization,'Bearer token-b');
 now+=60001;stored=null;events.keydown({isTrusted:true});await tick();assert.equal(calls.length,3);
 winEvents['mw:account-changed']();assert.ok(true);
}
async function api(){
 const handler=require('./server/api/founder'),originalFetch=global.fetch;
 try{
  for(const section of ['coaches','athletes']){
   global.fetch=async url=>{
    const path=String(url);let data;
    if(path.endsWith('/auth/v1/user'))data={id:ids.founder};
    else if(path.includes('/rest/v1/profiles?'))data=[{user_id:ids.founder,role:'founder_owner',account_status:'active'}];
    else if(path.endsWith('/rpc/mw_founder_os_snapshot'))data={items:[{user_id:ids.coach,name:'Coach Fixture'},{user_id:ids.unused,name:'Unused Fixture'}]};
    else if(path.endsWith('/rpc/mw_founder_account_activity'))data={generated_at:'2026-10-15T12:00Z',items:[{user_id:ids.coach,last_sign_in_at:'2026-10-01T12:00Z',last_active_at:'2026-10-15T11:55Z'},{user_id:ids.unused,last_sign_in_at:null,last_active_at:null},{user_id:ids.athlete,last_active_at:'2026-10-15T11:59Z'}]};
    else throw Error('Unexpected path '+path);
    return {ok:true,json:async()=>data};
   };
   let status,body;const headers={};
   await handler({method:'GET',headers:{authorization:'Bearer fixture'},query:{section}},{setHeader:(k,v)=>{headers[k]=v},status(c){status=c;return this},json(d){body=d;return this}});
   assert.equal(status,200);assert.equal(headers['Cache-Control'],'no-store');assert.equal(body.data.items.length,2);
   assert.equal(body.data.items[0].last_active_at,'2026-10-15T11:55Z');assert.equal(body.data.items[1].last_active_at,null);
  }
 }finally{global.fetch=originalFetch}
}
async function directory(){
 const {Window}=await import('happy-dom');const window=new Window(),content=window.document.createElement('div');
 content.id='content';window.document.body.append(content);
 const html=fs.readFileSync('founder/index.html','utf8');
 const source=html.slice(html.indexOf('function activityTime('),html.indexOf('function appLabel('));
 const items=[{user_id:ids.coach,name:'Coach Fixture',last_sign_in_at:'2026-10-01T12:00:00Z',last_active_at:'2026-10-15T12:00:00Z',last_active_platform:'ios'}, {user_id:ids.unused,name:'Unused Fixture'}];
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const context={Date,Number,Math,esc,date:x=>x,api:async()=>({items,generated_at:'2026-10-15T12:01:00Z'}),$:id=>window.document.getElementById(id),stat:()=>'',sectionHead:(title,note)=>'<h2>'+esc(title)+'</h2><p>'+esc(note)+'</p>'};
 vm.createContext(context);vm.runInContext(source,context);
 for(const render of ['renderCoaches','renderAthletes']){
  await vm.runInContext(render+'()',context);
  const headers=[...content.querySelectorAll('th')].map(x=>x.textContent);
  assert.ok(headers.includes('Last Sign-in'));assert.ok(headers.includes('Last App Activity'));
  assert.ok(content.textContent.includes('Never signed in'));assert.ok(content.textContent.includes('No activity recorded'));
  const row=content.querySelector('tbody tr');assert.equal(row.querySelectorAll('td').length,headers.length);
  assert.ok(row.textContent.includes('iOS app'));
 }
 await window.happyDOM.close();
}
(async()=>{await database();await client();await api();await directory();console.log('PASS: activity ownership, revoked/disabled/anonymous denial, Founder-only visibility, throttling, login separation, account deletion, idle/background suppression, account switches, API account mapping, and both directory renders.');})().catch(e=>{console.error(e);process.exitCode=1});
