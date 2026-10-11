'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const inviteSource=fs.readFileSync('server/api/coach/invite.js','utf8');
const pilotSource=fs.readFileSync('athlete/pilot.js','utf8');
async function invitation(active,billingType='self_pay'){
 const calls=[],rows=[];
 const context={module:{exports:{}},require:name=>name==='crypto'?{randomUUID:()=> '11111111-1111-4111-8111-111111111111'}:{getAccountContext:async()=>({profile:{role:'coach'},user:{id:'coach-fixture'},token:'fixture-token'}),SUPABASE_URL:'https://fixture.invalid',SUPABASE_KEY:'fixture-publishable'},fetch:async(url,init)=>{
  calls.push({url,body:init.body?JSON.parse(init.body):null});
  let data={};
  if(url.includes('mw_current_coach_pilot_status'))data={active};
  else if(url.includes('coach_invitations')&&init.method==='GET')data=[];
  else if(url.includes('coach_invitations')&&init.method==='POST'){
   const row=JSON.parse(init.body);rows.push(row);data=[{...row,id:1,billing_type:active?'coach_pilot':'self_pay'}];
  }
  return{ok:true,json:async()=>data};
 }};
 vm.runInNewContext(inviteSource,context);let status,body;
 const res={setHeader(){},status(s){status=s;return this},json(v){body=v;return this}};
 await context.module.exports({method:'POST',headers:{host:'app.mwdynasty.com'},body:{email:'athlete@example.invalid',billingType}},res);
 return{status,body,calls,rows};
}
async function domCase({complete=false,switchAccount=false,underage=false,initial=false}={}){
 const {Window}=await import(process.env.MW_PRACTICE_DOM_PATH||'happy-dom');
 const url='https://app.mwdynasty.com/athlete/pilot.html?invite=11111111-1111-4111-8111-111111111111'+(initial?'':'#access_token=fixture-token&refresh_token=fixture-refresh&type=magiclink');
 const win=new Window({url,settings:{disableCSSFileLoading:true,disableJavaScriptFileLoading:true,disableJavaScriptEvaluation:true}});
 const html=fs.readFileSync('athlete/pilot.html','utf8').replace(/<script[^>]*>[\s\S]*?<\/script>/g,'');win.document.write(html);
 const calls=[],redirects=[];
 win.location.assign=value=>redirects.push(value);
 win.fetch=async(path,init)=>{
  calls.push({path,body:init.body?JSON.parse(init.body):null});
  let data={};
  if(path.endsWith('/auth/v1/user')&&init.method==='GET')data={id:'athlete-fixture',email:'athlete@example.invalid'};
  if(path.includes('mw_pilot_invitation_status'))data={registration_complete:complete,first_name:complete?'Existing':'Athlete',last_name:complete?'Runner':'',coach_name:'Coach Fixture',email:'athlete@example.invalid'};
  if(path.includes('mw_complete_coach_pilot_registration')){
   if(switchAccount)win.localStorage.setItem('mwSupabaseSession',JSON.stringify({access_token:'another-athlete-token'}));
   data={ok:true,pilot_active:true,payment_required:false};
  }
  return{ok:true,json:async()=>data};
 };
 win.eval(pilotSource);
 const tick=()=>new Promise(r=>setImmediate(r));await tick();await tick();
 const el=id=>win.document.getElementById(id);
 if(initial){
  assert.equal(el('verifyForm').hidden,false);el('verifyEmail').value='athlete@example.invalid';
  el('verifyForm').dispatchEvent(new win.Event('submit',{bubbles:true,cancelable:true}));await tick();await tick();
  assert(calls.some(x=>x.path.includes('/auth/v1/otp?redirect_to=')));
  assert.equal(calls.at(-1).body.create_user,true);assert(!calls.some(x=>x.path.includes('stripe')));
 }else{
  assert.equal(el('profileForm').hidden,false);assert.equal(el('newProfile').hidden,complete);
  el('agree').checked=true;
  if(!complete){el('firstName').value='Pilot';el('lastName').value='Runner';el('dateOfBirth').value=underage?'2020-01-01':'2005-01-01';el('password').value='fixture-password';el('confirmPassword').value='fixture-password';}
  el('profileForm').dispatchEvent(new win.Event('submit',{bubbles:true,cancelable:true}));await tick();await tick();await tick();
  if(underage){assert.match(el('status').textContent,/13 or older/);assert(!calls.some(x=>x.body?.password));}
  else if(switchAccount){assert.equal(JSON.parse(win.localStorage.getItem('mwSupabaseSession')).access_token,'another-athlete-token');assert.match(el('status').textContent,/account changed/i);}
  else{
   assert.equal(JSON.parse(win.localStorage.getItem('mwSupabaseSession')).user.id,'athlete-fixture');
   assert.equal(calls.some(x=>x.body?.password),!complete,'returning athletes keep their existing password');
   assert(calls.some(x=>x.path.includes('mw_complete_coach_pilot_registration')));
   assert(!calls.some(x=>x.path.includes('stripe')||x.path.includes('checkout')));
  }
 }
 await win.happyDOM.abort();win.close();
}
(async()=>{
 const active=await invitation(true);assert.equal(active.status,201);assert.equal(active.body.emailSent,true);assert.match(active.body.inviteUrl,/\/athlete\/pilot.html\?invite=/);
 assert.match(active.calls.at(-1).url,/auth\/v1\/otp/);assert.equal(active.calls.at(-1).body.data.mw_invite_billing_type,'coach_pilot');
 assert(!active.calls.some(x=>/sponsor_seat|stripe/.test(x.url)));
 const forged=await invitation(false,'coach_pilot');assert.equal(forged.status,403);assert.equal(forged.rows.length,0);
 const paid=await invitation(false);assert.equal(paid.status,201);assert.match(paid.body.inviteUrl,/\/athlete\/\?invite=/);
 await domCase({initial:true});await domCase();await domCase({complete:true});await domCase({underage:true});await domCase({switchAccount:true});
 console.log('PASS: actual invitation handler and pilot DOM flow, email verification, new and returning athletes, no checkout, age validation, and stale-session protection.');
})().catch(e=>{console.error(e);process.exitCode=1});
