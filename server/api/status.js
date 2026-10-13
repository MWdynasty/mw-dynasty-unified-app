'use strict';
// Public, credential-free liveness and dependency reachability signal.
// This does not establish whether a specific user's role, database query,
// billing entitlement, or Coach/Founder dashboard is operational.
const {SUPABASE_URL,SUPABASE_KEY}=require('../lib/mw-coach-auth');
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store, max-age=0');
  if(req.method&&req.method!=='GET'&&req.method!=='HEAD')return res.status(405).json({error:'GET or HEAD only'});
  const checkedAt=new Date().toISOString();
  let auth='unavailable';
  try{
    const response=await fetch(SUPABASE_URL+'/auth/v1/health',{
      method:'GET',
      headers:{apikey:SUPABASE_KEY},
      signal:AbortSignal.timeout(2500),
      cache:'no-store'
    });
    auth=response.ok?'reachable':'unavailable';
  }catch{
    auth='unavailable';
  }
  const ok=auth==='reachable';
  res.setHeader('X-MW-Health',ok?'reachable':'degraded');
  return res.status(ok?200:503).json({
    ok,
    state:ok?'reachable':'degraded',
    checkedAt,
    version:'mw-dynasty-3.0.16',
    dependencies:{
      api:'reachable',
      authentication:auth,
      database:'not_checked',
      authorization:'not_checked',
      billing:'not_checked',
      ai:'not_checked'
    },
    note:'Reachability is not an end-to-end authenticated journey test.'
  });
};
