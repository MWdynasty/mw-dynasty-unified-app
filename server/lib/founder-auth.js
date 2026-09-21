const {SUPABASE_URL,SUPABASE_KEY,bearer}=require('./mw-auth');

const TRANSIENT_STATUSES=new Set([408,425,429,500,502,503,504]);
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));

function accessError(message,status=500,code='FOUNDER_ACCESS_ERROR'){
  const e=new Error(message);
  e.status=status;
  e.code=code;
  return e;
}

async function fetchFounderJson(url,options={},label='Founder access check'){
  let lastError=null;
  for(let attempt=0;attempt<3;attempt++){
    try{
      const r=await fetch(url,options);
      const d=await r.json().catch(()=>null);
      if(r.ok)return {response:r,data:d};
      if(!TRANSIENT_STATUSES.has(r.status)){
        return {response:r,data:d};
      }
      lastError=accessError(d?.message||d?.msg||d?.error_description||`${label} temporarily unavailable.`,503,'FOUNDER_ACCESS_TRANSIENT');
    }catch(err){
      lastError=accessError(`${label} temporarily unavailable.`,503,'FOUNDER_ACCESS_TRANSIENT');
    }
    if(attempt<2)await sleep(160*(2**attempt));
  }
  throw lastError||accessError(`${label} temporarily unavailable.`,503,'FOUNDER_ACCESS_TRANSIENT');
}

async function founderAuth(req){
  const token=bearer(req);
  if(!token)throw accessError('Authentication required',401,'AUTH_REQUIRED');

  const auth=await fetchFounderJson(
    `${SUPABASE_URL}/auth/v1/user`,
    {headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json'}},
    'Founder authentication'
  );
  if(!auth.response.ok){
    if(auth.response.status===401||auth.response.status===403){
      throw accessError('Your Founder session is invalid or expired. Sign in again.',401,'SESSION_INVALID');
    }
    throw accessError('Founder authentication is temporarily unavailable. Access remains locked; try again shortly.',503,'FOUNDER_ACCESS_TRANSIENT');
  }
  const user=auth.data;
  if(!user?.id)throw accessError('Your Founder session is invalid or expired. Sign in again.',401,'SESSION_INVALID');

  const profileResult=await fetchFounderJson(
    `${SUPABASE_URL}/rest/v1/profiles?user_id=eq.${encodeURIComponent(user.id)}&select=user_id,first_name,last_name,role,account_status&limit=1`,
    {headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json'}},
    'Founder authorization'
  );
  if(!profileResult.response.ok){
    if(profileResult.response.status===401){
      throw accessError('Your Founder session is invalid or expired. Sign in again.',401,'SESSION_INVALID');
    }
    if(profileResult.response.status===403){
      throw accessError('Founder / Owner access required',403,'FOUNDER_FORBIDDEN');
    }
    throw accessError('Founder authorization is temporarily unavailable. Access remains locked; try again shortly.',503,'FOUNDER_ACCESS_TRANSIENT');
  }

  const rows=Array.isArray(profileResult.data)?profileResult.data:[];
  const profile=rows[0]||null;
  if(!profile||profile.role!=='founder_owner'||profile.account_status!=='active'){
    throw accessError('Founder / Owner access required',403,'FOUNDER_FORBIDDEN');
  }

  return {token,user,profile};
}

module.exports={founderAuth,fetchFounderJson,TRANSIENT_STATUSES};
