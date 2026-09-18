import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type, apikey, x-client-info",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};
const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...CORS };
const J = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
const clean = (v: unknown, n = 1000) => String(v ?? "").trim().slice(0, n);

function keyFromSet(envName: string) {
  const raw = Deno.env.get(envName) || "";
  if (!raw) return "";
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.default) return String(parsed.default);
  } catch {}
  return "";
}
function secretKey() {
  return keyFromSet("SUPABASE_SECRET_KEYS") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
}
function publishableKey() {
  return keyFromSet("SUPABASE_PUBLISHABLE_KEYS") || Deno.env.get("SUPABASE_ANON_KEY") || "";
}
function elevatedHeaders(key: string, extra: Record<string, string> = {}) {
  const headers: Record<string, string> = { apikey: key, ...extra };
  if (!key.startsWith("sb_secret_")) headers.authorization = `Bearer ${key}`;
  return headers;
}
async function jsonOrEmpty(resp: Response) {
  return await resp.json().catch(() => ({}));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return J({ ok: true });
  try {
    const url = Deno.env.get("SUPABASE_URL") || "";
    const secret = secretKey();
    const publicKey = publishableKey() || secret;
    const auth = req.headers.get("authorization") || "";
    if (!url || !secret || !publicKey || !auth) return J({ ok: false, error: "Unauthorized" }, 401);

    const userResp = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: publicKey, authorization: auth },
    });
    if (!userResp.ok) return J({ ok: false, error: "Unauthorized" }, 401);
    const user = await userResp.json();

    const baseHeaders = elevatedHeaders(secret);
    const profileResp = await fetch(
      `${url}/rest/v1/profiles?user_id=eq.${encodeURIComponent(user.id)}&select=role,account_status&limit=1`,
      { headers: baseHeaders },
    );
    if (!profileResp.ok) return J({ ok: false, error: "Authorization check failed." }, 500);
    const profileRows = await profileResp.json().catch(() => []);
    const profile = Array.isArray(profileRows) ? profileRows[0] : null;
    if (!profile || profile.account_status !== "active" || !["founder_owner", "admin"].includes(String(profile.role))) {
      return J({ ok: false, error: "Founder or admin access required." }, 403);
    }

    if (req.method === "GET") {
      const r = await fetch(
        `${url}/rest/v1/coach_access_applications?select=id,first_name,last_name,email,organization,coach_title,city,state,coaching_level,years_coaching,website_or_social,reason,status,created_at,reviewed_at,review_notes,rejection_reason,access_tier,invited_at,activated_at,coach_user_id&order=created_at.desc`,
        { headers: baseHeaders },
      );
      if (!r.ok) return J({ ok: false, error: "Applications could not be loaded." }, 500);
      return J({ ok: true, applications: await r.json() });
    }

    if (req.method !== "POST") return J({ ok: false, error: "Method not allowed" }, 405);
    const body = await req.json().catch(() => ({}));
    const id = clean(body.id, 100);
    const action = clean(body.action, 20);
    if (!id || !["approve", "reject"].includes(action)) return J({ ok: false, error: "Invalid request" }, 400);

    const loadApplication = async () => {
      const r = await fetch(`${url}/rest/v1/coach_access_applications?id=eq.${encodeURIComponent(id)}&select=*`, { headers: baseHeaders });
      if (!r.ok) throw new Error(`Application lookup failed (${r.status})`);
      const rows = await r.json().catch(() => []);
      return Array.isArray(rows) ? rows[0] : null;
    };
    const patchApplication = async (patch: Record<string, unknown>) => {
      const r = await fetch(`${url}/rest/v1/coach_access_applications?id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: elevatedHeaders(secret, { "content-type": "application/json", prefer: "return=representation" }),
        body: JSON.stringify(patch),
      });
      const data = await jsonOrEmpty(r);
      if (!r.ok) throw new Error(`Application update failed (${r.status})`);
      return Array.isArray(data) ? data[0] : null;
    };

    let app = await loadApplication();
    if (!app) return J({ ok: false, error: "Application not found." }, 404);

    if (action === "reject") {
      if (!["pending", "approved"].includes(String(app.status)) || app.coach_user_id) {
        return J({ ok: false, error: "This application can no longer be rejected from this workflow." }, 409);
      }
      const reason = clean(body.rejection_reason, 1000);
      const updated = await patchApplication({
        status: "rejected",
        reviewed_at: new Date().toISOString(),
        reviewed_by: user.id,
        rejection_reason: reason || null,
        review_notes: clean(body.review_notes, 1000) || null,
      });
      return J({ ok: true, status: "rejected", application: updated });
    }

    const tier = clean(body.access_tier, 40);
    if (!["core", "intelligence", "mw_sprint_performance"].includes(tier)) {
      return J({ ok: false, error: "Select a valid coach access tier." }, 400);
    }
    if (app.status === "rejected") return J({ ok: false, error: "A rejected application cannot be approved without a new review." }, 409);
    if (["invited", "activated"].includes(String(app.status))) {
      return J({ ok: true, status: app.status, tier: app.access_tier, application: app, message: "Coach approval is already provisioned." });
    }
    if (!["pending", "approved"].includes(String(app.status))) {
      return J({ ok: false, error: "This application is not eligible for approval." }, 409);
    }

    app = await patchApplication({
      status: "approved",
      access_tier: tier,
      reviewed_at: app.reviewed_at || new Date().toISOString(),
      reviewed_by: app.reviewed_by || user.id,
      review_notes: clean(body.review_notes, 1000) || app.review_notes || null,
      rejection_reason: null,
    });

    let coachId = app?.coach_user_id || null;
    if (!coachId) {
      const invite = await fetch(`${url}/auth/v1/invite`, {
        method: "POST",
        headers: elevatedHeaders(secret, { "content-type": "application/json" }),
        body: JSON.stringify({
          email: app.email,
          data: {
            first_name: app.first_name,
            last_name: app.last_name,
            coach_organization: app.organization || null,
            coach_title: app.coach_title || null,
            mw_access_tier: tier,
            mw_application_id: id,
          },
        }),
      });
      const inviteData: any = await jsonOrEmpty(invite);
      if (!invite.ok) {
        const existing = invite.status === 422;
        return J({
          ok: false,
          status: "approved",
          retryable: !existing,
          error: existing
            ? "This email already belongs to an Auth account. Founder review is required before linking it to a coach application."
            : (inviteData?.msg || inviteData?.message || "Coach invitation could not be sent."),
        }, existing ? 409 : 502);
      }
      coachId = inviteData?.id || inviteData?.user?.id;
      if (!coachId) return J({ ok: false, status: "approved", retryable: true, error: "Invitation sent but coach account ID was not returned." }, 502);
      app = await patchApplication({ coach_user_id: coachId, invited_at: new Date().toISOString() });
    }

    const entitlementResp = await fetch(`${url}/rest/v1/coach_access_entitlements?on_conflict=coach_user_id`, {
      method: "POST",
      headers: elevatedHeaders(secret, { "content-type": "application/json", prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify({
        coach_user_id: coachId,
        access_tier: tier,
        status: "active",
        approved_by: user.id,
        application_id: id,
        updated_at: new Date().toISOString(),
      }),
    });
    if (!entitlementResp.ok) {
      return J({ ok: false, status: "approved", retryable: true, error: "Coach was invited, but access entitlement could not be created. Retry approval or review the account." }, 502);
    }

    const activateProfile = await fetch(`${url}/rest/v1/profiles?user_id=eq.${encodeURIComponent(coachId)}`, {
      method: "PATCH",
      headers: elevatedHeaders(secret, { "content-type": "application/json", prefer: "return=minimal" }),
      body: JSON.stringify({ role: "coach", account_status: "active", coach_organization: clean(app.organization, 160) || null, coach_title: clean(app.coach_title, 120) || null, updated_at: new Date().toISOString() }),
    });
    if (!activateProfile.ok) {
      return J({ ok: false, status: "approved", retryable: true, error: "Coach entitlement exists, but profile activation needs to be retried." }, 502);
    }

    const finalApp = await patchApplication({
      status: "invited",
      access_tier: tier,
      coach_user_id: coachId,
      invited_at: app?.invited_at || new Date().toISOString(),
    });

    return J({ ok: true, status: "invited", tier, application: finalApp, message: "Coach approved and invitation sent." });
  } catch (error) {
    console.error("MW coach applications admin error", error);
    return J({ ok: false, error: "Request failed." }, 500);
  }
});
