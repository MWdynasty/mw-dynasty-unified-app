const SUPABASE_URL=process.env.SUPABASE_URL||'https://keqgunlfwhjgcsurynef.supabase.co';
const SUPABASE_KEY=process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_ANON_KEY||'sb_publishable_JWCLQzrdWA_ZmvbpV5urVg_rcT6NECm';

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'GET only'});
  try{
    const url=`${SUPABASE_URL}/rest/v1/membership_plans?active=eq.true&select=plan_code,display_name,audience,access_tier,monthly_price_cents,annual_price_cents,sponsored_athlete_price_cents,monthly_enabled,annual_enabled,currency&order=monthly_price_cents.asc`;
    const r=await fetch(url,{headers:{apikey:SUPABASE_KEY}});
    const plans=await r.json().catch(()=>null);
    if(!r.ok)throw new Error(plans?.message||`Pricing lookup failed (${r.status})`);
    return res.status(200).json({ok:true,version:'3.0.16',plans:Array.isArray(plans)?plans:[]});
  }catch(e){
    console.error('MW pricing error',e);
    return res.status(500).json({error:'MW pricing is temporarily unavailable'});
  }
};
