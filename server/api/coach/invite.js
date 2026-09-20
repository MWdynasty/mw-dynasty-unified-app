const crypto=require('crypto');
const {getAccountContext,SUPABASE_URL,SUPABASE_KEY}=require('../../lib/mw-coach-auth');

async function rest(path,token,{method='GET',body=null,prefer='return=representation'}={}){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{
    method,
    headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json',Prefer:prefer},
    body:body?JSON.stringify(body):undefined
  });
  const d=await r.json().catch(()=>null);
  if(!r.ok)throw Object.assign(new Error(d?.message||d?.hint||`Invitation request failed (${r.status})`),{status:r.status});
  return d;
}

async function syncSponsorSeat(invitationId,billingType,token){
  const rpc=billingType==='coach_sponsored'?'mw_coach_assign_sponsor_seat':'mw_coach_release_sponsor_seat';
  return await rest(`rpc/${rpc}`,token,{method:'POST',body:{p_invitation_id:invitationId}});
}

async function sendInviteEmail(email,inviteUrl,meta={}){
  const r=await fetch(`${SUPABASE_URL}/auth/v1/otp?redirect_to=${encodeURIComponent(inviteUrl)}`,{
    method:'POST',
    headers:{apikey:SUPABASE_KEY,'Content-Type':'application/json'},
    body:JSON.stringify({
      email,
      create_user:true,
      data:{
        mw_account_type:'athlete',
        mw_invite_token:meta.inviteToken||null,
        mw_invite_billing_type:meta.billingType||'self_pay',
        mw_invite_type:meta.inviteType||'coach_invite'
      }
    })
  });
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(d?.msg||d?.error_description||d?.message||`Invite email could not be sent (${r.status})`);
  return true;
}

module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'POST only'});
  try{
    const c=await getAccountContext(req);
    const role=String(c.profile.role||'');
    if(!['coach','admin','founder_owner'].includes(role))return res.status(403).json({error:'Coach access required'});
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const email=String(body.email||'').trim().toLowerCase();
    const inviteType=['coach_invite','team_invite'].includes(body.inviteType)?body.inviteType:'coach_invite';
    const billingType=body.billingType==='coach_sponsored'?'coach_sponsored':'self_pay';
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return res.status(400).json({error:'Enter a valid athlete email.'});

    const existing=await rest(`coach_invitations?select=id,athlete_email,status,invite_token,expires_at,billing_type,sponsorship_ends_at&coach_user_id=eq.${encodeURIComponent(c.user.id)}&athlete_email=eq.${encodeURIComponent(email)}&status=eq.pending&order=created_at.desc&limit=1`,c.token);
    if(Array.isArray(existing)&&existing[0]){
      const found=existing[0];
      if(found.billing_type!==billingType){
        const updated=await rest(`coach_invitations?id=eq.${encodeURIComponent(found.id)}`,c.token,{method:'PATCH',body:{expires_at:new Date(Date.now()+7*86400000).toISOString()},prefer:'return=representation'});
        let inv=Array.isArray(updated)?updated[0]:updated;
        await syncSponsorSeat(inv.id,billingType,c.token);
        const refreshed=await rest(`coach_invitations?select=id,athlete_email,status,invite_token,expires_at,billing_type,sponsor_access_tier,sponsor_price_cents,sponsorship_ends_at&id=eq.${encodeURIComponent(inv.id)}&limit=1`,c.token);
        inv=Array.isArray(refreshed)?refreshed[0]:inv;
        const proto=String(req.headers['x-forwarded-proto']||'https').split(',')[0].trim();
        const host=String(req.headers.host||'');
        const inviteUrl=host?`${proto}://${host}/athlete/?invite=${encodeURIComponent(inv.invite_token)}`:null;
        let emailSent=false,emailError=null;
        if(inviteUrl){try{await sendInviteEmail(email,inviteUrl,{inviteToken:inv.invite_token,billingType,inviteType});emailSent=true}catch(e){emailError=e.message}}
        return res.status(200).json({ok:true,reused:true,updatedBilling:true,invitation:inv,inviteUrl,emailSent,emailError});
      }
      const proto=String(req.headers['x-forwarded-proto']||'https').split(',')[0].trim();
      const host=String(req.headers.host||'');
      const inviteUrl=host?`${proto}://${host}/athlete/?invite=${encodeURIComponent(found.invite_token)}`:null;
      let emailSent=false,emailError=null;
      if(inviteUrl){try{await sendInviteEmail(email,inviteUrl,{inviteToken:found.invite_token,billingType,inviteType});emailSent=true}catch(e){emailError=e.message}}
      return res.status(200).json({ok:true,reused:true,invitation:found,inviteUrl,emailSent,emailError});
    }

    const inviteToken=crypto.randomUUID();
    const expiresAt=new Date(Date.now()+7*86400000).toISOString();
    const row={coach_user_id:c.user.id,athlete_email:email,invite_type:inviteType,team_id:null,status:'pending',invite_token:inviteToken,expires_at:expiresAt,accepted_at:null,accepted_by:null,billing_type:'self_pay'};
    const created=await rest('coach_invitations',c.token,{method:'POST',body:row});
    let inv=Array.isArray(created)?created[0]:created;
    if(billingType==='coach_sponsored'){
      try{
        await syncSponsorSeat(inv.id,billingType,c.token);
        const refreshed=await rest(`coach_invitations?select=id,athlete_email,status,invite_token,expires_at,billing_type,sponsor_access_tier,sponsor_price_cents,sponsorship_ends_at&id=eq.${encodeURIComponent(inv.id)}&limit=1`,c.token);
        inv=Array.isArray(refreshed)?refreshed[0]:inv;
      }catch(seatError){
        try{await rest(`coach_invitations?id=eq.${encodeURIComponent(inv.id)}`,c.token,{method:'DELETE',prefer:'return=minimal'})}catch{}
        throw seatError;
      }
    }
    const proto=String(req.headers['x-forwarded-proto']||'https').split(',')[0].trim();
    const host=String(req.headers.host||'');
    const inviteUrl=host?`${proto}://${host}/athlete/?invite=${encodeURIComponent(inv.invite_token)}`:null;
    let emailSent=false,emailError=null;
    if(inviteUrl){try{await sendInviteEmail(email,inviteUrl,{inviteToken:inv.invite_token,billingType,inviteType});emailSent=true}catch(e){emailError=e.message}}
    return res.status(201).json({ok:true,invitation:inv,inviteUrl,emailSent,emailError});
  }catch(e){return res.status(e.status||500).json({error:e.message||'Invitation could not be created.'})}
};
