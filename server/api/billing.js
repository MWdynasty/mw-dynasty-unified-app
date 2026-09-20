const {authenticate,SUPABASE_URL,SUPABASE_KEY}=require('../lib/mw-coach-auth');

const COACH_PRODUCTS={
  coach_core:{name:'Coach Core',sponsor:'Coach Core Sponsored Athlete'},
  coach_intelligence:{name:'Coach Intelligence',sponsor:'Coach Intelligence Sponsored Athlete'},
  mw_sprint_performance:{name:'MW Sprint Performance System',sponsor:'MW Sprint Performance Sponsored Athlete'},
};

function stripeHeaders(){
  const secret=String(process.env.STRIPE_SECRET_KEY||'').trim();
  if(!secret.startsWith('sk_'))throw Object.assign(new Error('Stripe billing is not configured.'),{status:503});
  return {Authorization:`Basic ${Buffer.from(`${secret}:`).toString('base64')}`};
}
async function stripe(path,{method='GET',form}={}){
  const headers=stripeHeaders();let body;
  if(form){headers['Content-Type']='application/x-www-form-urlencoded';body=new URLSearchParams(form).toString()}
  const r=await fetch('https://api.stripe.com/v1'+path,{method,headers,body});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw Object.assign(new Error(d?.error?.message||'Stripe billing update failed.'),{status:r.status===401?503:400});
  return d;
}
async function findStripePrice(productName,amount){
  const d=await stripe('/prices?active=true&type=recurring&limit=100&expand[]=data.product');
  const p=(d.data||[]).find(x=>x?.product?.name===productName&&x.currency==='usd'&&Number(x.unit_amount)===Number(amount)&&x.recurring?.interval==='month');
  if(!p?.id)throw Object.assign(new Error(`MW Stripe product missing: ${productName}.`),{status:503});
  return p;
}
async function loadCoachBilling(token,userId){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/billing_subscriptions?beneficiary_user_id=eq.${encodeURIComponent(userId)}&audience=eq.coach&select=plan_code,provider,provider_subscription_id,status,current_period_start,current_period_end,metadata&limit=1`,{
    headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`}
  });
  const rows=await r.json().catch(()=>[]);
  if(!r.ok)throw Object.assign(new Error('Coach billing could not be loaded.'),{status:r.status});
  return Array.isArray(rows)?rows[0]:null;
}
async function targetPlanPricing(token,planCode){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/membership_plans?plan_code=eq.${encodeURIComponent(planCode)}&active=eq.true&select=monthly_price_cents,sponsored_athlete_price_cents&limit=1`,{
    headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`}
  });
  const rows=await r.json().catch(()=>[]);
  const p=Array.isArray(rows)?rows[0]:null;
  if(!r.ok||!p)throw Object.assign(new Error('Target Coach membership pricing is unavailable.'),{status:503});
  return p;
}
function productName(item){return item?.price?.product&&typeof item.price.product==='object'?String(item.price.product.name||''):''}
async function applyStripeCoachPlanChange(token,userId,result){
  const target=result?.requested_plan_code,product=COACH_PRODUCTS[target];
  if(!product)throw Object.assign(new Error('Target Coach plan is invalid.'),{status:400});
  const billing=await loadCoachBilling(token,userId);
  if(!billing||billing.provider!=='stripe'||!billing.provider_subscription_id)throw Object.assign(new Error('An active Stripe Coach membership is required.'),{status:409});

  const pricing=await targetPlanPricing(token,target);
  const targetBase=await findStripePrice(product.name,Number(pricing.monthly_price_cents));
  const sub=await stripe(`/subscriptions/${encodeURIComponent(billing.provider_subscription_id)}?expand[]=items.data.price.product`);
  const items=Array.isArray(sub?.items?.data)?sub.items.data:[];
  const baseItem=items.find(x=>['Coach Core','Coach Intelligence','MW Sprint Performance System'].includes(productName(x)));
  const sponsorItem=items.find(x=>productName(x).includes('Sponsored Athlete'));
  if(!baseItem?.id)throw Object.assign(new Error('MW could not identify the Coach membership line item in Stripe.'),{status:409});
  const sponsorQty=sponsorItem?Number(sponsorItem.quantity||0):0;
  let targetSponsor=null;
  if(sponsorQty>0)targetSponsor=await findStripePrice(product.sponsor,Number(pricing.sponsored_athlete_price_cents));

  if(result.direction==='upgrade'){
    const form={
      'items[0][id]':String(baseItem.id),
      'items[0][price]':String(targetBase.id),
      'items[0][quantity]':'1',
      proration_behavior:'always_invoice',
      payment_behavior:'pending_if_incomplete',
    };
    if(sponsorItem&&targetSponsor){
      form['items[1][id]']=String(sponsorItem.id);
      form['items[1][price]']=String(targetSponsor.id);
      form['items[1][quantity]']=String(sponsorQty);
    }
    const updated=await stripe(`/subscriptions/${encodeURIComponent(billing.provider_subscription_id)}`,{method:'POST',form});
    return {provider:'stripe',providerAction:'upgrade_requested',providerReference:String(billing.provider_subscription_id),subscriptionStatus:updated.status||null,pendingUpdate:!!updated.pending_update};
  }

  let schedule;
  if(sub.schedule){
    schedule=await stripe(`/subscription_schedules/${encodeURIComponent(typeof sub.schedule==='string'?sub.schedule:sub.schedule.id)}`);
  }else{
    schedule=await stripe('/subscription_schedules',{method:'POST',form:{from_subscription:String(billing.provider_subscription_id)}});
  }
  const currentStart=Number(schedule?.current_phase?.start_date||sub.current_period_start);
  const currentEnd=Number(schedule?.current_phase?.end_date||sub.current_period_end);
  if(!currentStart||!currentEnd||currentEnd<=currentStart)throw Object.assign(new Error('Stripe could not determine the current billing period for this downgrade.'),{status:409});

  const form={
    end_behavior:'release',
    proration_behavior:'none',
    'phases[0][start_date]':String(currentStart),
    'phases[0][end_date]':String(currentEnd),
    'phases[0][items][0][price]':String(baseItem.price.id),
    'phases[0][items][0][quantity]':'1',
    'phases[1][items][0][price]':String(targetBase.id),
    'phases[1][items][0][quantity]':'1',
    'phases[1][metadata][mw_plan_code]':target,
    'phases[1][metadata][mw_checkout_kind]':'membership',
    'phases[1][metadata][mw_user_id]':userId,
    'phases[1][metadata][mw_sponsor_quantity]':String(sponsorQty),
    'phases[1][proration_behavior]':'none',
  };
  if(sponsorItem){
    form['phases[0][items][1][price]']=String(sponsorItem.price.id);
    form['phases[0][items][1][quantity]']=String(sponsorQty);
    if(targetSponsor){
      form['phases[1][items][1][price]']=String(targetSponsor.id);
      form['phases[1][items][1][quantity]']=String(sponsorQty);
    }
  }
  const scheduled=await stripe(`/subscription_schedules/${encodeURIComponent(schedule.id)}`,{method:'POST',form});
  return {provider:'stripe',providerAction:'downgrade_scheduled',providerReference:String(scheduled.id),effectiveAt:new Date(currentEnd*1000).toISOString(),scheduleId:scheduled.id};
}

async function rpc(name,token,args={}){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`,{
    method:'POST',
    headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
    body:JSON.stringify(args)
  });
  const text=await r.text();
  let data=null;try{data=text?JSON.parse(text):null}catch{data=text}
  if(!r.ok)throw Object.assign(new Error(data?.message||data?.hint||data?.details||String(data||`Billing request failed (${r.status})`)),{status:r.status});
  return data;
}

module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  try{
    const {token,user}=await authenticate(req);
    if(req.method==='GET'){
      const status=await rpc('mw_billing_status',token,{});
      return res.status(200).json({ok:true,status});
    }
    if(req.method!=='POST')return res.status(405).json({error:'GET or POST only'});
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const action=String(body.action||'');
    if(action==='athlete_self_pay'){
      const result=await rpc('mw_request_athlete_self_pay_transition',token,{p_billing_cycle:String(body.billingCycle||'monthly')});
      return res.status(200).json({ok:true,result,checkoutRequired:true,checkoutAudience:'athlete'});
    }
    if(action==='coach_plan_change'){
      const billing=await rpc('mw_billing_status',token,{});
      if(String(billing?.provider||'')==='apple'){
        return res.status(200).json({
          ok:true,
          result:{requestedTier:String(body.requestedTier||''),currentPlanCode:billing.current_plan_code},
          providerResult:{provider:'apple',providerAction:'app_store_required'},
          checkoutRequired:false,
          checkoutAudience:'coach'
        });
      }
      if(String(billing?.provider||'')!=='stripe'){
        return res.status(409).json({error:'Your Coach membership provider is not ready for a plan change yet.'});
      }

      const result=await rpc('mw_request_coach_plan_change',token,{p_requested_tier:String(body.requestedTier||'')});
      try{
        const providerResult=await applyStripeCoachPlanChange(token,user.id,result);
        if(providerResult?.providerReference){
          await rpc('mw_register_own_billing_transition_provider',token,{p_transition_id:result.transition_id,p_provider:'stripe',p_provider_reference:providerResult.providerReference});
        }
        return res.status(200).json({ok:true,result,providerResult,checkoutRequired:false,checkoutAudience:'coach'});
      }catch(e){
        await rpc('mw_cancel_own_billing_transition',token,{p_transition_id:result.transition_id,p_reason:'stripe_provider_update_failed'}).catch(()=>null);
        throw e;
      }
    }
    if(action==='cancel_billing_transition'){
      const transitionId=String(body.transitionId||'');
      const trResp=await fetch(`${SUPABASE_URL}/rest/v1/billing_transitions?id=eq.${encodeURIComponent(transitionId)}&beneficiary_user_id=eq.${encodeURIComponent(user.id)}&select=id,direction,status,provider,provider_reference&limit=1`,{
        headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`}
      });
      const trRows=await trResp.json().catch(()=>[]),tr=Array.isArray(trRows)?trRows[0]:null;
      if(tr?.provider==='stripe'&&tr?.direction==='downgrade'&&String(tr.provider_reference||'').startsWith('sub_sched_')){
        try{
          await stripe(`/subscription_schedules/${encodeURIComponent(tr.provider_reference)}/release`,{method:'POST',form:{preserve_cancel_date:'false'}});
        }catch(e){
          if(e.status!==400)throw e;
        }
      }
      const result=await rpc('mw_cancel_own_billing_transition',token,{p_transition_id:transitionId,p_reason:String(body.reason||'user_cancelled')});
      return res.status(200).json({ok:true,result});
    }
    if(action==='coach_end_sponsorship'){
      const result=await rpc('mw_coach_schedule_sponsorship_end',token,{p_athlete_user_id:body.athleteUserId,p_end_at:body.endAt});
      return res.status(200).json({ok:true,result});
    }
    return res.status(400).json({error:'Unsupported billing action'});
  }catch(e){return res.status(e.status||500).json({error:e.message||'Billing request failed'})}
};
