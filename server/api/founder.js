const {SUPABASE_URL,SUPABASE_KEY}=require('../lib/mw-auth');
const {founderAuth}=require('../lib/founder-auth');

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
      else if(section==='finance'){
        const [snapshot,stripeResult]=await Promise.all([
          rpc(token,'mw_founder_finance_snapshot',{}),
          fetch(`${SUPABASE_URL}/functions/v1/mw-founder-stripe-cfo`,{headers:{Authorization:`Bearer ${token}`}}).then(async r=>({ok:r.ok,status:r.status,data:await r.json().catch(()=>null)})).catch(()=>({ok:false,status:0,data:null}))
        ]);
        data={...snapshot,stripe:stripeResult.ok?stripeResult.data:{ok:false,connected:false,error:stripeResult.data?.error||'Stripe CFO connection unavailable',status:stripeResult.status}};
      }
      else if(section==='customer_health') data=await rpc(token,'mw_founder_customer_health',{});
      else if(section==='support_triage') data=await rpc(token,'mw_founder_support_triage_snapshot',{});
      else if(section==='notifications') data=await rpc(token,'mw_founder_notifications_snapshot',{});
      else if(section==='objectives') data=await rpc(token,'mw_founder_ai_objectives_snapshot',{});
      else if(section==='partnerships') data=await rpc(token,'mw_founder_partnerships_snapshot',{});
      else if(section==='skool'){
        const posts=await rest(token,'founder_skool_posts?select=id,scheduled_for,title,body,category,post_type,audience,objective,cta,asset_brief,status,source,ai_agent_code,approved_at,posted_at,generation_metadata,created_at,updated_at&order=scheduled_for.asc,created_at.asc&limit=200');
        data={
          posts:Array.isArray(posts)?posts:[],
          summary:{
            draft:(posts||[]).filter(x=>x.status==='draft').length,
            approved:(posts||[]).filter(x=>x.status==='approved').length,
            posted:(posts||[]).filter(x=>x.status==='posted').length,
            upcoming:(posts||[]).filter(x=>['draft','approved'].includes(x.status)&&String(x.scheduled_for||'')>=new Date().toISOString().slice(0,10)).length
          }
        };
      }
      else if(section==='security_review'){
        const [posture,controls]=await Promise.all([
          rpc(token,'mw_founder_security_snapshot',{}),
          rpc(token,'mw_founder_security_controls_snapshot',{})
        ]);
        data={...(posture||{}),controls_framework:controls||{}};
      }
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
      else if(section==='headquarters') data={};
      else data=await rpc(token,'mw_founder_os_snapshot',{p_section:section});
      if(section==='headquarters'){
        const [projects,members,events,presentations,authorizations,rules,agents]=await Promise.all([
          rest(token,'founder_ai_collaboration_projects?select=*&order=updated_at.desc&limit=100'),
          rest(token,'founder_ai_project_members?select=*&order=joined_at.asc&limit=500'),
          rest(token,'founder_ai_work_events?select=*&order=created_at.desc&limit=500'),
          rest(token,'founder_ai_presentations?select=*&order=updated_at.desc&limit=200'),
          rest(token,'founder_ai_authorizations?select=*&order=created_at.desc&limit=200'),
          rest(token,'founder_ai_authority_rules?select=*&active=eq.true&order=code.asc'),
          rest(token,'founder_ai_agents?select=code,name,title,department,manager_code,org_level,authority_level,status,oversight_mode&status=eq.active&order=sort_order.asc')
        ]);
        return res.status(200).json({ok:true,data:{projects,members,events,presentations,authorizations,rules,agents}});
      }
      if(section==='website'){
        const [site,app,projects]=await Promise.all([
          checkUrl('https://mwdynasty.com/'),
          checkUrl('https://app.mwdynasty.com/'),
          rest(token,'founder_website_projects?select=id,title,request_text,target_scope,source_system,source_reference,status,proposal_summary,proposed_changes,acceptance_criteria,design_notes,build_notes,preview_url,preview_commit_sha,production_commit_sha,production_url,requires_founder_publish_approval,approved_build_at,approved_publish_at,published_at,last_error,created_at,updated_at&order=updated_at.desc&limit=50')
        ]);
        return res.status(200).json({ok:true,data:{...data,health:{website:site,app},website_projects:projects}});
      }
      if(section==='ai_company'){
        const queue=await rpc(token,'mw_founder_ai_operating_queue_snapshot',{});
        const [refreshed,runs,playbooks]=await Promise.all([
          rpc(token,'mw_founder_os_snapshot',{p_section:'ai_company'}),
          rest(token,'founder_ai_runs?select=id,task_id,agent_code,run_type,status,model,output_summary,metadata,created_at&order=created_at.desc&limit=50'),
          rpc(token,'mw_founder_ai_playbooks_snapshot',{})
        ]);
        return res.status(200).json({ok:true,data:{
          ...refreshed,
          agents:Array.isArray(playbooks?.agents)?playbooks.agents:(refreshed.agents||[]),
          recent_runs:runs,
          department_briefs:Array.isArray(playbooks?.department_briefs)?playbooks.department_briefs:[],
          operating_queue:queue
        }});
      }
      return res.status(200).json({ok:true,data});
    }
    if(req.method!=='POST')return res.status(405).json({error:'GET or POST only'});
    const b=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const action=clean(b.action,60);
    if(action==='verify_hq_runtime'){
      const projectId=clean(b.projectId,80);
      if(!projectId)return res.status(400).json({error:'Project id required.'});
      const project=one(await rest(token,`founder_ai_collaboration_projects?id=eq.${encodeURIComponent(projectId)}&select=id,title,status&limit=1`));
      if(!project)return res.status(404).json({error:'Headquarters project not found.'});
      const nonce='runtime-'+Date.now().toString(36);
      const written=one(await rest(token,'founder_ai_work_events',{method:'POST',body:{
        project_id:projectId,agent_code:'qa_automation',event_type:'test',
        summary:'Authenticated Founder OS runtime persistence probe.',
        evidence:{qa_probe:true,nonce,phase:'authenticated_write',production_action:false}
      }}));
      if(!written?.id)return res.status(500).json({error:'Authenticated runtime write did not return an event id.'});
      const readBack=one(await rest(token,`founder_ai_work_events?id=eq.${encodeURIComponent(written.id)}&project_id=eq.${encodeURIComponent(projectId)}&select=id,project_id,agent_code,event_type,summary,evidence,created_at&limit=1`));
      const persisted=!!readBack&&readBack.project_id===projectId&&readBack.agent_code==='qa_automation'&&readBack.event_type==='test'&&readBack?.evidence?.nonce===nonce;
      if(!persisted)return res.status(500).json({error:'Authenticated runtime read-back did not match the written QA event.'});
      const verified=one(await rest(token,'founder_ai_work_events',{method:'POST',body:{
        project_id:projectId,agent_code:'release_qa',event_type:'verification',
        summary:'Authenticated runtime persistence verified through Founder OS: harmless QA event write succeeded and an independent authenticated read-back returned matching persisted fields.',
        evidence:{qa_probe:true,source_event_id:written.id,nonce,authenticated_write:true,authenticated_read_back:true,field_match:true,boardroom_ui_evidence:'Founder must confirm rendered result in the live preview UI',production_action:false}
      }}));
      await rest(token,`founder_ai_collaboration_projects?id=eq.${encodeURIComponent(projectId)}`,{method:'PATCH',body:{status:'active',updated_at:new Date().toISOString()}});
      return res.status(200).json({ok:true,item:{project_id:projectId,write_event_id:written.id,verification_event_id:verified?.id||null,persisted:true}});
    }
    if(action==='create_hq_project'){
      const title=clean(b.title,180),lead=clean(b.leadAgentCode,80);
      if(!title||!lead)return res.status(400).json({error:'Project title and lead AI employee are required.'});
      const valid=one(await rest(token,`founder_ai_agents?code=eq.${encodeURIComponent(lead)}&status=eq.active&select=code,department&limit=1`));
      if(!valid)return res.status(400).json({error:'Unknown active AI employee.'});
      const authority=['autonomous','controlled','founder_required','specialist_required'].includes(b.authorityClass)?b.authorityClass:'controlled';
      const row=one(await rest(token,'founder_ai_collaboration_projects',{method:'POST',body:{
        title,department:valid.department,lead_agent_code:lead,status:'active',authority_class:authority,
        problem_statement:clean(b.problemStatement,4000)||null,proposed_outcome:clean(b.proposedOutcome,4000)||null,
        founder_decision_needed:clean(b.founderDecisionNeeded,2000)||null,created_by_agent_code:lead
      }}));
      await rest(token,'founder_ai_project_members',{method:'POST',body:{project_id:row.id,agent_code:lead,responsibility:'Project lead'}});
      return res.status(200).json({ok:true,item:row});
    }
    if(action==='update_hq_presentation'){
      const id=clean(b.id,80);if(!id)return res.status(400).json({error:'Presentation id required.'});
      const allowed=['founder_reviewing','approved','changes_requested','rejected'];
      if(!allowed.includes(b.status))return res.status(400).json({error:'Valid Founder presentation decision required.'});
      const auth=await founderAuth(req);
      const patch={status:b.status,updated_at:new Date().toISOString()};
      if(['approved','changes_requested','rejected'].includes(b.status))patch.decided_at=new Date().toISOString();
      const row=one(await rest(token,`founder_ai_presentations?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',body:patch}));
      if(b.status==='changes_requested'&&row?.project_id){
        const revision=clean(b.revisionRequest,4000);
        if(!revision)return res.status(400).json({error:'Tell the team what changes you want before sending the presentation back.'});
        await rest(token,`founder_ai_collaboration_projects?id=eq.${encodeURIComponent(row.project_id)}`,{method:'PATCH',body:{status:'active',founder_decision_needed:revision,updated_at:new Date().toISOString()}});
        await rest(token,'founder_ai_work_events',{method:'POST',body:{project_id:row.project_id,agent_code:row.presenting_agent_code||null,event_type:'founder_decision',summary:'Founder requested changes: '+revision,evidence:{presentation_id:row.id,revision_request:revision,returned_to_team:true}}});
      }
      if(b.status==='rejected'&&row?.project_id){
        await rest(token,`founder_ai_collaboration_projects?id=eq.${encodeURIComponent(row.project_id)}`,{method:'PATCH',body:{status:'blocked',founder_decision_needed:null,updated_at:new Date().toISOString()}});
      }
      if(b.status==='approved'&&row?.project_id){
        const project=one(await rest(token,`founder_ai_collaboration_projects?id=eq.${encodeURIComponent(row.project_id)}&select=id,status,authority_class,execution_scope,founder_decision_needed&limit=1`));
        await rest(token,`founder_ai_collaboration_projects?id=eq.${encodeURIComponent(row.project_id)}`,{method:'PATCH',body:{status:project?.status||'active',founder_decision_needed:null,updated_at:new Date().toISOString()}});
        await rest(token,'founder_ai_authorizations',{method:'POST',body:{
          project_id:row.project_id,
          presentation_id:row.id,
          authorization_type:'approved_execution',
          scope:{
            source:'founder_presentation',
            presentation_title:row.title,
            decision_requested:row.decision_requested||null,
            project_authority_class:project?.authority_class||null,
            project_execution_scope:project?.execution_scope||{},
            no_implied_authority:['production_publish','spending','pricing_changes','refunds','contracts','external_communications','brand_direction','official_methodology','destructive_security_or_data_changes']
          },
          status:'active',
          approved_by:auth.user.id
        }});
      }
      return res.status(200).json({ok:true,item:row});
    }
    if(action==='create_skool_post'){
      const scheduledFor=clean(b.scheduledFor,20),title=clean(b.title,180),body=clean(b.body,12000);
      if(!scheduledFor||!/^\d{4}-\d{2}-\d{2}$/.test(scheduledFor))return res.status(400).json({error:'Valid Skool schedule date required.'});
      if(!title||!body)return res.status(400).json({error:'Skool post title and body are required.'});
      const row=one(await rest(token,'founder_skool_posts',{method:'POST',body:{
        scheduled_for:scheduledFor,
        title,
        body,
        category:clean(b.category,120)||'Community',
        post_type:['discussion','education','challenge','announcement','poll','spotlight','recap'].includes(b.postType)?b.postType:'discussion',
        audience:['athletes','coaches','parents','athletes_and_coaches','everyone'].includes(b.audience)?b.audience:'athletes_and_coaches',
        objective:clean(b.objective,1000)||null,
        cta:clean(b.cta,1000)||null,
        asset_brief:clean(b.assetBrief,2000)||null,
        source:'founder',
        ai_agent_code:null,
        status:'draft',
        generation_metadata:{created_from:'founder_os'}
      }}));
      return res.status(200).json({ok:true,item:row});
    }
    if(action==='update_skool_post'){
      const id=clean(b.id,80);if(!id)return res.status(400).json({error:'Skool post id required.'});
      const auth=await founderAuth(req);
      const patch={updated_at:new Date().toISOString()};
      if(typeof b.scheduledFor==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(b.scheduledFor))patch.scheduled_for=b.scheduledFor;
      if(typeof b.title==='string')patch.title=clean(b.title,180)||'MW Dynasty Community Post';
      if(typeof b.body==='string')patch.body=clean(b.body,12000);
      if(typeof b.category==='string')patch.category=clean(b.category,120)||'Community';
      if(['discussion','education','challenge','announcement','poll','spotlight','recap'].includes(b.postType))patch.post_type=b.postType;
      if(['athletes','coaches','parents','athletes_and_coaches','everyone'].includes(b.audience))patch.audience=b.audience;
      if(typeof b.objective==='string')patch.objective=clean(b.objective,1000)||null;
      if(typeof b.cta==='string')patch.cta=clean(b.cta,1000)||null;
      if(typeof b.assetBrief==='string')patch.asset_brief=clean(b.assetBrief,2000)||null;
      if(['draft','approved','posted','skipped'].includes(b.status)){
        patch.status=b.status;
        if(b.status==='approved'){patch.approved_by=auth.user.id;patch.approved_at=new Date().toISOString()}
        if(b.status==='posted')patch.posted_at=new Date().toISOString();
      }
      const row=one(await rest(token,`founder_skool_posts?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',body:patch}));
      return res.status(200).json({ok:true,item:row});
    }
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
    if(action==='review_website_project'){
      const id=clean(b.id,80),decision=clean(b.decision,40);
      if(!id||!['approve_build','approve_publish','cancel','retry_build'].includes(decision))return res.status(400).json({error:'Valid website project decision required.'});
      const auth=await founderAuth(req);
      const existing=one(await rest(token,`founder_website_projects?id=eq.${encodeURIComponent(id)}&select=id,status,preview_url,source_system&limit=1`));
      if(!existing)return res.status(404).json({error:'Website project not found.'});
      const patch={updated_at:new Date().toISOString()};
      if(decision==='approve_build'){
        if(!['proposal_ready','failed','blocked_external_editor'].includes(existing.status))return res.status(409).json({error:'This website project is not waiting for build approval.'});
        patch.status='approved_for_build';patch.approved_build_by=auth.user.id;patch.approved_build_at=new Date().toISOString();patch.last_error=null;
      }else if(decision==='retry_build'){
        if(!['failed','blocked_external_editor'].includes(existing.status))return res.status(409).json({error:'Only a blocked or failed website build can be retried.'});
        patch.status='approved_for_build';patch.approved_build_by=auth.user.id;patch.approved_build_at=new Date().toISOString();patch.last_error=null;
      }else if(decision==='approve_publish'){
        if(existing.status!=='preview_ready'||!existing.preview_url)return res.status(409).json({error:'A verified preview must be ready before production publish approval.'});
        patch.status='approved_for_publish';patch.approved_publish_by=auth.user.id;patch.approved_publish_at=new Date().toISOString();
      }else if(decision==='cancel'){
        if(existing.status==='published')return res.status(409).json({error:'A published website project cannot be cancelled.'});
        patch.status='cancelled';
      }
      const row=one(await rest(token,`founder_website_projects?id=eq.${encodeURIComponent(id)}`,{method:'PATCH',body:patch}));
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
    if(action==='promote_ai_task_to_sop'){
      const id=clean(b.id,80);if(!id)return res.status(400).json({error:'AI task id required.'});
      const task=one(await rest(token,`founder_ai_tasks?id=eq.${encodeURIComponent(id)}&select=id,title,description,department,agent_code,status,output_summary&limit=1`));
      if(!task)return res.status(404).json({error:'AI task not found.'});
      if(task.status!=='completed'||!clean(task.output_summary,12000)){
        return res.status(409).json({error:'AI work must be completed before it can become an SOP draft.'});
      }
      const existing=one(await rest(token,`founder_sops?source_ai_task_id=eq.${encodeURIComponent(id)}&select=*&limit=1`));
      if(existing)return res.status(200).json({ok:true,item:existing,alreadyPromoted:true});
      const row=one(await rest(token,'founder_sops',{method:'POST',body:{
        title:clean(b.title,180)||clean(task.title,180)||'AI operating procedure draft',
        department:clean(task.department,120)||'Operations',
        status:'review',
        purpose:clean(task.description,2000)||`Promoted from completed AI work by ${clean(task.agent_code,80)||'MW AI'}.`,
        procedure:clean(task.output_summary,12000),
        owner_agent_code:clean(task.agent_code,80)||null,
        source_ai_task_id:task.id
      }}));
      return res.status(200).json({ok:true,item:row,alreadyPromoted:false});
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
