import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
});

function normalizeEmail(v: unknown) {
  return String(v ?? "").trim().toLowerCase();
}

function clean(v: unknown, n = 300) {
  return String(v ?? "").trim().slice(0, n);
}

function pick(obj: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const v = obj[key];
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return undefined;
}

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

async function rest(path: string, init: RequestInit = {}) {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = secretKey();
  if (!url || !key) throw new Error("MW backend secret configuration is unavailable");
  const headers = new Headers(adminHeaders(key));
  new Headers(init.headers || {}).forEach((value, name) => headers.set(name, value));
  if (!headers.has("content-type")) headers.set("content-type", "application/json");
  const response = await fetch(`${url}/rest/v1/${path}`, { ...init, headers });
  const text = await response.text();
  let data: unknown = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  if (!response.ok) throw new Error(`Database request failed (${response.status})`);
  return data;
}

function parseTimestamp(value: unknown, field: string) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const raw = String(value).trim();
  const ms = Date.parse(raw);
  if (!Number.isFinite(ms)) throw new Error(`Invalid ${field}`);
  return new Date(ms).toISOString();
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405);

  try {
    const auth = req.headers.get("authorization") || "";
    const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
    if (!token) return json({ ok: false, error: "Unauthorized" }, 401);

    const tokenHash = await sha256Hex(token);
    const keyRows = await rest(
      `membership_webhook_keys?provider=eq.skool&enabled=is.true&token_hash=eq.${encodeURIComponent(tokenHash)}&select=id&limit=1`,
      { method: "GET" },
    );
    if (!Array.isArray(keyRows) || keyRows.length === 0) return json({ ok: false, error: "Unauthorized" }, 401);

    const payload = await req.json().catch(() => ({})) as Record<string, unknown>;
    const email = normalizeEmail(pick(payload, ["email", "subscription_email", "subscriptionEmail", "member_email", "Email", "Subscription Email"]));
    if (!/^\S+@\S+\.\S+$/.test(email)) return json({ ok: false, error: "A valid member email is required" }, 400);

    const rawStatus = clean(pick(payload, ["status", "membership_status", "subscription_status"]) ?? "active", 40).toLowerCase();
    const allowedStatuses = new Set(["active", "trialing", "cancelled", "paused", "past_due", "refunded", "expired"]);
    if (!allowedStatuses.has(rawStatus)) return json({ ok: false, error: "Unsupported membership status" }, 400);
    const status = rawStatus;

    const source = "skool";
    const planCode = "mw_athlete";
    const eventType = clean(pick(payload, ["event_type", "event", "type"]) ?? "membership_update", 120) || "membership_update";
    const externalMemberId = clean(pick(payload, ["member_id", "memberId", "user_id", "id"]) ?? "", 200) || null;
    const startsAt = parseTimestamp(pick(payload, ["access_starts_at", "starts_at", "started_at"]), "access start") || new Date().toISOString();
    const suppliedEnd = parseTimestamp(pick(payload, ["access_ends_at", "ends_at", "cancel_at", "current_period_end"]), "access end");

    let accessEndsAt = suppliedEnd;
    if (["cancelled", "paused", "past_due", "refunded", "expired"].includes(status) && !accessEndsAt) {
      accessEndsAt = new Date().toISOString();
    }
    if (accessEndsAt && Date.parse(accessEndsAt) < Date.parse(startsAt) && status === "active") {
      return json({ ok: false, error: "Access end cannot be before access start" }, 400);
    }

    const sanitizedEvent = {
      status,
      plan_code: planCode,
      event_type: eventType,
      access_starts_at: startsAt,
      access_ends_at: accessEndsAt,
      has_external_member_id: Boolean(externalMemberId),
    };

    await rest("membership_events", {
      method: "POST",
      headers: { "prefer": "return=minimal" },
      body: JSON.stringify({
        source,
        event_type: eventType,
        email_normalized: email,
        external_member_id: externalMemberId,
        payload: sanitizedEvent,
      }),
    });

    const entitlement = {
      source,
      email,
      email_normalized: email,
      external_member_id: externalMemberId,
      plan_code: planCode,
      status,
      access_starts_at: startsAt,
      access_ends_at: accessEndsAt,
      last_event_at: new Date().toISOString(),
      metadata: {
        event_type: eventType,
        provider: "skool",
        cancellation_without_period_end: status === "cancelled" && !suppliedEnd,
      },
      updated_at: new Date().toISOString(),
    };

    const out = await rest("membership_entitlements?on_conflict=source,email_normalized", {
      method: "POST",
      headers: { "prefer": "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(entitlement),
    });

    return json({
      ok: true,
      source,
      status,
      plan_code: planCode,
      entitlement_updated: Array.isArray(out) ? out.length > 0 : true,
    });
  } catch (error) {
    console.error("MW membership webhook error", error);
    const message = error instanceof Error && error.message.startsWith("Invalid ") ? error.message : "MW membership update failed";
    return json({ ok: false, error: message }, message.startsWith("Invalid ") ? 400 : 500);
  }
});
