import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const headers = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type, apikey, authorization, x-client-info",
  "access-control-allow-methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
const clean = (v: unknown, n = 300) => String(v ?? "").trim().slice(0, n);

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
    const first = clean(payload.first_name, 80);
    const last = clean(payload.last_name, 80);
    const reason = clean(payload.reason, 2000);

    if (!/^\S+@\S+\.\S+$/.test(email) || !first || !last || reason.length < 20) {
      return json({ ok: false, error: "Complete your name, valid email, and a short reason for requesting coach access." }, 400);
    }

    const url = Deno.env.get("SUPABASE_URL") || "";
    const key = secretKey();
    if (!url || !key) return json({ ok: false, error: "Coach application service unavailable." }, 503);

    const rawIp = (req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "unknown")
      .split(",")[0].trim();
    const requestFingerprint = await sha256Hex(`mw-coach-apply|${rawIp}`);
    const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const rateResp = await fetch(
      `${url}/rest/v1/coach_access_applications?request_fingerprint=eq.${encodeURIComponent(requestFingerprint)}&created_at=gte.${encodeURIComponent(cutoff)}&select=id`,
      { headers: adminHeaders(key) },
    );
    if (!rateResp.ok) throw new Error(`Rate-limit lookup failed (${rateResp.status})`);
    const recent = await rateResp.json().catch(() => []);
    if (Array.isArray(recent) && recent.length >= 5) {
      return json({ ok: false, error: "Too many applications from this network. Please try again later." }, 429);
    }

    const priorResp = await fetch(
      `${url}/rest/v1/coach_access_applications?email_normalized=eq.${encodeURIComponent(email)}&status=eq.pending&select=id&limit=1`,
      { headers: adminHeaders(key) },
    );
    if (!priorResp.ok) throw new Error(`Duplicate lookup failed (${priorResp.status})`);
    const prior = await priorResp.json().catch(() => []);
    if (Array.isArray(prior) && prior.length) {
      return json({ ok: true, status: "pending", message: "Application received. MW Dynasty will review your coach access request." });
    }

    const body = {
      email,
      first_name: first,
      last_name: last,
      organization: clean(payload.organization, 160) || null,
      city: clean(payload.city, 100) || null,
      state: clean(payload.state, 80) || null,
      coaching_level: clean(payload.coaching_level, 100) || null,
      years_coaching: Number.isFinite(Number(payload.years_coaching)) ? Math.max(0, Math.min(80, Number(payload.years_coaching))) : null,
      website_or_social: clean(payload.website_or_social, 300) || null,
      reason,
      status: "pending",
      request_fingerprint: requestFingerprint,
    };

    const insertResp = await fetch(`${url}/rest/v1/coach_access_applications`, {
      method: "POST",
      headers: adminHeaders(key, { "content-type": "application/json", "prefer": "return=minimal" }),
      body: JSON.stringify(body),
    });
    if (!insertResp.ok) {
      console.error("MW coach application insert failed", insertResp.status);
      return json({ ok: false, error: "Coach application could not be submitted." }, 500);
    }

    return json({ ok: true, status: "pending", message: "Application received. MW Dynasty will review your coach access request." });
  } catch (error) {
    console.error("MW coach application error", error);
    return json({ ok: false, error: "Coach application could not be submitted." }, 500);
  }
});
