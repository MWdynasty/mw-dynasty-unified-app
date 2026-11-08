import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

function b64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function textBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

async function apnsJwt(): Promise<string> {
  const keyId = Deno.env.get("APNS_KEY_ID");
  const teamId = Deno.env.get("APNS_TEAM_ID");
  const pem = Deno.env.get("APNS_PRIVATE_KEY")?.replace(/\\n/g, "\n");
  if (!keyId || !teamId || !pem) throw new Error("APNs credentials are not configured");
  const raw = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const der = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey("pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const header = b64url(textBytes(JSON.stringify({ alg: "ES256", kid: keyId })));
  const payload = b64url(textBytes(JSON.stringify({ iss: teamId, iat: Math.floor(Date.now() / 1000) })));
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, cryptoKey, textBytes(`${header}.${payload}`)));
  return `${header}.${payload}.${b64url(signature)}`;
}

async function audience(record: Record<string, unknown>, table: string): Promise<string | null> {
  if (table === "coach_notifications") {
    return typeof record.coach_user_id === "string" ? record.coach_user_id : null;
  }
  if (table !== "athlete_notifications") return null;

  let athleteId = typeof record.athlete_id === "string" ? record.athlete_id : null;
  if (!athleteId && typeof record.id === "string") {
    const { data, error } = await admin.from("athlete_notifications")
      .select("athlete_id").eq("id", record.id).maybeSingle();
    if (error) throw error;
    athleteId = data?.athlete_id ?? null;
  }
  if (!athleteId) return null;

  const { data, error } = await admin.from("athletes").select("user_id").eq("id", athleteId).maybeSingle();
  if (error) throw error;
  return data?.user_id ?? null;
}

function preferenceFor(record: Record<string, unknown>): string | null {
  const type = String(record.notification_type ?? "").toLowerCase();
  if (type.includes("scripture") || type.includes("bible")) return "scripture_encouragement";
  if (type.includes("coach_mus")) return "coach_mus_motivation";
  if (type.includes("inactivity") || type.includes("workout_reminder")) return "inactivity_reminders";
  if (type.includes("weekly") || type.includes("progress_summary")) return "progress_summaries";
  if (type.includes("adaptive") || type.includes("progress") || type.includes("personal_record") || type === "pr") return "adaptive_updates";
  return null;
}

function localHour(timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  return Number(parts.find((part) => part.type === "hour")?.value ?? "0");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  try {
    const event = await req.json();
    const table = String(event.table ?? event.data?.table ?? "");
    const record = (event.record ?? event.new_record ?? event.data?.record ?? event.data?.new_record ?? {}) as Record<string, unknown>;
    if (table !== "athlete_notifications" && table !== "coach_notifications") return Response.json({ ignored: true });
    const userId = await audience(record, table);
    if (!userId) return Response.json({ ignored: true, reason: "no-recipient" });

    const { data: preferences, error: preferenceError } = await admin
      .from("mw_notification_preferences").select("*").eq("user_id", userId).maybeSingle();
    if (preferenceError) throw preferenceError;
    if (!preferences?.push_enabled) return Response.json({ sent: 0, reason: "push-disabled" });

    const preference = preferenceFor(record);
    if (preference && preferences[preference] === false) {
      return Response.json({ sent: 0, reason: "category-disabled" });
    }
    const timezone = String(preferences.timezone || "America/Chicago");
    const hour = localHour(timezone);
    if (preferences.quiet_hours_enabled && (hour >= 21 || hour < 7)) {
      return Response.json({ sent: 0, reason: "quiet-hours" });
    }

    const bundleId = Deno.env.get("APNS_BUNDLE_ID") ?? "com.mwdynasty.app";
    const { data: devices, error } = await admin.from("mw_push_devices")
      .select("id,device_token").eq("user_id", userId).eq("environment", "production")
      .eq("app_bundle_id", bundleId).is("disabled_at", null);
    if (error) throw error;
    if (!devices?.length) return Response.json({ sent: 0, reason: "no-devices" });

    const notificationId = String(record.id ?? "");
    if (!notificationId) return Response.json({ sent: 0, reason: "no-notification-id" });
    const { data: claimed, error: claimError } = await admin.rpc("mw_claim_push_delivery", {
      p_user_id: userId,
      p_notification_id: notificationId,
      p_daily_limit: Number(preferences.max_daily_pushes ?? 3),
    });
    if (claimError) throw claimError;
    if (!claimed) return Response.json({ sent: 0, reason: "daily-limit-or-duplicate" });

    const jwt = await apnsJwt();
    const title = String(record.title ?? "MW Dynasty");
    const body = String(record.body ?? "You have a new MW Dynasty update.");
    const results = [];
    for (const device of devices) {
      const response = await fetch(`https://api.push.apple.com/3/device/${encodeURIComponent(device.device_token)}`, {
        method: "POST",
        headers: { authorization: `bearer ${jwt}`, "apns-topic": bundleId, "content-type": "application/json" },
        body: JSON.stringify({ aps: { alert: { title, body }, sound: "default", badge: 1 } }),
      });
      results.push(response.status);
      if (response.status === 400 || response.status === 410) {
        await admin.from("mw_push_devices").update({ disabled_at: new Date().toISOString() }).eq("id", device.id);
      }
    }
    return Response.json({ sent: results.filter((status) => status >= 200 && status < 300).length, statuses: results });
  } catch (error) {
    console.error("mw-push-dispatch failed", error instanceof Error ? error.message : "unknown error");
    return Response.json({ error: "Push dispatch failed" }, { status: 500 });
  }
});
