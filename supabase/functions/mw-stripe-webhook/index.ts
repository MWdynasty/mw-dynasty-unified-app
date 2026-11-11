import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const encoder = new TextEncoder();

function signatureParts(value: string) {
  const result: { timestamp?: string; signatures: string[] } = { signatures: [] };
  for (const part of value.split(",")) {
    const [key, payload] = part.split("=", 2);
    if (key === "t") result.timestamp = payload;
    if (key === "v1" && payload) result.signatures.push(payload);
  }
  return result;
}

function hex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function matches(expected: string, actual: string) {
  if (expected.length !== actual.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) difference |= expected.charCodeAt(index) ^ actual.charCodeAt(index);
  return difference === 0;
}

async function verifyStripeSignature(rawBody: string, signature: string, secret: string) {
  const { timestamp, signatures } = signatureParts(signature);
  const issuedAt = Number(timestamp);
  if (!timestamp || !Number.isFinite(issuedAt) || Math.abs(Date.now() / 1000 - issuedAt) > 300) return false;
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${rawBody}`));
  const expected = hex(digest);
  return signatures.some((candidate) => matches(expected, candidate));
}

function cancellationScheduled(subscription: any) {
  return Boolean(subscription.cancel_at_period_end) || Number(subscription.cancel_at) > 0;
}

function subscriptionPeriodEnd(subscription: any) {
  const ends = [subscription.current_period_end, ...(subscription.items?.data || []).map((line: any) => line.current_period_end)]
    .map(Number).filter((value: number) => Number.isFinite(value) && value > 0);
  const normalEnd = ends.length ? Math.max(...ends) : null;
  if (subscription.status === "canceled" && subscription.ended_at) return subscription.ended_at;
  return cancellationScheduled(subscription) && subscription.cancel_at ? subscription.cancel_at : normalEnd;
}

function iso(seconds: unknown) {
  const value = Number(seconds);
  return Number.isFinite(value) && value > 0 ? new Date(value * 1000).toISOString() : null;
}

const BASE_PLAN_BY_PRODUCT_NAME: Record<string,string> = {
  "Athlete Membership": "mw_athlete",
  "Coach Core": "coach_core",
  "Coach Intelligence": "coach_intelligence",
  "MW Sprint Performance System": "mw_sprint_performance",
};

const SPONSOR_PRODUCT_BY_PLAN: Record<string,string> = {
  coach_core: "Coach Core Sponsored Athlete",
  coach_intelligence: "Coach Intelligence Sponsored Athlete",
  mw_sprint_performance: "MW Sprint Performance Sponsored Athlete",
};

async function stripeProductName(product: any, stripeKey: string) {
  if (product && typeof product === "object") return String(product.name || "");
  if (typeof product !== "string" || !product) return "";
  try {
    const r = await fetch(`https://api.stripe.com/v1/products/${encodeURIComponent(product)}`, {
      headers: { authorization: `Bearer ${stripeKey}` },
    });
    if (!r.ok) return "";
    const d = await r.json().catch(() => ({}));
    return String(d?.name || "");
  } catch { return ""; }
}

async function findStripePriceId(productName: string, amount: number, stripeKey: string) {
  const r = await fetch("https://api.stripe.com/v1/prices?active=true&type=recurring&limit=100&expand[]=data.product", {
    headers: { authorization: `Bearer ${stripeKey}` },
  });
  if (!r.ok) throw new Error(`Could not load Stripe prices for ${productName}`);
  const d = await r.json().catch(() => ({}));
  const price = (d?.data || []).find((item: any) => {
    const product = item?.product && typeof item.product === "object" ? item.product : {};
    return product.name === productName
      && item.currency === "usd"
      && Number(item.unit_amount) === Number(amount)
      && item.recurring?.interval === "month";
  });
  if (!price?.id) throw new Error(`MW Stripe product missing: ${productName}`);
  return String(price.id);
}

async function targetSponsorSeatPrice(supabase: any, planCode: string) {
  const { data, error } = await supabase.from("membership_plans")
    .select("sponsored_athlete_price_cents")
    .eq("plan_code", planCode).eq("active", true).limit(1).maybeSingle();
  if (error || !data) throw new Error("MW sponsor pricing is unavailable");
  return Number(data.sponsored_athlete_price_cents || 0);
}

async function alignSponsorItem(subscription: any, planCode: string, sponsorQuantity: number, supabase: any) {
  if (!SPONSOR_PRODUCT_BY_PLAN[planCode] || sponsorQuantity < 1) return;
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") || "";
  if (!stripeKey) throw new Error("Stripe configuration missing for sponsor alignment");
  const targetName = SPONSOR_PRODUCT_BY_PLAN[planCode];
  const targetAmount = await targetSponsorSeatPrice(supabase, planCode);
  const targetPrice = await findStripePriceId(targetName, targetAmount, stripeKey);

  let sponsorItem: any = null;
  for (const item of (subscription?.items?.data || [])) {
    const name = await stripeProductName(item?.price?.product, stripeKey);
    if (name.includes("Sponsored Athlete")) { sponsorItem = item; break; }
  }
  if (!sponsorItem?.id) return;
  const samePrice = String(sponsorItem?.price?.id || "") === targetPrice;
  const sameQty = Number(sponsorItem?.quantity || 0) === Number(sponsorQuantity);
  if (!samePrice || !sameQty) {
    const currentAmount = Number(sponsorItem?.price?.unit_amount || 0);
    const body = new URLSearchParams({
      price: targetPrice,
      quantity: String(sponsorQuantity),
      proration_behavior: targetAmount > currentAmount ? "always_invoice" : "none",
    });
    const r = await fetch(`https://api.stripe.com/v1/subscription_items/${encodeURIComponent(String(sponsorItem.id))}`, {
      method: "POST",
      headers: { authorization: `Bearer ${stripeKey}`, "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!r.ok) throw new Error("Could not align sponsored-athlete pricing with the Coach tier");
  }
  const metadataNeedsUpdate =
    String(subscription?.metadata?.mw_plan_code || "") !== planCode
    || Number(subscription?.metadata?.mw_sponsor_quantity || 0) !== Number(sponsorQuantity);
  if (metadataNeedsUpdate) {
    const meta = new URLSearchParams({
      "metadata[mw_plan_code]": planCode,
      "metadata[mw_sponsor_quantity]": String(sponsorQuantity),
    });
    const mr = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(String(subscription.id))}`, {
      method: "POST",
      headers: { authorization: `Bearer ${stripeKey}`, "content-type": "application/x-www-form-urlencoded" },
      body: meta,
    });
    if (!mr.ok) throw new Error("Could not update Stripe Coach membership metadata");
  }
}

async function occupiedSponsorSeatCount(supabase: any, userId: string, subscriptionId: string) {
  const { data: packages, error: packageError } = await supabase.from("coach_sponsorship_packages")
    .select("id")
    .eq("coach_user_id", userId)
    .eq("provider", "stripe")
    .eq("provider_subscription_id", subscriptionId)
    .in("status", ["active","cancel_at_period_end","past_due","checkout_started"]);
  if (packageError || !Array.isArray(packages) || packages.length === 0) return 0;
  const ids = packages.map((row: any) => row.id).filter(Boolean);
  if (!ids.length) return 0;
  const { count, error } = await supabase.from("coach_sponsor_seats")
    .select("id", { count: "exact", head: true })
    .in("package_id", ids)
    .in("status", ["invited","claimed","active","scheduled_to_end"]);
  if (error) throw new Error("Could not validate occupied sponsored-athlete seats");
  return Number(count || 0);
}

async function restoreSponsorItemQuantity(itemId: string, quantity: number) {
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") || "";
  if (!stripeKey || !itemId) throw new Error("Stripe sponsor quantity repair is unavailable");
  const body = new URLSearchParams({
    quantity: String(quantity),
    proration_behavior: "none",
  });
  const r = await fetch(`https://api.stripe.com/v1/subscription_items/${encodeURIComponent(itemId)}`, {
    method: "POST",
    headers: { authorization: `Bearer ${stripeKey}`, "content-type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!r.ok) throw new Error("Could not restore the minimum paid sponsored-athlete quantity");
}

async function resolveBasePlanFromStripe(subscription: any, fallback: string) {
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") || "";
  if (!stripeKey) return fallback;
  const items = Array.isArray(subscription?.items?.data) ? subscription.items.data : [];
  for (const item of items) {
    const product = item?.price?.product;
    let name = typeof product === "object" ? String(product?.name || "") : "";
    if (!name && typeof product === "string" && product) {
      try {
        const r = await fetch(`https://api.stripe.com/v1/products/${encodeURIComponent(product)}`, {
          headers: { authorization: `Bearer ${stripeKey}` },
        });
        if (r.ok) {
          const d = await r.json().catch(() => ({}));
          name = String(d?.name || "");
        }
      } catch {}
    }
    if (BASE_PLAN_BY_PRODUCT_NAME[name]) return BASE_PLAN_BY_PRODUCT_NAME[name];
  }
  return fallback;
}

async function syncSeparateSponsorBilling(supabase: any, userId: string, baseSubscriptionId: string, baseStatus: string, baseCancelAtEnd: boolean, targetPlanCode: string) {
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") || "";
  if (!stripeKey) return;
  const { data } = await supabase.from("coach_sponsorship_packages")
    .select("id,provider_subscription_id,status,metadata,requested_seats,plan_code,seat_price_cents")
    .eq("coach_user_id", userId)
    .eq("provider", "stripe")
    .in("status", ["active","past_due","cancel_at_period_end"]);
  const pkg = (data || []).find((row: any) =>
    row.provider_subscription_id &&
    row.provider_subscription_id !== baseSubscriptionId &&
    row.metadata?.billing_scope === "sponsorship_only"
  );
  if (!pkg) return;

  const headers = { authorization: `Bearer ${stripeKey}`, "content-type": "application/x-www-form-urlencoded" };
  const terminal = ["canceled","cancelled","unpaid","incomplete_expired"].includes(baseStatus);
  const linkedCancel = pkg.metadata?.base_linked_cancel === true;

  if (!terminal && ["active","trialing"].includes(baseStatus) && SPONSOR_PRODUCT_BY_PLAN[targetPlanCode] && Number(pkg.requested_seats || 0) > 0) {
    const subResp = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(pkg.provider_subscription_id)}?expand[]=items.data.price.product`, {
      headers: { authorization: `Bearer ${stripeKey}` },
    });
    if (!subResp.ok) throw new Error("Could not load sponsored-seat subscription for tier alignment");
    const sponsorSub = await subResp.json();
    const targetAmount = await targetSponsorSeatPrice(supabase, targetPlanCode);
    const targetPrice = await findStripePriceId(SPONSOR_PRODUCT_BY_PLAN[targetPlanCode], targetAmount, stripeKey);
    const item = sponsorSub?.items?.data?.[0];
    if (!item?.id) throw new Error("Sponsored-seat subscription item is missing");
    if (String(item?.price?.id || "") !== targetPrice || Number(item?.quantity || 0) !== Number(pkg.requested_seats || 0)) {
      const body = new URLSearchParams({
        price: targetPrice,
        quantity: String(pkg.requested_seats || 0),
        proration_behavior: targetAmount > Number(pkg.seat_price_cents || 0) ? "always_invoice" : "none",
      });
      const ur = await fetch(`https://api.stripe.com/v1/subscription_items/${encodeURIComponent(String(item.id))}`, {
        method: "POST", headers, body,
      });
      if (!ur.ok) throw new Error("Could not align sponsored-seat subscription with Coach tier");
    }
    if (String(sponsorSub?.metadata?.mw_plan_code || "") !== targetPlanCode) {
      const meta = new URLSearchParams({ "metadata[mw_plan_code]": targetPlanCode });
      const mr = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(pkg.provider_subscription_id)}`, {
        method: "POST", headers, body: meta,
      });
      if (!mr.ok) throw new Error("Could not update sponsored-seat plan metadata");
    }
  }

  if (terminal) {
    const response = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(pkg.provider_subscription_id)}`, { method: "DELETE", headers });
    if (!response.ok && response.status !== 404) throw new Error("Could not stop sponsored-seat billing after Coach membership ended");
    return;
  }
  if ((baseCancelAtEnd && ["active","trialing"].includes(baseStatus)) || baseStatus === "past_due") {
    const body = new URLSearchParams({ cancel_at_period_end: "true" });
    const response = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(pkg.provider_subscription_id)}`, { method: "POST", headers, body });
    if (!response.ok) throw new Error("Could not align sponsored-seat cancellation with Coach membership");
    await supabase.from("coach_sponsorship_packages").update({
      metadata: { ...(pkg.metadata || {}), base_linked_cancel: true }
    }).eq("id", pkg.id);
    return;
  }
  if (!baseCancelAtEnd && ["active","trialing"].includes(baseStatus) && linkedCancel) {
    const body = new URLSearchParams({ cancel_at_period_end: "false" });
    const response = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(pkg.provider_subscription_id)}`, { method: "POST", headers, body });
    if (!response.ok) throw new Error("Could not restore sponsored-seat renewal with Coach membership");
    const metadata = { ...(pkg.metadata || {}) };
    delete metadata.base_linked_cancel;
    await supabase.from("coach_sponsorship_packages").update({ metadata }).eq("id", pkg.id);
  }
}


function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[character] || character));
}

async function sendPaymentFailureEmail(event: any, invoice: any, subscription: any, userId: string, supabase: any) {
  const resendKey = Deno.env.get("RESEND_API_KEY") || "";
  if (!resendKey) throw new Error("RESEND_API_KEY is not configured");

  let recipient = String(invoice?.customer_email || subscription?.customer_email || "").trim().toLowerCase();
  let firstName = "";
  const { data: profileResult } = await supabase.from("profiles")
    .select("first_name").eq("user_id", userId).maybeSingle();
  firstName = String(profileResult?.first_name || "").trim();

  if (!recipient) {
    const { data, error } = await supabase.auth.admin.getUserById(userId);
    if (error) throw new Error("Could not resolve the billing payer's email");
    recipient = String(data?.user?.email || "").trim().toLowerCase();
  }
  if (!/^\S+@\S+\.\S+$/.test(recipient)) throw new Error("Billing payer email is unavailable");

  const planCode = String(subscription?.metadata?.mw_plan_code || "");
  const membership = planCode === "mw_athlete" ? "athlete" : "coach";
  const greeting = firstName ? `Hi ${firstName},` : "Hi,";
  const text = [
    greeting,
    "",
    `We couldn’t process the latest payment for your MW Dynasty ${membership} membership.`,
    "",
    "Please sign in to MW Dynasty and open Profile → Billing to update your payment method.",
    "If your membership access is paused, it will be updated after Stripe confirms payment.",
    "",
    "— MW Dynasty",
  ].join("\n");
  const safeName = escapeHtml(firstName);
  const html = `<div style="font-family:Arial,sans-serif;color:#17212b;line-height:1.5"><p>${safeName ? `Hi ${safeName},` : "Hi,"}</p><p>We couldn’t process the latest payment for your MW Dynasty ${membership} membership.</p><p>Please sign in to MW Dynasty and open <strong>Profile → Billing</strong> to update your payment method.</p><p>If your membership access is paused, it will be updated after Stripe confirms payment.</p><p>— MW Dynasty</p></div>`;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${resendKey}`,
      "content-type": "application/json",
      "Idempotency-Key": `stripe-payment-failure-${String(event.id || "")}`,
    },
    body: JSON.stringify({
      from: "MW Dynasty Billing <billing@mwdynasty.com>",
      to: [recipient],
      subject: "Action needed: your MW Dynasty payment didn’t go through",
      text,
      html,
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("Payment failure email provider rejected the message", response.status, detail.slice(0, 300));
    throw new Error("Payment failure email could not be sent");
  }
}
\nDeno.serve(async (req) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") || "";
  const signature = req.headers.get("stripe-signature") || "";
  const rawBody = await req.text();
  if (!webhookSecret || !signature || !(await verifyStripeSignature(rawBody, signature, webhookSecret))) {
    return new Response("Invalid Stripe signature", { status: 400 });
  }

  let event: any;
  try { event = JSON.parse(rawBody); } catch { return new Response("Invalid JSON", { status: 400 }); }

  if (String(event.type || "") === "invoice.payment_failed") {
    const invoice = event?.data?.object || {};
    const invoiceSubscription = invoice.subscription
      ?? invoice?.parent?.subscription_details?.subscription
      ?? null;
    const subscriptionId = typeof invoiceSubscription === "string"
      ? invoiceSubscription
      : String(invoiceSubscription?.id || "");
    if (!subscriptionId) return Response.json({ received: true, ignored: true });

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const hostedSecretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || hostedSecretKeys.default || "";
    if (!stripeKey || !supabaseUrl || !serviceRoleKey) return new Response("Billing service configuration missing", { status: 500 });

    const sr = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(subscriptionId)}`, {
      headers: { authorization: `Bearer ${stripeKey}` },
    });
    if (!sr.ok) return new Response("Stripe subscription lookup failed", { status: 502 });
    const sub = await sr.json().catch(() => ({}));
    const userId = String(sub?.metadata?.mw_user_id || "");
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(userId)) return Response.json({ received: true, ignored: true });

    const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const message = String(
      invoice?.last_finalization_error?.message
      || invoice?.last_payment_error?.message
      || invoice?.status_transitions?.paid_at
      || "Payment method could not complete the Coach upgrade."
    );
    const { error } = await supabase.rpc("mw_mark_coach_plan_transition_payment_failure", {
      p_user_id: userId,
      p_provider_reference: subscriptionId,
      p_event_id: String(event.id || ""),
      p_failure_message: message,
    });
    if (error) {
      console.error("Coach upgrade payment failure tracking failed", error);
      return new Response("Billing failure tracking failed", { status: 500 });
    }
    try {
      await sendPaymentFailureEmail(event, invoice, sub, userId, supabase);
    } catch (emailError) {
      console.error("Payment failure email delivery failed", emailError);
      return new Response("Payment alert email failed", { status: 500 });
    }
    return Response.json({ received: true, upgrade_payment_failed: true, access_unchanged: true, payment_alert_email_sent: true });
  }

  if (!String(event.type || "").startsWith("customer.subscription.")) {
    return Response.json({ received: true, ignored: true });
  }

  const subscription = event?.data?.object || {};
  const metadata = subscription.metadata || {};
  const userId = String(metadata.mw_user_id || "");
  const subscriptionId = String(subscription.id || "");
  const checkoutKind = String(metadata.mw_checkout_kind || "membership");
  let planCode = String(metadata.mw_plan_code || "");
  if (checkoutKind !== "sponsorship_only") {
    planCode = await resolveBasePlanFromStripe(subscription, planCode);
  }
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(userId) || !subscriptionId || !planCode) {
    return Response.json({ received: true, ignored: true });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const hostedSecretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || hostedSecretKeys.default || "";
  if (!supabaseUrl || !serviceRoleKey) return new Response("Supabase service configuration missing", { status: 500 });
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const item = subscription?.items?.data?.[0] || {};

  // Read sponsor quantity from Stripe's live line items, not metadata, so portal
  // edits and scheduled tier changes cannot leave MW seat counts stale.
  let sponsorLine:any = checkoutKind === "sponsorship_only" ? item : null;
  let sponsorQuantity = checkoutKind === "sponsorship_only"
    ? Number(item.quantity || metadata.mw_sponsor_quantity || 0)
    : 0;
  if (checkoutKind === "membership" && planCode !== "mw_athlete") {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") || "";
    for (const line of (subscription?.items?.data || [])) {
      const name = await stripeProductName(line?.price?.product, stripeKey);
      if (name.includes("Sponsored Athlete")) {
        sponsorLine = line;
        sponsorQuantity = Number(line?.quantity || 0);
        break;
      }
    }
  }

  // A Coach cannot reduce paid quantity below seats that are already invited,
  // claimed, active, or scheduled to end. Stripe is repaired back to the safe
  // minimum before MW updates seat capacity.
  if (sponsorLine?.id && planCode !== "mw_athlete") {
    const occupied = await occupiedSponsorSeatCount(supabase, userId, subscriptionId);
    const safeQuantity = Math.min(250, Math.max(Number(sponsorQuantity || 0), occupied));
    if (safeQuantity !== Number(sponsorQuantity || 0)) {
      await restoreSponsorItemQuantity(String(sponsorLine.id), safeQuantity);
      sponsorQuantity = safeQuantity;
    }
  }
  const common = {
    p_event_id: String(event.id || ""),
    p_event_type: String(event.type || ""),
    p_user_id: userId,
    p_plan_code: planCode,
    p_subscription_id: subscriptionId,
    p_customer_id: typeof subscription.customer === "string" ? subscription.customer : "",
    p_status: String(subscription.status || "pending_payment"),
    p_period_start: iso(subscription.current_period_start ?? item.current_period_start),
    p_period_end: iso(subscriptionPeriodEnd(subscription)),
    p_cancel_at_period_end: cancellationScheduled(subscription),
    p_sponsor_quantity: sponsorQuantity,
    p_payload: { stripe_event_type: event.type, stripe_event_created: event.created || null, checkout_kind: checkoutKind },
  };
  let error: any = null;
  if (checkoutKind === "billing_transition") {
    const transitionId = String(metadata.mw_transition_id || "");
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(transitionId)) {
      return new Response("Billing transition metadata missing", { status: 400 });
    }
    const activeEnough = ["active","trialing"].includes(String(subscription.status || ""));
    if (!activeEnough) {
      return Response.json({ received: true, waiting_for_payment: true });
    }
    const confirmed = await supabase.rpc("mw_confirm_billing_transition", {
      p_transition_id: transitionId,
      p_provider: "stripe",
      p_provider_reference: subscriptionId,
      p_period_start: common.p_period_start,
      p_period_end: common.p_period_end,
    });
    error = confirmed.error;
  } else if (checkoutKind === "sponsorship_only") {
    const applied = await supabase.rpc("mw_apply_stripe_sponsorship_subscription", common);
    error = applied.error;
  } else {
    const applied = await supabase.rpc("mw_apply_stripe_subscription", {
      ...common,
      p_email: String(subscription.customer_email || ""),
    });
    error = applied.error;
  }
  if (error) {
    console.error("Stripe entitlement update failed", error);
    return new Response("Subscription update failed", { status: 500 });
  }

  if (String(event.type || "") === "customer.subscription.pending_update_expired" && checkoutKind === "membership" && planCode !== "mw_athlete") {
    const failed = await supabase.rpc("mw_fail_coach_plan_transition", {
      p_user_id: userId,
      p_provider_reference: subscriptionId,
      p_reason: "stripe_pending_update_expired",
      p_event_id: String(event.id || ""),
    });
    if (failed.error) {
      console.error("Expired Coach plan transition cleanup failed", failed.error);
      return new Response("Plan transition cleanup failed", { status: 500 });
    }
  }

  if (checkoutKind === "membership" && planCode !== "mw_athlete" && sponsorQuantity > 0) {
    try {
      await alignSponsorItem(subscription, planCode, sponsorQuantity, supabase);
    } catch (error) {
      console.error("Embedded sponsor price alignment failed", error);
      return new Response("Coach sponsor pricing alignment failed", { status: 500 });
    }
  }
  if (checkoutKind === "membership" && planCode !== "mw_athlete") {
    try {
      await syncSeparateSponsorBilling(
        supabase,
        userId,
        subscriptionId,
        String(subscription.status || "pending_payment"),
        cancellationScheduled(subscription),
        planCode
      );
    } catch (error) {
      console.error("Sponsor billing alignment failed", error);
      return new Response("Coach sponsorship billing alignment failed", { status: 500 });
    }
  }
  return Response.json({ received: true });
});
