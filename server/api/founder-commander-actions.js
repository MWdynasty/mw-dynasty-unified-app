const SUPPORTED_ACTIONS=new Set(["set_ai_autonomy","create_objective","create_skool_post","update_skool_post","update_objective","create_ai_task","update_ai_task","review_website_project","create_knowledge","review_knowledge","review_approval","create_lead","update_lead","create_partnership","update_partnership","review_partnership_proposal","record_partnership_proposal_sent","create_campaign","update_campaign","create_cost","update_cost","update_support_triage","update_notification","mark_all_notifications_read","update_launch_gate","create_risk","update_risk","create_people_role","promote_ai_task_to_sop","create_sop","review_sop"]);
const HIGH_RISK_ACTIONS=new Set(['set_ai_autonomy','review_website_project','review_knowledge','review_partnership_proposal','record_partnership_proposal_sent','update_launch_gate','create_people_role','promote_ai_task_to_sop','create_sop','review_sop','update_risk']);
function normalizeActionParameters(value){
  const p=value&&typeof value==='object'&&!Array.isArray(value)?value:{};
  const out={};
  for(const [key,val] of Object.entries(p)){
    const camel=key.replace(/_([a-z])/g,(_,c)=>c.toUpperCase());
    out[camel]=val;
  }
  return out;
}
function requiresCommanderApproval(action,parameters={}){
  if(HIGH_RISK_ACTIONS.has(action))return true;
  const p=normalizeActionParameters(parameters);
  const status=String(p.status||p.decision||'').toLowerCase();
  if(action==='update_skool_post'&&['approved','posted','skipped'].includes(status))return true;
  if(action==='update_campaign'&&['active','scheduled','completed','cancelled'].includes(status))return true;
  if(action==='update_cost'&&status==='inactive')return true;
  if(action==='update_objective'&&['complete','completed','cancelled','canceled'].includes(status))return true;
  if(action==='update_ai_task'&&['complete','completed','cancelled','canceled'].includes(status))return true;
  if(['update_lead','update_partnership'].includes(action)&&['won','lost'].includes(status))return true;
  return false;
}
async function invokeFounderAction(req,payload){
  if(!SUPPORTED_ACTIONS.has(payload?.action))throw new Error('Unsupported Founder Commander action.');
  const handler=require('./founder');
  let response;
  const res={status(code){this.statusCode=code;return this;},json(body){response={status:this.statusCode||200,body};return response;},setHeader(){}};
  await handler({method:'POST',headers:req.headers,query:{},body:payload},res);
  if(!response||response.status<200||response.status>=300)throw Object.assign(new Error(response?.body?.error||'Founder action failed.'),{status:response?.status||500});
  return response.body;
}
module.exports={SUPPORTED_ACTIONS,normalizeActionParameters,requiresCommanderApproval,invokeFounderAction};
