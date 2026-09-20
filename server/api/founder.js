const {authenticate,SUPABASE_URL,SUPABASE_KEY}=require('../lib/mw-auth');

async function founderAuth(req){
  const {token,user}=await authenticate(req);
  const r=await fetch(`${SUPABASE_URL}/rest/v1/profiles?user_id=eq.${encodeURIComponent(user.id)}&select=user_id,first_name,last_name,role,account_status&limit=1`,{
    headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`}
  });
  const rows=await r.json().catch(()=>[]);
  const p=Array.isArray(rows)?rows[0]:null;
  if(!r.ok||!p||p.role!=='founder_owner'||p.account_status!=='active'){
    throw Object.assign(new Error('Founder / Owner access required'),{status:403});
  }
  return {token,user,profile:p};
}
async function rpc(token,name,args={}){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`,{
    method:'POST',
    headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
    body:JSON.stringify(args)
  });
  const d=await r.json().catch(()=>null);
  if(!r.ok)throw Object.assign(new Error(d?.message||d?.hint||'Founder request failed'),{status:r.status});
  return d;
}
async function rest(token,path,{method='GET',body=null,prefer='return=representation'}={}){
  const headers={apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`};
  if(body!==null){headers['Content-Type']='application/json';headers.Prefer=prefer}
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{method,headers,body:body===null?undefined:JSON.stringify(body)});
  const d=await r.json().catch(()=>[]);
  if(!r.ok)throw Object.assign(new Error(d?.message||d?.hint||'Founder data update failed'),{status:r.status});
  return d;
}
function clean(v,max=500){return String(v??'').trim().slice(0,max)}
function one(rows){return Array.isArray(rows)?rows[0]||null:rows}
async function checkUrl(url){
  const started=Date.now();const ctl=new AbortController();const timer=setTimeout(()=>ctl.abort(),5500);
  try{
    const r=await fetch(url,{method:'GET',redirect:'follow',signal:ctl.signal,headers:{'User-Agent':'MW-Dynasty-Founder-Health/1.0'}});
    return {url,ok:r.ok,status:r.status,latency_ms:Date.now()-started,checked_at:new Date().toISOString()};
  }catch(e){
    return {url,ok:false,status:0,latency_ms:Date.now()-started,error:e?.name==='AbortError'?'timeout':'unreachable',checked_at:new Date().toISOString()};
  }finally{clearTimeout(timer)}
}

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  try{
    const {token}=await founderAuth(req);
    if(req.method==='GET'){
      const section=clean(req.query?.section||'overview',40).toLowerCase();
      const managementSections=new Set(['finance_costs','people','risk','operations']);
      const data=section==='programs'
        ?await rpc(token,'mw_founder_program_control',{})
        :managementSections.has(section)
          ?await rpc(token,'mw_founder_management_snapshot',{p_section:section})
          :await rpc(token,'mw_founder_os_snapshot',{p_section:section});
      if(section==='website'){
        const [site,app]=await Promise.all([checkUrl('https://mwdynasty.com/'),checkUrl('https://app.mwdynasty.com/')]);
        return res.status(200).json({ok:true,data:{...data,health:{website:site,app}}});
      }
      return res.status(200).json({ok:true,data});
    }
    if(req.method!=='POST')return res.status(405).json({error:'GET or POST only'});
    const b=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const action=clean(b.action,60);
    if(action==='create_ai_task'){
      const agent=clean(b.agentCode,80),title=clean(b.title,160),description=clean(b.description,2000);
      if(!agent||!title)return res.status(400).json({error:'AI agent and task title are required.'});
      const valid=one(await rest(token,`founder_ai_agents?code=eq.${encodeURIComponent(agent)}&status=eq.active&select=code,department&limit=1`));
      if(!valid)return res.status(400).json({error:'Unknown active AI employee.'});
      const row=one(await rest(token,'founder_ai_tasks',{method:'POST',body:{
        agent_code:agent,title,description:description||null,department:valid.department,
        priority:['low','normal','high','urgent'].includes(b.priority)?b.priority:'normal',
        source:'founder',requires_approval:!!b.requiresApproval,
        approval_status:b.requiresApproval?'pending':null,status:b.requiresApproval?'waiting_approval':'queued'
      }}));
      return res.status(200).json({ok:true,item:row});
    }
    if(action==='update_ai_task'){
      const id=clean(b.id,80);if(!id)return res.status(400).json({error:'Task id required.'});
      const patch={updated_at:new Date().toISOString()};
      if(['queued','in_progress','waiting_approval','completed','blocked','cancelled'].includes(b.status))patch.status=b.status;
      if(['low','normal','high','urgent'].includes(b.priority))patch.priority=b.priority;
      if(typeof b.outputSummary==='string')patch.output_summary=clean(b.outputSummary,4000)||null;
      if(patch.status==='completed')patch.completed_at=new Date().toISOString();
      const row=one(await rest(token,`founder_ai_tasks?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',body:patch}));
      return res.status(200).json({ok:true,item:row});
    }
    if(action==='create_knowledge'){
      const title=clean(b.title,180),principle=clean(b.principle,5000);
      if(!title||!principle)return res.status(400).json({error:'Title and Founder principle are required.'});
      const row=one(await rest(token,'founder_knowledge_proposals',{method:'POST',body:{
        title,principle_text:principle,status:'review',
        structured_rule:b.structuredRule&&typeof b.structuredRule==='object'?b.structuredRule:{},
        affected_areas:Array.isArray(b.affectedAreas)?b.affectedAreas.slice(0,30):[],
        conflict_notes:clean(b.conflictNotes,3000)||null
      }}));
      return res.status(200).json({ok:true,item:row});
    }
    if(action==='review_knowledge'){
      const id=clean(b.id,80),decision=clean(b.decision,20);
      if(!id||!['approved','rejected','published','review'].includes(decision))return res.status(400).json({error:'Valid knowledge decision required.'});
      const patch={status:decision,reviewed_at:new Date().toISOString(),updated_at:new Date().toISOString()};
      if(decision==='published')patch.published_at=new Date().toISOString();
      if(typeof b.conflictNotes==='string')patch.conflict_notes=clean(b.conflictNotes,3000)||null;
      const row=one(await rest(token,`founder_knowledge_proposals?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',body:patch}));
      return res.status(200).json({ok:true,item:row});
    }
    if(action==='review_approval'){
      const id=clean(b.id,80),decision=clean(b.decision,20);
      if(!id||!['approved','rejected'].includes(decision))return res.status(400).json({error:'Valid approval decision required.'});
      const row=one(await rest(token,`founder_approvals?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',body:{
        status:decision,reviewed_by:(await founderAuth(req)).user.id,review_note:clean(b.note,2000)||null,reviewed_at:new Date().toISOString()
      }}));
      return res.status(200).json({ok:true,item:row});
    }
    if(action==='create_lead'){
      const row=one(await rest(token,'founder_crm_leads',{method:'POST',body:{
        name:clean(b.name,160)||null,organization:clean(b.organization,200)||null,contact_email:clean(b.contactEmail,240)||null,
        lead_type:['coach','school','club','partner','other'].includes(b.leadType)?b.leadType:'other',
        stage:['new','qualified','contacted','meeting','proposal','negotiation','won','lost'].includes(b.stage)?b.stage:'new',
        source:clean(b.source,120)||null,assigned_agent_code:clean(b.assignedAgentCode,80)||null,
        estimated_monthly_value_cents:Math.max(0,Number(b.estimatedMonthlyValueCents)||0),
        next_action:clean(b.nextAction,500)||null,notes:clean(b.notes,3000)||null
      }}));
      return res.status(200).json({ok:true,item:row});
    }
    if(action==='update_lead'){
      const id=clean(b.id,80);if(!id)return res.status(400).json({error:'Lead id required.'});
      const patch={updated_at:new Date().toISOString()};
      if(['new','qualified','contacted','meeting','proposal','negotiation','won','lost'].includes(b.stage))patch.stage=b.stage;
      if(typeof b.nextAction==='string')patch.next_action=clean(b.nextAction,500)||null;
      if(Number.isFinite(Number(b.estimatedMonthlyValueCents)))patch.estimated_monthly_value_cents=Math.max(0,Number(b.estimatedMonthlyValueCents));
      const row=one(await rest(token,`founder_crm_leads?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',body:patch}));
      return res.status(200).json({ok:true,item:row});
    }
    if(action==='create_campaign'){
      const name=clean(b.name,180),channel=clean(b.channel,100);
      if(!name||!channel)return res.status(400).json({error:'Campaign name and channel are required.'});
      const row=one(await rest(token,'founder_marketing_campaigns',{method:'POST',body:{
        name,channel,status:['draft','scheduled','active','paused','completed','cancelled'].includes(b.status)?b.status:'draft',
        audience:clean(b.audience,160)||null,objective:clean(b.objective,1000)||null,
        budget_cents:Math.max(0,Number(b.budgetCents)||0)
      }}));
      return res.status(200).json({ok:true,item:row});
    }
    if(action==='create_cost'){
      const category=clean(b.category,100),amount=Math.max(0,Number(b.amountCents)||0);
      if(!category||!Number.isFinite(amount))return res.status(400).json({error:'Cost category and amount are required.'});
      const row=one(await rest(token,'founder_cost_entries',{method:'POST',body:{
        vendor:clean(b.vendor,160)||null,category,description:clean(b.description,1000)||null,
        amount_cents:Math.round(amount),cadence:['monthly','annual','one_time','usage'].includes(b.cadence)?b.cadence:'monthly',
        status:['active','inactive','planned'].includes(b.status)?b.status:'active',
        incurred_on:clean(b.incurredOn,20)||null,source:'manual'
      }}));
      return res.status(200).json({ok:true,item:row});
    }
    if(action==='create_risk'){
      const title=clean(b.title,180),category=clean(b.category,100);
      if(!title||!category)return res.status(400).json({error:'Risk title and category are required.'});
      const row=one(await rest(token,'founder_risk_register',{method:'POST',body:{
        category,title,description:clean(b.description,2500)||null,
        severity:['low','medium','high','critical'].includes(b.severity)?b.severity:'medium',
        likelihood:['unlikely','possible','likely'].includes(b.likelihood)?b.likelihood:'possible',
        status:'open',owner_agent_code:clean(b.ownerAgentCode,80)||null,
        mitigation:clean(b.mitigation,2500)||null
      }}));
      return res.status(200).json({ok:true,item:row});
    }
    if(action==='update_risk'){
      const id=clean(b.id,80);if(!id)return res.status(400).json({error:'Risk id required.'});
      const patch={updated_at:new Date().toISOString()};
      if(['open','mitigating','accepted','resolved','closed'].includes(b.status))patch.status=b.status;
      if(typeof b.mitigation==='string')patch.mitigation=clean(b.mitigation,2500)||null;
      const row=one(await rest(token,`founder_risk_register?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',body:patch}));
      return res.status(200).json({ok:true,item:row});
    }
    if(action==='create_people_role'){
      const title=clean(b.title,180),department=clean(b.department,120);
      if(!title||!department)return res.status(400).json({error:'Role title and department are required.'});
      const row=one(await rest(token,'founder_people_roles',{method:'POST',body:{
        title,department,role_type:['founder','human','ai','future_hire','contractor'].includes(b.roleType)?b.roleType:'future_hire',
        status:['active','planned','hiring','filled','paused','closed'].includes(b.status)?b.status:'planned',
        reports_to:clean(b.reportsTo,160)||null,mission:clean(b.mission,2000)||null,
        responsibilities:Array.isArray(b.responsibilities)?b.responsibilities.slice(0,30):[],
        scorecard:Array.isArray(b.scorecard)?b.scorecard.slice(0,30):[],
        priority:['low','normal','high','urgent'].includes(b.priority)?b.priority:'normal'
      }}));
      return res.status(200).json({ok:true,item:row});
    }
    if(action==='create_sop'){
      const title=clean(b.title,180),department=clean(b.department,120);
      if(!title||!department)return res.status(400).json({error:'SOP title and department are required.'});
      const row=one(await rest(token,'founder_sops',{method:'POST',body:{
        title,department,status:'review',purpose:clean(b.purpose,2000)||null,
        procedure:clean(b.procedure,12000)||null,owner_agent_code:clean(b.ownerAgentCode,80)||null
      }}));
      return res.status(200).json({ok:true,item:row});
    }
    if(action==='review_sop'){
      const id=clean(b.id,80),decision=clean(b.decision,20);
      if(!id||!['approved','active','retired','review'].includes(decision))return res.status(400).json({error:'Valid SOP decision required.'});
      const auth=await founderAuth(req);
      const patch={status:decision,updated_at:new Date().toISOString()};
      if(['approved','active'].includes(decision)){patch.approved_by=auth.user.id;patch.approved_at=new Date().toISOString()}
      const row=one(await rest(token,`founder_sops?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',body:patch}));
      return res.status(200).json({ok:true,item:row});
    }
    return res.status(400).json({error:'Unsupported Founder OS action'});
  }catch(e){
    return res.status(e.status||500).json({error:e.message||'Founder OS request failed'});
  }
};
