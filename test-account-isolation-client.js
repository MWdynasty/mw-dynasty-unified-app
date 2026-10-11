'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('lib/mw-account-scope.js','utf8');
const uidA='11111111-1111-4111-8111-111111111111',uidB='22222222-2222-4222-8222-222222222222';
function token(uid,sid='session-1'){return 'test.'+Buffer.from(JSON.stringify({sub:uid,session_id:sid})).toString('base64url')+'.signature'}
function session(uid,sid){return {access_token:token(uid,sid),refresh_token:'refresh-'+uid,user:{id:uid}}}
function storage(){const map=new Map();return {get length(){return map.size},getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k),key:i=>[...map.keys()][i],map}}
function page(local=storage(),tab=storage(),fetch=async()=>new Response('{}'),path='/coach/'){
 const events={},docEvents={},microtasks=[];let reloads=0;
 const c={localStorage:local,sessionStorage:tab,fetch,location:{pathname:path,search:'',href:'https://fixture.invalid'+path,reload(){reloads++},assign(target){this.target=target}},document:{documentElement:{style:{}},addEventListener:(n,f)=>docEvents[n]=f},URL,URLSearchParams,Headers,Response,atob,setTimeout,clearTimeout,CustomEvent:class{constructor(type){this.type=type}},queueMicrotask:f=>microtasks.push(f),addEventListener:(n,f)=>events[n]=f,dispatchEvent(){}};
 c.window=c;vm.createContext(c);vm.runInContext(source,c);
 return {c,local,tab,events,docEvents,get reloads(){return reloads},flush(){while(microtasks.length)microtasks.shift()()}};
}
async function main(){
 const local=storage();local.setItem('mwCoachSupabaseSession',JSON.stringify(session(uidA)));local.setItem('mwCoachProConversation','Unowned legacy private conversation');
 const a=page(local),a2=page(local);
 assert.equal(a.c.MWAccountStorage.local.getItem('mwCoachProConversation'),null,'never assign an unowned legacy conversation to the next user');
 a.c.MWAccountStorage.local.setItem('mwCoachProConversation','Private A');a.c.MWAccountStorage.local.setItem('mwCoach:program','Workout A');
 a.c.MWAccountStorage.local.setItem('mwCoachSupabaseSession',JSON.stringify(session(uidB)));a.flush();
 assert.equal(a.reloads,1);assert.equal(a.c.document.documentElement.style.visibility,'hidden');assert.throws(()=>a.c.MWAccountStorage.local.setItem('mwCoach:program','Late A write'),/account changed/);
 a2.events.storage({key:'mwCoachSupabaseSession'});assert.equal(a2.reloads,1,'another open tab hides the previous account');
 const b=page(local);assert.equal(b.c.MWAccountStorage.local.getItem('mwCoachProConversation'),null);assert.equal(b.c.MWAccountStorage.local.getItem('mwCoach:program'),null);
 b.c.MWAccountStorage.local.setItem('mwCoach:program','Workout B');
 assert.equal(local.getItem('mwAccount:'+uidA+':mwCoach:program'),'Workout A');
 let release;const race=page(local,storage(),()=>new Promise(r=>release=r));
 const request=race.c.fetch('/api/coach/roster',{headers:{Authorization:'Bearer '+token(uidB)}});
 local.removeItem('mwCoachSupabaseSession');release(new Response('{"private":"B"}'));
 await assert.rejects(request,/account changed/);assert.equal(race.reloads,1);
 local.setItem('mwCoachSupabaseSession',JSON.stringify(session(uidA)));let resolveBody;
 const bodyPage=page(local,storage(),async()=>({json:()=>new Promise(r=>resolveBody=r)}));
 const response=await bodyPage.c.fetch('/api/coach/roster',{headers:{Authorization:'Bearer '+token(uidA)}}),body=response.json();
 local.setItem('mwCoachSupabaseSession',JSON.stringify(session(uidB)));resolveBody({private:'A'});await assert.rejects(body,/account changed/);
 local.setItem('mwCoachSupabaseSession',JSON.stringify(session(uidA)));let finishRefresh;
 const refreshPage=page(local,storage(),()=>new Promise(r=>finishRefresh=r));
 const refresh=refreshPage.c.fetch('https://db.invalid/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:session(uidA).refresh_token})});
 local.removeItem('mwCoachSupabaseSession');finishRefresh(new Response(JSON.stringify(session(uidA))));await assert.rejects(refresh,/account changed/);assert.equal(local.getItem('mwCoachSupabaseSession'),null);
 // A token rotation for the same authenticated session must preserve the workspace.
 local.setItem('mwCoachSupabaseSession',JSON.stringify(session(uidA)));const stable=page(local);stable.c.MWAccountStorage.local.setItem('mwCoachSupabaseSession',JSON.stringify({...session(uidA),refresh_token:'rotated'}));stable.flush();assert.equal(stable.reloads,0);
 local.removeItem('mwCoachSupabaseSession');stable.events.pageshow({persisted:true});assert.equal(stable.reloads,1);
  local.setItem('mwSupabaseSession',JSON.stringify(session(uidA)));const transfer=page(local,storage(),undefined,'/athlete/');transfer.c.MWAccountScope.handoff('/coach/','mwCoachSupabaseSession',session(uidA));transfer.flush();assert.equal(transfer.reloads,0);assert.equal(local.getItem('mwSupabaseSession'),null);assert.equal(JSON.parse(local.getItem('mwCoachSupabaseSession')).user.id,uidA);
 local.setItem('mwCoachSupabaseSession',JSON.stringify(session(uidA)));let revoke,logoutInit;
 const logout=page(local,storage(),(url,init)=>{logoutInit=init;return new Promise(r=>revoke=r)});
 const done=logout.c.MWAccountScope.signOut('https://db.invalid','publishable');
 assert.equal(logout.c.document.documentElement.style.visibility,'hidden');assert.equal(logout.reloads,0,'do not cancel server revocation with an immediate reload');assert.equal(local.getItem('mwCoachSupabaseSession'),null);assert.equal(logoutInit.keepalive,true);assert.throws(()=>logout.c.MWAccountStorage.local.setItem('private','late'),/account changed/);
 revoke(new Response('{}'));await done;assert.equal(logout.reloads,1);
 local.setItem('mwCoachSupabaseSession',JSON.stringify(session(uidA)));local.setItem('mwConversationV3:'+uidA,'Owned history');const legacy=page(local);assert.equal(legacy.c.MWAccountStorage.local.getItem('mwConversationV3:'+uidA),'Owned history');assert.equal(legacy.c.MWAccountStorage.local.getItem('mwConversationV3:'+uidB),null);
 console.log('PASS: separate account caches, shared-device switch, second tab, stale API/body, late refresh, token rotation and back/forward restoration.');
}
main().catch(e=>{console.error(e);process.exitCode=1});
