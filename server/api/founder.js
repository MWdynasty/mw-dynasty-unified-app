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
      let data;
      if(section==='programs') data=await rpc(token,'mw_founder_program_control',{});
      else if(section==='finance') data=await rpc(token,'mw_founder_finance_snapshot',{});
      else if(section==='customer_health') data=await rpc(token,'mw_founder_customer_health',{});
      else if(section==='support_triage') data=await rpc(token,'mw_founder_support_triage_snapshot',{});
      else if(section==='notifications') data=await rpc(token,'mw_founder_notifications_snapshot',{});
      else if(section==='objectives') data=await rpc(token,'mw_founder_ai_objectives_snapshot',{});
      else if(section==='partnerships') data=await rpc(token,'mw_founder_partnerships_snapshot',{});
      else if(section==='security_review') data=await rpc(token,'mw_founder_security_snapshot',{});
      else if(section==='launch'){
        const [site,app]=await Promise.all([checkUrl('https://mwdynasty.com/'),checkUrl('https://app.mwdynasty.com/')]);
        const ok=!!site.ok&&!!app.ok;
        await rest(token,'founder_launch_gates?gate_code=eq.website_live',{method:'PATCH',body:{
          status:ok?'verified':'blocked',
          evidence:ok?`Both public domains responded successfully. Website ${site.status} / App ${app.status}.`:`Website health: ${site.status||site.error||'unavailable'}; App health: ${app.status||app.error||'unavailable'}.`,
          verified_at:ok?new Date().toISOString():null,
          updated_at:new Date().toISOString()
        }});
        data=await rpc(token,'mw_founder_launch_readiness',{});
        data={...data,health:{website:site,app}};
      }else if(section==='kpi_history'){
        await rpc(token,'mw_founder_capture_kpi_snapshot',{});
        data=await rpc(token,'mw_founder_kpi_history',{p_days:90});
      }else if(managementSections.has(section)) data=await rpc(token,'mw_founder_management_snapshot',{p_section:section});
      else data=await rpc(token,'mw_founder_os_snapshot',{p_section:section});
      if(section==='website'){
        const [site,app]=await Promise.all([checkUrl('https://mwdynasty.com/'),checkUrl('https://app.mwdynasty.com/')]);
        return res.status(200).json({ok:true,data:{...data,health:{website:site,app}}});
      }
      if(section==='ai_company'){
        const [runs,playbooks]=await Promise.all([
          rest(token,'founder_ai_runs?select=id,task_id,agent_code,run_type,status,model,output_summary,metadata,created_at&order=created_at.desc&limit=50'),
          rpc(token,'mw_founder_ai_playbooks_snapshot',{})
        ]);
        return res.status(200).json({ok:true,data:{
          ...data,
          agents:Array.isArray(playbooks?.agents)?playbooks.agents:(data.agents||[]),
          recent_runs:runs,
          department_briefs:Array.isArray(playbooks?.department_briefs)?playbooks.department_briefs:[]
        }});
      }
      return res.status(200).json({ok:true,data});
    }
    if(req.method!=='POST')return res.status(405).json({error:'GET or POST only'});
    const b=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const action=clean(b.action,60);
    if(action==='update_objective'){
      const id=clean(b.id,80);if(!id)return res.status(400).json({error:'Objective id required.'});
      const patch={updated_at:new Date().toISOString()};
      if(['draft','active','paused','completed','cancelled'].includes(b.status))patch.status=b.status;
      if(['low','normal','high','urgent'].includes(b.priority))patch.priority=b.priority;
      if(typeof b.title==='string')patch.title=clean(b.title,180)||'MW Dynasty objective';
      if(typeof b.description==='string')patch.description=clean(b.description,4000)||null;
      if(typeof b.successDefinition==='string')patch.success_definition=clean(b.successDefinition,3000)||null;
      if(typeof b.ownerAgentCode==='string')patch.owner_agent_code=clean(b.ownerAgentCode,80)||null;
      if(typeof b.targetDate==='string')patch.target_date=clean(b.targetDate,20)||null;
      if(patch.status==='completed')patch.completed_at=new Date().toISOString();
      if(['active','draft','paused'].includes(patch.status||''))patch.completed_at=null;
      const row=one(await rest(token,`founder_ai_objectives?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',body:patch}));
      return res.status(200).json({ok:true,item:row});
    }
    if(action==='create_ai_task'){
      const agent=clean(b.agentCode,80),title=clean(b.title,160),description=clean(b.description,2000);
      if(!agent||!title)return res.status(400).json({error:'AI agent and task title are required.'});
      const valid=one(await rest(token,`founder_ai_agents?code=eq.${encodeURIComponent(agent)}&status=eq.active&select=code,department&limit=1`));
      if(!valid)return res.status(400).json({error:'Unknown active AI employee.'});
      const row=one(await rest(token,'founder_ai_tasks',{method:'POST',body:{
        agent_code:agent,title,description:description||null,department:valid.department,
        priority:['low','normal','high','urgent'].includes(b.priority)?b.priority:'normal',
        source:'founder',requires_approval:!!b.requiresApproval,
        approval_status:b.requiresApproval?'pending':null,status:b.requiresApproval?'waiting_approval':'queued',
        objective_id:clean(b.objectiveId,80)||null,
        sequence_no:Number.isFinite(Number(b.sequenceNo))?Math.max(1,Math.round(Number(b.sequenceNo))):null
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
      const auth=await founderAuth(req);
      const existing=one(await rest(token,`founder_approvals?id=eq.${encodeURIComponent(id)}&select=id,task_id,status&limit=1`));
      if(!existing)return res.status(404).json({error:'Founder approval request not found.'});
      const row=one(await rest(token,`founder_approvals?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',body:{
        status:decision,reviewed_by:auth.user.id,review_note:clean(b.note,2000)||null,reviewed_at:new Date().toISOString()
      }}));
      if(existing.task_id){
        await rest(token,`founder_ai_tasks?id=eq.${encodeURIComponent(existing.task_id)}`,{method:'PATCH',body:{
          approval_status:decision,
          status:decision==='approved'?'queued':'cancelled',
          updated_at:new Date().toISOString()
        }});
      }
      return res.status(200).json({ok:true,item:row,linkedTaskId:existing.task_id||null});
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
    if(action==='create_partnership'){
      const organization=clean(b.organizationName,220);
      if(!organization)return res.status(400).json({error:'Organization name is required.'});
      const row=one(await rest(token,'founder_partnership_opportunities',{method:'POST',body:{
        organization_name:organization,
        opportunity_type:['school','district','club','team','brand','partner','other'].includes(b.opportunityType)?b.opportunityType:'school',
        stage:['research','qualified','discovery','pilot','proposal','legal','won','lost'].includes(b.stage)?b.stage:'research',
        contact_name:clean(b.contactName,180)||null,
        contact_email:clean(b.contactEmail,240)||null,
        estimated_coaches:Math.max(0,Math.round(Number(b.estimatedCoaches)||0)),
        estimated_athletes:Math.max(0,Math.round(Number(b.estimatedAthletes)||0)),
        estimated_monthly_value_cents:Math.max(0,Math.round(Number(b.estimatedMonthlyValueCents)||0)),
        assigned_agent_code:clean(b.assignedAgentCode,80)||'partnerships',
        next_action:clean(b.nextAction,1000)||null,
        notes:clean(b.notes,4000)||null
      }}));
      return res.status(200).json({ok:true,item:row});
    }
    if(action==='update_partnership'){
      const id=clean(b.id,80);if(!id)return res.status(400).json({error:'Partnership opportunity id required.'});
      const patch={updated_at:new Date().toISOString()};
      if(['research','qualified','discovery','pilot','proposal','legal','won','lost'].includes(b.stage))patch.stage=b.stage;
      if(typeof b.nextAction==='string')patch.next_action=clean(b.nextAction,1000)||null;
      if(typeof b.notes==='string')patch.notes=clean(b.notes,4000)||null;
      if(Number.isFinite(Number(b.estimatedCoaches)))patch.estimated_coaches=Math.max(0,Math.round(Number(b.estimatedCoaches)));
      if(Number.isFinite(Number(b.estimatedAthletes)))patch.estimated_athletes=Math.max(0,Math.round(Number(b.estimatedAthletes)));
      if(Number.isFinite(Number(b.estimatedMonthlyValueCents)))patch.estimated_monthly_value_cents=Math.max(0,Math.round(Number(b.estimatedMonthlyValueCents)));
      const row=one(await rest(token,`founder_partnership_opportunities?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',body:patch}));
      return res.status(200).json({ok:true,item:row});
    }
    if(action==='review_partnership_proposal'){
      const id=clean(b.id,80),decision=clean(b.decision,20);
      if(!id||!['approved','rejected','retired','review'].includes(decision))return res.status(400).json({error:'Valid proposal decision required.'});
      const auth=await founderAuth(req);
      const patch={status:decision,updated_at:new Date().toISOString()};
      if(decision==='approved'){patch.approved_by=auth.user.id;patch.approved_at=new Date().toISOString()}
      const row=one(await rest(token,`founder_partnership_proposals?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',body:patch}));
      return res.status(200).json({ok:true,item:row});
    }
    if(action==='record_partnership_proposal_sent'){
      const id=clean(b.id,80);if(!id)return res.status(400).json({error:'Proposal id required.'});
      const current=one(await rest(token,`founder_partnership_proposals?id=eq.${encodeURIComponent(id)}&select=id,status&limit=1`));
      if(!current||current.status!=='approved')return res.status(409).json({error:'Proposal must be Founder-approved before it can be recorded as sent.'});
      const row=one(await rest(token,`founder_partnership_proposals?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',body:{status:'sent',sent_at:new Date().toISOString(),updated_at:new Date().toISOString()}}));
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
    if(action==='update_campaign'){
      const id=clean(b.id,80);if(!id)return res.status(400).json({error:'Campaign id required.'});
      const patch={updated_at:new Date().toISOString()};
      if(['draft','scheduled','active','paused','completed','cancelled'].includes(b.status))patch.status=b.status;
      if(typeof b.audience==='string')patch.audience=clean(b.audience,160)||null;
      if(typeof b.objective==='string')patch.objective=clean(b.objective,1000)||null;
      if(Number.isFinite(Number(b.budgetCents)))patch.budget_cents=Math.max(0,Math.round(Number(b.budgetCents)));
      if(Number.isFinite(Number(b.spendCents)))patch.spend_cents=Math.max(0,Math.round(Number(b.spendCents)));
      if(Number.isFinite(Number(b.leads)))patch.leads=Math.max(0,Math.round(Number(b.leads)));
      if(Number.isFinite(Number(b.conversions)))patch.conversions=Math.max(0,Math.round(Number(b.conversions)));
      const row=one(await rest(token,`founder_marketing_campaigns?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',body:patch}));
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
    if(action==='update_cost'){
      const id=clean(b.id,80);if(!id)return res.status(400).json({error:'Cost id required.'});
      const patch={updated_at:new Date().toISOString()};
      if(typeof b.vendor==='string')patch.vendor=clean(b.vendor,160)||null;
      if(typeof b.category==='string')patch.category=clean(b.category,100)||'other';
      if(typeof b.description==='string')patch.description=clean(b.description,1000)||null;
      if(Number.isFinite(Number(b.amountCents)))patch.amount_cents=Math.max(0,Math.round(Number(b.amountCents)));
      if(['monthly','annual','one_time','usage'].includes(b.cadence))patch.cadence=b.cadence;
      if(['active','inactive','planned'].includes(b.status))patch.status=b.status;
      if(typeof b.incurredOn==='string')patch.incurred_on=clean(b.incurredOn,20)||null;
      const row=one(await rest(token,`founder_cost_entries?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',body:patch}));
      return res.status(200).json({ok:true,item:row});
    }
    if(action==='update_support_triage'){
      const id=clean(b.id,80);if(!id)return res.status(400).json({error:'Support triage id required.'});
      const patch={updated_at:new Date().toISOString()};
      if(['low','normal','high','urgent'].includes(b.priority))patch.priority=b.priority;
      if(['new','reviewed','draft_ready','waiting_founder','resolved'].includes(b.triageStatus))patch.triage_status=b.triageStatus;
      if(typeof b.issueSummary==='string')patch.issue_summary=clean(b.issueSummary,2000)||null;
      if(typeof b.suggestedNextAction==='string')patch.suggested_next_action=clean(b.suggestedNextAction,2000)||null;
      if(typeof b.responseDraft==='string')patch.response_draft=clean(b.responseDraft,5000)||null;
      if(typeof b.requiresFounder==='boolean')patch.requires_founder=b.requiresFounder;
      if(typeof b.ownerAgentCode==='string')patch.owner_agent_code=clean(b.ownerAgentCode,80)||null;
      const row=one(await rest(token,`founder_support_triage?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',body:patch}));
      return res.status(200).json({ok:true,item:row});
    }
    if(action==='update_notification'){
      const id=clean(b.id,80),status=clean(b.status,20);
      if(!id||!['unread','read','dismissed'].includes(status))return res.status(400).json({error:'Valid notification and status required.'});
      const row=one(await rest(token,`founder_notifications?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',body:{
        status,read_at:status==='read'?new Date().toISOString():null,updated_at:new Date().toISOString()
      }}));
      return res.status(200).json({ok:true,item:row});
    }
    if(action==='mark_all_notifications_read'){
      const rows=await rest(token,'founder_notifications?status=eq.unread',{method:'PATCH',body:{
        status:'read',read_at:new Date().toISOString(),updated_at:new Date().toISOString()
      }});
      return res.status(200).json({ok:true,updated:Array.isArray(rows)?rows.length:0});
    }
    if(action==='update_launch_gate'){
      const gateCode=clean(b.gateCode,100);
      const status=clean(b.status,30);
      const evidence=clean(b.evidence,3000);
      if(!gateCode||!['pending','verified','blocked','not_applicable'].includes(status))return res.status(400).json({error:'Valid launch gate and status required.'});
      const gate=one(await rest(token,`founder_launch_gates?gate_code=eq.${encodeURIComponent(gateCode)}&select=*&limit=1`));
      if(!gate)return res.status(404).json({error:'Launch gate not found.'});
      if(gate.verification_source==='automated')return res.status(400).json({error:'Automated launch gates cannot be manually overridden.'});
      if(status==='verified'&&!evidence)return res.status(400).json({error:'Verification evidence is required before a launch gate can be marked verified.'});
      if(gateCode==='founder_go_live'&&status==='verified'){
        const readiness=await rpc(token,'mw_founder_launch_readiness',{});
        if(!readiness.ready_for_founder_go_live)return res.status(409).json({error:'All other required launch gates must be verified before Founder go-live approval.'});
      }
      const auth=await founderAuth(req);
      const row=one(await rest(token,`founder_launch_gates?gate_code=eq.${encodeURIComponent(gateCode)}`,{method:'PATCH',body:{
        status,
        evidence:evidence||gate.evidence||null,
        verified_by:status==='verified'?auth.user.id:null,
        verified_at:status==='verified'?new Date().toISOString():null,
        updated_at:new Date().toISOString()
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
