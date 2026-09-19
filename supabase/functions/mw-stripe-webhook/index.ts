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

function iso(seconds: unknown) {
  const value = Number(seconds);
  return Number.isFinite(value) && value > 0 ? new Date(value * 1000).toISOString() : null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") || "";
  const signature = req.headers.get("stripe-signature") || "";
  const rawBody = await req.text();
  if (!webhookSecret || !signature || !(await verifyStripeSignature(rawBody, signature, webhookSecret))) {
    return new Response("Invalid Stripe signature", { status: 400 });
  }

  let event: any;
  try { event = JSON.parse(rawBody); } catch { return new Response("Invalid JSON", { status: 400 }); }
  if (!String(event.type || "").startsWith("customer.subscription.")) {
    return Response.json({ received: true, ignored: true });
  }

  const subscription = event?.data?.object || {};
  const metadata = subscription.metadata || {};
  const userId = String(metadata.mw_user_id || "");
  const planCode = String(metadata.mw_plan_code || "");
  const subscriptionId = String(subscription.id || "");
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(userId) || !subscriptionId || !planCode) {
    return Response.json({ received: true, ignored: true });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!supabaseUrl || !serviceRoleKey) return new Response("Supabase service configuration missing", { status: 500 });
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const item = subscription?.items?.data?.[0] || {};
  const { error } = await supabase.rpc("mw_apply_stripe_subscription", {
    p_event_id: String(event.id || ""),
    p_event_type: String(event.type || ""),
    p_user_id: userId,
    p_email: String(subscription.customer_email || ""),
    p_plan_code: planCode,
    p_subscription_id: subscriptionId,
    p_customer_id: typeof subscription.customer === "string" ? subscription.customer : "",
    p_status: String(subscription.status || "pending_payment"),
    p_period_start: iso(subscription.current_period_start ?? item.current_period_start),
    p_period_end: iso(subscription.current_period_end ?? item.current_period_end),
    p_cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
    p_sponsor_quantity: Number(metadata.mw_sponsor_quantity || 0),
    p_payload: { stripe_event_type: event.type, stripe_event_created: event.created || null },
  });
  if (error) {
    console.error("Stripe entitlement update failed", error);
    return new Response("Subscription update failed", { status: 500 });
  }
  return Response.json({ received: true });
});
