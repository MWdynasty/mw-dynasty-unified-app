import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, apikey, authorization, x-client-info",
  "access-control-allow-methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...cors },
});

const clean = (v: unknown, n = 4000) => String(v ?? "").trim().slice(0, n);

async function sha256Hex(value: string) {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function secretKey() {
  const raw = Deno.env.get("SUPABASE_SECRET_KEYS") || "";
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.default) return String(parsed.default);
    } catch {}
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
}

function adminHeaders(key: string, extra: Record<string, string> = {}) {
  const out: Record<string, string> = { apikey: key, ...extra };
  if (!key.startsWith("sb_secret_")) out.authorization = `Bearer ${key}`;
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  try {
    const payload = await req.json().catch(() => ({})) as Record<string, unknown>;
    const email = clean(payload.email, 320).toLowerCase();
    const message = clean(payload.message, 4000);
    const category = clean(payload.category, 40) || "app_issue";
    const allowed = new Set(["app_issue", "account", "privacy", "training_data", "other"]);

    if (!/^\S+@\S+\.\S+$/.test(email)) return json({ ok: false, error: "Enter a valid email address." }, 400);
    if (message.length < 5 || message.length > 4000) return json({ ok: false, error: "Message must be 5-4000 characters." }, 400);
    if (!allowed.has(category)) return json({ ok: false, error: "Invalid category." }, 400);

    const url = Deno.env.get("SUPABASE_URL") || "";
    const key = secretKey();
    if (!url || !key) return json({ ok: false, error: "Support service unavailable." }, 503);

    const rawIp = (req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "unknown")
      .split(",")[0].trim();
    const requestFingerprint = await sha256Hex(`mw-public-support|${rawIp}`);
    const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const networkResp = await fetch(
      `${url}/rest/v1/public_support_requests?request_fingerprint=eq.${encodeURIComponent(requestFingerprint)}&created_at=gte.${encodeURIComponent(cutoff)}&select=id`,
      { headers: adminHeaders(key) },
    );
    if (!networkResp.ok) throw new Error(`Support network-rate lookup failed (${networkResp.status})`);
    const networkRecent = await networkResp.json().catch(() => []);
    if (Array.isArray(networkRecent) && networkRecent.length >= 5) {
      return json({ ok: false, error: "Too many support requests from this network. Please try again later." }, 429);
    }

    const emailResp = await fetch(
      `${url}/rest/v1/public_support_requests?contact_email=eq.${encodeURIComponent(email)}&created_at=gte.${encodeURIComponent(cutoff)}&select=id`,
      { headers: adminHeaders(key) },
    );
    if (!emailResp.ok) throw new Error(`Support email-rate lookup failed (${emailResp.status})`);
    const emailRecent = await emailResp.json().catch(() => []);
    if (Array.isArray(emailRecent) && emailRecent.length >= 3) {
      return json({ ok: false, error: "Too many support requests for this email. Please try again later." }, 429);
    }

    const appVersion = clean(payload.app_version, 40) || "unknown";
    const insertResp = await fetch(`${url}/rest/v1/public_support_requests`, {
      method: "POST",
      headers: adminHeaders(key, { "content-type": "application/json", "prefer": "return=minimal" }),
      body: JSON.stringify({
        contact_email: email,
        category,
        message,
        app_version: appVersion,
        request_fingerprint: requestFingerprint,
      }),
    });

    if (!insertResp.ok) {
      console.error("MW public support insert failed", insertResp.status);
      return json({ ok: false, error: "Support request could not be sent." }, 500);
    }

    return json({ ok: true });
  } catch (error) {
    console.error("MW public support error", error);
    return json({ ok: false, error: "Support request could not be sent." }, 500);
  }
});
