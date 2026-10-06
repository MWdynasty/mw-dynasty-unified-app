'use strict';
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync('athlete/index.html','utf8');
const el={textContent:'',innerHTML:''},btn={style:{}},note={style:{}},calls=[];
let stored=null;
const c={window:{},document:{getElementById:id=>id==='mwAthleteBillingStatus'?el:id==='mwContinueSelfPay'?btn:id==='mwBillingTransitionNote'?note:null,querySelectorAll:()=>[]},localStorage:{getItem:()=>stored},sessionStorage:{getItem:()=>null},fetch:async(url,options)=>{calls.push({url,options});return {ok:true,json:async()=>({status:{billing_type:'individual',subscription_status:'active',current_period_end:'2026-11-04T18:21:07Z'}})}},console,Date,JSON,history:{state:{},pushState(){}},location:{href:'fixture'},mwSetHomeScrollLock(){},$(){return null}};
vm.createContext(c);
vm.runInContext(source.slice(source.indexOf("function sess(){",source.indexOf("<script>(function(){")),source.indexOf('function mwMoney(')),c);
vm.runInContext(source.slice(source.indexOf('async function mwLoadBillingStatus('),source.indexOf('async function mwPrepareSelfPay(')),c);
vm.runInContext(source.slice(source.indexOf('function openView('),source.indexOf("if(!history.state?.mwView)")),c);
(async()=>{
await c.mwLoadBillingStatus();assert.match(el.textContent,/Sign in again/);assert.equal(calls.length,0,'no unauthenticated billing request');
stored=JSON.stringify({access_token:'fixture-session'});
c.openView('settings');await new Promise(resolve=>setImmediate(resolve));
assert.equal(calls.length,1,'opening Settings fetches billing after successful login');assert.equal(calls[0].options.headers.Authorization,'Bearer fixture-session');assert.match(el.innerHTML,/Active/);assert.match(el.innerHTML,/11\/4\/2026/);assert.equal(btn.style.display,'none');
console.log('PASS: Settings refreshes membership after first sign-in and renders active billing period using the authenticated session.');
})().catch(e=>{console.error(e);process.exitCode=1});
