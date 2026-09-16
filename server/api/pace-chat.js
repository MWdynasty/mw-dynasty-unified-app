const {getAthleteContext}=require('../lib/mw-auth');
const coachMW=require('./chat');

module.exports=async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'POST only'});
  try{
    const c=await getAthleteContext(req);
    if(c.features?.access?.advanced_performance_tools!==true)return res.status(403).json({error:'Sprint Pace AI is included with the full MW Sprint Performance athlete experience.',feature:'advanced_performance_tools',upgradeRequired:true});
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const question=String(body.question||'').trim();if(!question)return res.status(400).json({error:'Ask Pace AI a question.'});
    req.body={messages:[{role:'user',content:question}]};
    return coachMW(req,res);
  }catch(e){return res.status(e.status||500).json({error:e.message||'Pace AI request failed.'})}
};
