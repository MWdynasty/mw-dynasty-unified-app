'use strict';
// Explicitly isolated staging only. Never use a production account or log tokens.
const assert=require('node:assert/strict');
const base='https://uuggbmccnyswiwkjgydo.supabase.co';
const email=process.env.MW_DELETE_QA_EMAIL,password=process.env.MW_DELETE_QA_PASSWORD,key=process.env.MW_DELETE_QA_PUBLIC_KEY;
assert.match(email||'',/^mw-delete-[a-f0-9-]+@example\.invalid$/);
assert.ok(password&&key,'Disposable staging credentials are required');
async function call(path,body,token){
 const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{apikey:key,...(token?{authorization:'Bearer '+token}:{}),...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
 return {status:response.status,body:await response.json().catch(()=>null)};
}
(async()=>{
 const login=await call('/auth/v1/token?grant_type=password',{email,password});
 assert.equal(login.status,200,'Disposable staging login failed');
 assert.ok(login.body?.access_token&&login.body?.user?.id);
 const token=login.body.access_token,refreshToken=login.body.refresh_token;
 const profile=await call('/rest/v1/profiles?select=role&user_id=eq.'+login.body.user.id,undefined,token);
 assert.equal(profile.status,200);assert.equal(profile.body?.[0]?.role,'athlete');
 const deleted=await call('/functions/v1/mw-delete-account',{user_id:'must-never-be-used'},token);
 if(deleted.status!==200){console.log(JSON.stringify({phase:'delete',status:deleted.status,error:deleted.body?.error||deleted.body?.message||null}));process.exitCode=1;return;}
 assert.equal(deleted.body?.deleted,true);assert.equal(deleted.body?.role,'athlete');
 const relogin=await call('/auth/v1/token?grant_type=password',{email,password});
 assert.equal(relogin.status,400,'Deleted account must not sign in');
 const oldSession=await call('/auth/v1/user',undefined,token);
 assert.ok(oldSession.status===401||oldSession.status===403,'Deleted user must fail authenticated user lookup');
 const refresh=await call('/auth/v1/token?grant_type=refresh_token',{refresh_token:refreshToken});
 assert.ok(refresh.status===400||refresh.status===401,'Deleted session must not refresh');
 console.log(JSON.stringify({environment:'Phase 1 staging',login:'passed',authenticatedProfile:'athlete',deletion:'passed',reloginDenied:true,oldUserLookupDenied:true,refreshDenied:true,physicalDeviceTest:false}));
})().catch(error=>{console.error(error.name+': '+error.message);process.exitCode=1});
