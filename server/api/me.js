const {SUPABASE_URL,SUPABASE_KEY,authenticate,getAccountContext}=require('../lib/mw-auth');
async function refresh(req){try{const {token}=await authenticate(req);await fetch(`${SUPABASE_URL}/rest/v1/rpc/mw_refresh_own_program_state`,{method:'POST',headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:'{}'});}catch{}}
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({error:'GET only'});
  try{await refresh(req);const c=await getAccountContext(req);return res.status(200).json(c)}catch(e){return res.status(e.status||500).json({error:e.message||'MW athlete lookup failed'})}
};
