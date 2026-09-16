const {authenticate,SUPABASE_URL,SUPABASE_KEY}=require('../lib/mw-coach-auth');

async function rpc(name,token,args={}){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`,{
    method:'POST',
    headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
    body:JSON.stringify(args)
  });
  const text=await r.text();
  let data=null;try{data=text?JSON.parse(text):null}catch{data=text}
  if(!r.ok)throw Object.assign(new Error(data?.message||data?.hint||data?.details||String(data||`Billing request failed (${r.status})`)),{status:r.status});
  return data;
}

module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  try{
    const {token}=await authenticate(req);
    if(req.method==='GET'){
      const status=await rpc('mw_billing_status',token,{});
      return res.status(200).json({ok:true,status});
    }
    if(req.method!=='POST')return res.status(405).json({error:'GET or POST only'});
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const action=String(body.action||'');
    if(action==='athlete_self_pay'){
      const result=await rpc('mw_request_athlete_self_pay_transition',token,{p_billing_cycle:String(body.billingCycle||'monthly')});
      return res.status(200).json({ok:true,result,checkoutRequired:true,checkoutAudience:'athlete'});
    }
    if(action==='coach_plan_change'){
      const result=await rpc('mw_request_coach_plan_change',token,{p_requested_tier:String(body.requestedTier||'')});
      return res.status(200).json({ok:true,result,checkoutRequired:!!result?.payment_required,checkoutAudience:'coach'});
    }
    if(action==='coach_end_sponsorship'){
      const result=await rpc('mw_coach_schedule_sponsorship_end',token,{p_athlete_user_id:body.athleteUserId,p_end_at:body.endAt});
      return res.status(200).json({ok:true,result});
    }
    return res.status(400).json({error:'Unsupported billing action'});
  }catch(e){return res.status(e.status||500).json({error:e.message||'Billing request failed'})}
};
