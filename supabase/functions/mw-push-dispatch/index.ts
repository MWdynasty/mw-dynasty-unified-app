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
  if (table === "coach_notifications") return typeof record.coach_user_id === "string" ? record.coach_user_id : null;
  if (table === "athlete_notifications" && typeof record.athlete_id === "string") {
    const { data } = await admin.from("athletes").select("user_id").eq("id", record.athlete_id).maybeSingle();
    return data?.user_id ?? null;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  try {
    const event = await req.json();
    const table = event.table as string;
    const record = (event.record ?? {}) as Record<string, unknown>;
    if (table !== "athlete_notifications" && table !== "coach_notifications") return Response.json({ ignored: true });
    const userId = await audience(record, table);
    if (!userId) return Response.json({ ignored: true, reason: "no-recipient" });
    const { data: devices, error } = await admin.from("mw_push_devices")
      .select("id,device_token").eq("user_id", userId).eq("environment", "production")
      .eq("app_bundle_id", Deno.env.get("APNS_BUNDLE_ID") ?? "com.mwdynasty.app").is("disabled_at", null);
    if (error) throw error;
    if (!devices?.length) return Response.json({ sent: 0, reason: "no-devices" });
    const jwt = await apnsJwt();
    const title = String(record.title ?? "MW Dynasty");
    const body = String(record.body ?? "You have a new MW Dynasty update.");
    const results = [];
    for (const device of devices) {
      const response = await fetch(`https://api.push.apple.com/3/device/${encodeURIComponent(device.device_token)}`, {
        method: "POST",
        headers: { authorization: `bearer ${jwt}`, "apns-topic": Deno.env.get("APNS_BUNDLE_ID") ?? "com.mwdynasty.app", "content-type": "application/json" },
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

