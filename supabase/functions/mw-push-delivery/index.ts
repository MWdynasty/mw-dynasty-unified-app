type QueueItem={id:number;notification_id:string;recipient_user_id:string;notification_type:string;title:string;body:string;action_view:string|null;entity_type:string|null;entity_id:string|null;attempt_count:number};
type Device={device_id:string;device_token:string;apns_environment:'development'|'production'};

const supabaseUrl=Deno.env.get('SUPABASE_URL')||'';
const serviceKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const bundleId=Deno.env.get('MW_APNS_BUNDLE_ID')||'com.mwdynasty.app';
const keyId=Deno.env.get('MW_APNS_KEY_ID')||'';
const teamId=Deno.env.get('MW_APNS_TEAM_ID')||'';
const privateKeyText=Deno.env.get('MW_APNS_PRIVATE_KEY')||'';

function b64url(value:Uint8Array|string){
  const bytes=typeof value==='string'?new TextEncoder().encode(value):value;
  let binary='';for(const b of bytes)binary+=String.fromCharCode(b);
  return btoa(binary).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
}
let cachedJwt:{value:string;created:number}|null=null;
async function apnsJwt(){
  const now=Math.floor(Date.now()/1000);if(cachedJwt&&now-cachedJwt.created<45*60)return cachedJwt.value;
  const pem=privateKeyText.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,'');
  if(!pem||!keyId||!teamId)throw new Error('APNs signing credentials are not configured');
  const der=Uint8Array.from(atob(pem),c=>c.charCodeAt(0));
  const key=await crypto.subtle.importKey('pkcs8',der,{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
  const header=b64url(JSON.stringify({alg:'ES256',kid:keyId})),payload=b64url(JSON.stringify({iss:teamId,iat:now}));
  const input=`${header}.${payload}`;
  const signature=new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,new TextEncoder().encode(input)));
  const jwt=`${input}.${b64url(signature)}`;cachedJwt={value:jwt,created:now};return jwt;
}
function restHeaders(){return{apikey:serviceKey,Authorization:`Bearer ${serviceKey}`,'Content-Type':'application/json',Prefer:'return=representation'}}
async function rest(path:string,options:RequestInit={}){
  const response=await fetch(`${supabaseUrl}/rest/v1/${path}`,{...options,headers:{...restHeaders(),...(options.headers||{})}});
  const body=await response.json().catch(()=>null);if(!response.ok)throw new Error(body?.message||`Supabase REST failed (${response.status})`);return body;
}
async function rpc(name:string,body:Record<string,unknown>){
  const response=await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`,{method:'POST',headers:restHeaders(),body:JSON.stringify(body)});
  const result=await response.json().catch(()=>null);if(!response.ok)throw new Error(result?.message||`Supabase RPC failed (${response.status})`);return result;
}
async function sendToDevice(device:Device,jwt:string,item:QueueItem){
  const host=device.apns_environment==='development'?'https://api.sandbox.push.apple.com':'https://api.push.apple.com';
  const payload={aps:{alert:{title:item.title,body:item.body},sound:'default'},mw:{action_view:item.action_view||'home',notification_type:item.notification_type,entity_type:item.entity_type,entity_id:item.entity_id,notification_id:item.notification_id}};
  return await fetch(`${host}/3/device/${device.device_token}`,{method:'POST',headers:{authorization:`bearer ${jwt}`,'apns-topic':bundleId,'apns-push-type':'alert','apns-priority':'10','content-type':'application/json'},body:JSON.stringify(payload)});
}
async function updateQueue(id:number,body:Record<string,unknown>){return rest(`mw_push_delivery_queue?id=eq.${id}`,{method:'PATCH',body:JSON.stringify(body),headers:{Prefer:'return=minimal'}})}
function preferenceKey(type:string){const t=type.toLowerCase();if(t.includes('adaptive')||t.includes('review'))return'adaptive_updates';if(t.includes('summary')||t.includes('progress'))return'progress_summaries';if(t.includes('workout')||t.includes('inactivity')||t.includes('reminder'))return'inactivity_reminders';return null}
function localHour(date:Date,timeZone:string){return Number(new Intl.DateTimeFormat('en-US',{timeZone,hour:'2-digit',hourCycle:'h23'}).format(date))}
function isQuietNow(timeZone:string){const hour=localHour(new Date(),timeZone);return hour>=21||hour<7}
function nextAllowedAt(timeZone:string){const start=Date.now();for(let minute=1;minute<=30*60;minute++){const candidate=new Date(start+minute*60_000),hour=localHour(candidate,timeZone);if(hour>=7&&hour<21)return candidate.toISOString()}return new Date(start+10*60*60_000).toISOString()}

Deno.serve(async request=>{
  if(request.method!=='POST')return new Response('Method not allowed',{status:405});
  if(!supabaseUrl||!serviceKey)return Response.json({error:'Push worker is missing Supabase configuration'},{status:503});
  const workerSecret=request.headers.get('x-mw-push-worker-secret')||'';
  if(workerSecret.length<40)return Response.json({error:'Unauthorized'},{status:401});
  try{
    const valid=await rpc('mw_validate_push_worker_secret',{p_secret:workerSecret});
    if(valid!==true)return Response.json({error:'Unauthorized'},{status:401});
  }catch{return Response.json({error:'Unauthorized'},{status:401})}
  if(!privateKeyText||!keyId||!teamId)return Response.json({error:'APNs signing credentials are not configured'},{status:503});
  try{
    const queue=await rest('mw_push_delivery_queue?select=id,notification_id,recipient_user_id,notification_type,title,body,action_view,entity_type,entity_id,attempt_count&delivered_at=is.null&expires_at=gt.now()&next_attempt_at=lte.now()&attempt_count=lt.5&order=id.asc&limit=100') as QueueItem[];
    const counts={processed:0,delivered:0,skipped:0,retried:0};
    for(const item of queue){
      counts.processed++;
      try{
        const [preferences,devices]=await Promise.all([
          rest(`mw_notification_preferences?select=push_enabled,inactivity_reminders,adaptive_updates,progress_summaries,quiet_hours_enabled,timezone&user_id=eq.${encodeURIComponent(item.recipient_user_id)}&limit=1`) as Promise<Array<{push_enabled:boolean;inactivity_reminders:boolean;adaptive_updates:boolean;progress_summaries:boolean;quiet_hours_enabled:boolean;timezone:string}>>,
          rest(`mw_push_devices?select=device_id,device_token,apns_environment&user_id=eq.${encodeURIComponent(item.recipient_user_id)}&disabled_at=is.null&expires_at=gt.now()`) as Promise<Device[]>
        ]);
        const pref=preferences?.[0],category=preferenceKey(item.notification_type);
        const categoryEnabled=category==='adaptive_updates'?pref?.adaptive_updates:category==='progress_summaries'?pref?.progress_summaries:category==='inactivity_reminders'?pref?.inactivity_reminders:true;
        if(!pref?.push_enabled||!devices?.length||categoryEnabled===false){
          await updateQueue(item.id,{delivered_at:new Date().toISOString(),delivery_status:'skipped',last_error:null});counts.skipped++;continue;
        }
        if(pref.quiet_hours_enabled&&isQuietNow(pref.timezone||'America/Chicago')){await updateQueue(item.id,{next_attempt_at:nextAllowedAt(pref.timezone||'America/Chicago'),delivery_status:'quiet_hours'});counts.skipped++;continue}
        const jwt=await apnsJwt();let delivered=false,lastError='No active APNs device accepted the notification';
        for(const device of devices){
          const response=await sendToDevice(device,jwt,item);
          if(response.ok){delivered=true;continue}
          const reason=(await response.text()).slice(0,500);
          if(response.status===410){
            await rest(`mw_push_devices?device_id=eq.${encodeURIComponent(device.device_id)}`,{method:'PATCH',body:JSON.stringify({disabled_at:new Date().toISOString()}),headers:{Prefer:'return=minimal'}});
          }else lastError=`APNs ${response.status}: ${reason}`;
        }
        if(delivered){await updateQueue(item.id,{delivered_at:new Date().toISOString(),delivery_status:'delivered',last_error:null});counts.delivered++}
        else throw new Error(lastError);
      }catch(error){
        const attempts=Number(item.attempt_count||0)+1,delay=Math.min(60,2**attempts);
        await updateQueue(item.id,{attempt_count:attempts,next_attempt_at:new Date(Date.now()+delay*60_000).toISOString(),last_error:String(error).slice(0,500),delivery_status:attempts>=5?'failed':'retrying',...(attempts>=5?{delivered_at:new Date().toISOString()}:{})});
        counts.retried++;
      }
    }
    return Response.json({ok:true,...counts});
  }catch(error){return Response.json({error:String(error).slice(0,500)},{status:500})}
});
