import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS={
  "access-control-allow-origin":"*",
  "access-control-allow-headers":"authorization, content-type, apikey, x-client-info",
  "access-control-allow-methods":"POST, OPTIONS",
};
const J=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store",...CORS}});
const enc=new TextEncoder();

const DEFAULT_PRODUCTS:Record<string,string>={
  mw_athlete:"com.mwdynasty.app.athlete.monthly",
  coach_core:"com.mwdynasty.app.coach.core.monthly",
  coach_intelligence:"com.mwdynasty.app.coach.intelligence.monthly",
  mw_sprint_performance:"com.mwdynasty.app.coach.sprintperformance.monthly",
};
const SPONSOR_PRODUCT_BY_PLAN:Record<string,string>={
  coach_core:"Coach Core Sponsored Athlete",
  coach_intelligence:"Coach Intelligence Sponsored Athlete",
  mw_sprint_performance:"MW Sprint Performance Sponsored Athlete",
};

async function alignAppleCoachSponsorBilling(supabase:any,userId:string,planCode:string){
  if(!SPONSOR_PRODUCT_BY_PLAN[planCode])return;
  const {data:pkg,error:pkgErr}=await supabase.from("coach_sponsorship_packages")
    .select("id,provider_subscription_id,requested_seats,status,metadata,seat_price_cents")
    .eq("coach_user_id",userId).eq("provider","stripe")
    .in("status",["active","cancel_at_period_end","past_due"])
    .gt("requested_seats",0).order("updated_at",{ascending:false}).limit(1).maybeSingle();
  if(pkgErr||!pkg)return;
  const stripeKey=Deno.env.get("STRIPE_SECRET_KEY")||"";
  const {data:plan,error:planErr}=await supabase.from("membership_plans")
    .select("sponsored_athlete_price_cents").eq("plan_code",planCode).eq("active",true).limit(1).maybeSingle();
  if(planErr||!plan)return;
  const targetAmount=Number(plan.sponsored_athlete_price_cents||0),targetName=SPONSOR_PRODUCT_BY_PLAN[planCode];
  if(!stripeKey||!pkg.provider_subscription_id){
    await supabase.from("coach_sponsorship_packages").update({
      metadata:{...(pkg.metadata||{}),tier_alignment_required:true,target_plan_code:planCode,target_seat_price_cents:targetAmount}
    }).eq("id",pkg.id);
    return;
  }
  try{
    const pricesResp=await fetch("https://api.stripe.com/v1/prices?active=true&type=recurring&limit=100&expand[]=data.product",{headers:{authorization:`Bearer ${stripeKey}`}});
    if(!pricesResp.ok)throw new Error("Stripe prices unavailable");
    const prices=await pricesResp.json();
    const target=(prices.data||[]).find((item:any)=>item?.product?.name===targetName&&item.currency==="usd"&&Number(item.unit_amount)===targetAmount&&item.recurring?.interval==="month");
    if(!target?.id)throw new Error("Target sponsored-athlete price missing");
    const subResp=await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(pkg.provider_subscription_id)}?expand[]=items.data.price.product`,{headers:{authorization:`Bearer ${stripeKey}`}});
    if(!subResp.ok)throw new Error("Sponsored-athlete subscription unavailable");
    const sub=await subResp.json(),item=sub?.items?.data?.[0];
    if(!item?.id)throw new Error("Sponsored-athlete subscription item missing");
    if(String(item?.price?.id||"")!==String(target.id)||Number(item?.quantity||0)!==Number(pkg.requested_seats||0)){
      const body=new URLSearchParams({price:String(target.id),quantity:String(pkg.requested_seats||0),proration_behavior:targetAmount>Number(pkg.seat_price_cents||0)?"always_invoice":"none"});
      const ur=await fetch(`https://api.stripe.com/v1/subscription_items/${encodeURIComponent(String(item.id))}`,{method:"POST",headers:{authorization:`Bearer ${stripeKey}`,"content-type":"application/x-www-form-urlencoded"},body});
      if(!ur.ok)throw new Error("Sponsored-athlete price update failed");
    }
    const meta=new URLSearchParams({"metadata[mw_plan_code]":planCode});
    const mr=await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(pkg.provider_subscription_id)}`,{method:"POST",headers:{authorization:`Bearer ${stripeKey}`,"content-type":"application/x-www-form-urlencoded"},body:meta});
    if(!mr.ok)throw new Error("Sponsored-athlete metadata update failed");
    await supabase.from("coach_sponsorship_packages").update({
      plan_code:planCode,seat_price_cents:targetAmount,
      metadata:{...(pkg.metadata||{}),tier_alignment_required:false,target_plan_code:planCode,last_tier_alignment_at:new Date().toISOString()}
    }).eq("id",pkg.id);
  }catch(error){
    console.error("Apple Coach sponsor-tier alignment failed",error);
    await supabase.from("coach_sponsorship_packages").update({
      metadata:{...(pkg.metadata||{}),tier_alignment_required:true,target_plan_code:planCode,target_seat_price_cents:targetAmount}
    }).eq("id",pkg.id);
  }
}

function b64url(input:Uint8Array|string){
  const bytes=typeof input==="string"?enc.encode(input):input;
  let binary="";for(const b of bytes)binary+=String.fromCharCode(b);
  return btoa(binary).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
}
function decodePart(jws:string,index=1){
  const part=String(jws||"").split(".")[index]||"";
  const padded=part.replace(/-/g,"+").replace(/_/g,"/")+"=".repeat((4-part.length%4)%4);
  try{return JSON.parse(atob(padded))}catch{return null}
}
function pemBytes(pem:string){
  const clean=pem.replace(/\\n/g,"\n").replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,"");
  const raw=atob(clean);const out=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)out[i]=raw.charCodeAt(i);return out;
}
async function appleToken(issuer:string,keyId:string,bundleId:string,privateKey:string){
  const now=Math.floor(Date.now()/1000);
  const header=b64url(JSON.stringify({alg:"ES256",kid:keyId,typ:"JWT"}));
  const payload=b64url(JSON.stringify({iss:issuer,iat:now,exp:now+300,aud:"appstoreconnect-v1",bid:bundleId}));
  const key=await crypto.subtle.importKey("pkcs8",pemBytes(privateKey),{name:"ECDSA",namedCurve:"P-256"},false,["sign"]);
  const sig=await crypto.subtle.sign({name:"ECDSA",hash:"SHA-256"},key,enc.encode(header+"."+payload));
  return header+"."+payload+"."+b64url(new Uint8Array(sig));
}
function secretFromSet(name:string){
  const raw=Deno.env.get(name)||"";if(!raw)return "";
  try{return String(JSON.parse(raw)?.default||"")}catch{return ""}
}
function productMap(){
  const raw=Deno.env.get("MW_APPLE_PRODUCT_MAP")||"";
  if(!raw)return DEFAULT_PRODUCTS;
  try{return {...DEFAULT_PRODUCTS,...JSON.parse(raw)}}catch{return DEFAULT_PRODUCTS}
}
async function appleGet(base:string,path:string,token:string){
  const r=await fetch(base+path,{headers:{authorization:"Bearer "+token}});
  const d=await r.json().catch(()=>({}));
  return {r,d};
}
function msIso(value:unknown){
  const n=Number(value);return Number.isFinite(n)&&n>0?new Date(n).toISOString():null;
}

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return J({ok:true});
  if(req.method!=="POST")return J({ok:false,error:"POST only"},405);
  try{
    const supabaseUrl=Deno.env.get("SUPABASE_URL")||"";
    const serviceRole=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||secretFromSet("SUPABASE_SECRET_KEYS");
    const publicKey=Deno.env.get("SUPABASE_ANON_KEY")||secretFromSet("SUPABASE_PUBLISHABLE_KEYS")||serviceRole;
    const auth=req.headers.get("authorization")||"";
    if(!supabaseUrl||!serviceRole||!publicKey||!auth)return J({ok:false,error:"MW server configuration is incomplete."},503);

    const userResp=await fetch(supabaseUrl+"/auth/v1/user",{headers:{apikey:publicKey,authorization:auth}});
    const user=await userResp.json().catch(()=>({}));
    if(!userResp.ok||!user?.id)return J({ok:false,error:"Your MW session expired. Sign in again."},401);

    const live=await fetch(supabaseUrl+"/rest/v1/rpc/mw_current_session_active",{method:"POST",headers:{apikey:publicKey,authorization:auth,"content-type":"application/json"},body:"{}"});
    if(!live.ok||await live.json().catch(()=>false)!==true)return J({ok:false,error:"Your MW session expired. Sign in again."},401);
    const body=await req.json().catch(()=>({}));
    const transactionId=String(body.transactionId||"").trim();
    const planCode=String(body.planCode||"").trim();
    if(!/^\d+$/.test(transactionId))return J({ok:false,error:"A valid App Store transaction is required."},400);
    const products=productMap(),expectedProduct=products[planCode];
    if(!expectedProduct)return J({ok:false,error:"This MW membership is not configured for App Store purchase."},400);

    const issuer=Deno.env.get("APPLE_IAP_ISSUER_ID")||"";
    const keyId=Deno.env.get("APPLE_IAP_KEY_ID")||"";
    const privateKey=Deno.env.get("APPLE_IAP_PRIVATE_KEY")||"";
    const bundleId=Deno.env.get("APPLE_BUNDLE_ID")||"com.mwdynasty.app";
    if(!issuer||!keyId||!privateKey)return J({ok:false,error:"MW App Store purchase verification is not configured yet."},503);

    const token=await appleToken(issuer,keyId,bundleId,privateKey);
    let environment="production";
    let base="https://api.storekit.apple.com";
    let info=await appleGet(base,"/inApps/v1/transactions/"+encodeURIComponent(transactionId),token);
    if(!info.r.ok&&Number(info.d?.errorCode)===4040010){
      environment="sandbox";base="https://api.storekit-sandbox.apple.com";
      info=await appleGet(base,"/inApps/v1/transactions/"+encodeURIComponent(transactionId),token);
    }
    if(!info.r.ok)return J({ok:false,error:"Apple could not verify this transaction.",appleStatus:info.r.status},400);

    const tx=decodePart(String(info.d?.signedTransactionInfo||""));
    if(!tx)return J({ok:false,error:"Apple returned unreadable transaction information."},502);
    if(String(tx.bundleId||"")!==bundleId)return J({ok:false,error:"This transaction belongs to a different app."},403);
    if(String(tx.productId||"")!==expectedProduct)return J({ok:false,error:"This App Store purchase does not match the selected MW membership."},409);
    if(String(tx.appAccountToken||"").toLowerCase()!==String(user.id).toLowerCase())return J({ok:false,error:"This App Store purchase is not attached to this MW account."},403);

    const originalId=String(tx.originalTransactionId||"");
    if(!originalId)return J({ok:false,error:"Apple did not return the subscription identifier."},502);

    const statusResp=await appleGet(base,"/inApps/v1/subscriptions/"+encodeURIComponent(originalId),token);
    if(!statusResp.r.ok)return J({ok:false,error:"Apple subscription status could not be confirmed.",appleStatus:statusResp.r.status},502);
    if(String(statusResp.d?.bundleId||bundleId)!==bundleId)return J({ok:false,error:"Apple subscription bundle mismatch."},403);

    const last=(statusResp.d?.data||[]).flatMap((g:any)=>Array.isArray(g?.lastTransactions)?g.lastTransactions:[])
      .find((x:any)=>String(x?.originalTransactionId||"")===originalId);
    if(!last)return J({ok:false,error:"Apple did not return a current subscription state."},502);
    const latestTx=decodePart(String(last.signedTransactionInfo||""))||tx;
    if(String(latestTx.productId||"")!==expectedProduct)return J({ok:false,error:"The active App Store subscription is for a different MW membership."},409);
    if(String(latestTx.appAccountToken||tx.appAccountToken||"").toLowerCase()!==String(user.id).toLowerCase())return J({ok:false,error:"The App Store subscription is not attached to this MW account."},403);

    const statusNumber=Number(last.status||0);
    const status=statusNumber===1?"active":statusNumber===4?"grace_period":statusNumber===3?"billing_retry":statusNumber===5?"revoked":"expired";
    const start=msIso(latestTx.purchaseDate||tx.purchaseDate);
    const end=msIso(latestTx.expiresDate||tx.expiresDate);
    const supabase=createClient(supabaseUrl,serviceRole,{auth:{persistSession:false}});
    const {data,error}=await supabase.rpc("mw_apply_apple_subscription",{
      p_event_id:"apple:"+String(latestTx.transactionId||transactionId)+":"+status,
      p_user_id:user.id,
      p_plan_code:planCode,
      p_product_id:expectedProduct,
      p_transaction_id:String(latestTx.transactionId||transactionId),
      p_original_transaction_id:originalId,
      p_status:status,
      p_period_start:start,
      p_period_end:end,
      p_environment:environment,
      p_payload:{
        apple_status:statusNumber,
        transaction_reason:latestTx.transactionReason||null,
        storefront:latestTx.storefront||null,
        app_transaction_id:latestTx.appTransactionId||null,
        verified_via:"app_store_server_api"
      }
    });
    if(error){console.error("MW Apple activation failed",error);return J({ok:false,error:"MW access could not be activated from the verified App Store purchase."},500)}
    if(planCode!=="mw_athlete"&&(status==="active"||status==="grace_period")){
      await alignAppleCoachSponsorBilling(supabase,user.id,planCode);
    }
    return J({ok:true,processed:data!==false,status,planCode,accessActive:status==="active"||status==="grace_period",environment});
  }catch(error){
    console.error("MW Apple purchase verification error",error);
    return J({ok:false,error:"App Store verification is temporarily unavailable."},500);
  }
});
