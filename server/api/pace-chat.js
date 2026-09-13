const coachMW = require('./chat');

module.exports = async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'POST only'});
  try{
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const question=String(body.question||'').trim();
    if(!question) return res.status(400).json({error:'Ask Pace AI a question.'});
    // The secured Coach MW endpoint loads the authenticated athlete's official
    // week and PRs from Supabase. Client-supplied context is intentionally not
    // trusted for authorization or program progression.
    req.body={messages:[{role:'user',content:question}]};
    return coachMW(req,res);
  }catch(e){
    return res.status(e.status||500).json({error:e.message||'Pace AI request failed.'});
  }
};
