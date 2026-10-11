(function(){
 'use strict';
 const base='https://keqgunlfwhjgcsurynef.supabase.co',key='sb_publishable_JWCLQzrdWA_ZmvbpV5urVg_rcT6NECm';
 const invite=new URLSearchParams(location.search).get('invite')||'';
 const $=id=>document.getElementById(id),status=$('status'),sessionKey='mwSupabaseSession';
 const originalStorage=[localStorage.getItem(sessionKey),sessionStorage.getItem(sessionKey)];
 let session=null,user=null,registration=null,busy=false,invalid=false;
 const fromHash=new URLSearchParams(location.hash.replace(/^#/,''));
 const originalHash=location.hash;
 function say(message,error=false){status.textContent=message;status.className=error?'error':'';}
 function current(){return !invalid&&location.hash===originalHash&&localStorage.getItem(sessionKey)===originalStorage[0]&&sessionStorage.getItem(sessionKey)===originalStorage[1];}
 function ensureCurrent(){if(!current())throw new Error('The account changed in another tab. Reopen your invitation to continue.');}
 async function request(path,body,authenticated=false,method='POST'){
  ensureCurrent();
  const r=await fetch(base+path,{method,headers:{apikey:key,'Content-Type':'application/json',...(authenticated?{Authorization:'Bearer '+session.access_token}:{})},...(body?{body:JSON.stringify(body)}:{})});
  const data=await r.json().catch(()=>({}));ensureCurrent();
  if(!r.ok)throw new Error(data.message||data.msg||data.error_description||'Your invitation could not be processed.');
  return data;
 }
 function storeAndEnter(){
  ensureCurrent();
  localStorage.setItem(sessionKey,JSON.stringify({...session,user}));
  sessionStorage.removeItem(sessionKey);
  history.replaceState({},document.title,location.pathname+location.search);
  location.assign('/athlete/');
 }
 function ageEligible(value){
  const d=new Date(value+'T00:00:00');if(Number.isNaN(d.getTime()))return false;
  const today=new Date();let age=today.getFullYear()-d.getFullYear();
  if(today.getMonth()<d.getMonth()||(today.getMonth()===d.getMonth()&&today.getDate()<d.getDate()))age--;
  return age>=13;
 }
 $('verifyForm').onsubmit=async e=>{
  e.preventDefault();if(busy)return;busy=true;$('verifyButton').disabled=true;
  try{
   if(!/^[0-9a-f-]{36}$/i.test(invite))throw new Error('Open the invitation your coach sent you.');
   const email=$('verifyEmail').value.trim().toLowerCase();
   if(!email)throw new Error('Enter the email your coach invited.');
   await request('/auth/v1/otp?redirect_to='+encodeURIComponent('https://app.mwdynasty.com/athlete/pilot.html?invite='+encodeURIComponent(invite)),{email,create_user:true,data:{account_type:'athlete',mw_invite_token:invite,training_context:'coach_team'}});
   say('Check your inbox for the secure setup link. Open the newest email to finish joining your coach’s pilot.');
  }catch(error){say(error.message,true)}finally{busy=false;$('verifyButton').disabled=false;}
 };
 $('profileForm').onsubmit=async e=>{
  e.preventDefault();if(busy)return;busy=true;$('joinButton').disabled=true;
  try{
   ensureCurrent();if(!$('agree').checked)throw new Error('Confirm the coach connection and accept the Terms and Privacy Policy.');
   let body={p_invite_token:invite};
   if(!registration?.registration_complete){
    const first=$('firstName').value.trim(),last=$('lastName').value.trim(),dob=$('dateOfBirth').value,pw=$('password').value;
    if(!first||!last||!dob)throw new Error('Complete your name and date of birth.');
    if(!ageEligible(dob))throw new Error('MW Dynasty athlete accounts require age 13 or older.');
    if(pw.length<8||pw!==$('confirmPassword').value)throw new Error('Use matching passwords with at least 8 characters.');
    await request('/auth/v1/user',{password:pw,data:{first_name:first,last_name:last,date_of_birth:dob,account_type:'athlete',training_context:'coach_team'}},true,'PUT');
    body={...body,p_first_name:first,p_last_name:last,p_date_of_birth:dob};
   }
   const result=await request('/rest/v1/rpc/mw_complete_coach_pilot_registration',body,true);
   if(!result.ok||!result.pilot_active)throw new Error('Pilot access could not be activated.');
   say('Your free pilot account is connected. Opening your athlete dashboard…');storeAndEnter();
  }catch(error){say(error.message,true)}finally{busy=false;$('joinButton').disabled=false;}
 };
 window.addEventListener('storage',e=>{
  if((e.key===sessionKey||e.key===null)&&!current()){
   invalid=true;$('profileForm').hidden=true;$('verifyForm').hidden=true;
   for(const id of ['password','confirmPassword','firstName','lastName','dateOfBirth'])$(id).value='';
   say('The account changed in another tab. Reopen your invitation to continue.',true);
  }
 });
 async function init(){
  try{
   if(!/^[0-9a-f-]{36}$/i.test(invite))throw new Error('This invitation link is incomplete. Ask your coach for a new link.');
   if(fromHash.get('error'))throw new Error('This email link is invalid or expired. Enter your invited email to request a fresh setup link.');
   const accessToken=fromHash.get('access_token'),type=fromHash.get('type');
   if(!accessToken||!['signup','email','magiclink','invite'].includes(type||''))return;
   session={access_token:accessToken,refresh_token:fromHash.get('refresh_token')||'',token_type:'bearer',expires_in:Number(fromHash.get('expires_in')||3600),expires_at:Math.floor(Date.now()/1000)+Number(fromHash.get('expires_in')||3600)};
   $('verifyForm').hidden=true;say('Verifying your athlete invitation…');
   user=await request('/auth/v1/user',null,true,'GET');
   registration=await request('/rest/v1/rpc/mw_pilot_invitation_status',{p_invite_token:invite},true);
   $('title').textContent='Join '+(registration.coach_name||'your coach')+'’s pilot.';
   $('intro').textContent=registration.registration_complete?'Your existing athlete profile stays with you. Confirm the connection to join this free pilot.':'Finish your own athlete profile, then join your coach’s pilot at no charge.';
   $('verifiedEmail').textContent='Verified athlete email: '+user.email;
   $('newProfile').hidden=registration.registration_complete===true;
   $('firstName').value=registration.first_name==='Athlete'?'':registration.first_name||'';
   $('lastName').value=registration.last_name||'';
   $('joinButton').textContent=registration.registration_complete?'JOIN FREE PILOT':'CREATE PROFILE & JOIN FREE PILOT';
   $('profileForm').hidden=false;say('No membership checkout or payment method is required.');
  }catch(error){say(error.message,true);if(!session)$('verifyForm').hidden=false;}
 }
 init();
})();
