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
  // New sb_secret_ keys are not JWTs. Legacy service_role keys remain JWTs.
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

    // Verify the caller's actual Auth session, then verify Founder/Admin in the database.
    const userResp = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: publicKey, authorization: auth },
    });
    if (!userResp.ok) return J({ ok: false, error: "Unauthorized" }, 401);
    const user = await userResp.json();

    const baseHeaders = elevatedHeaders(secret);
    const profileResp = await fetch(
      `${url}/rest/v1/profiles?user_id=eq.${encodeURIComponent(user.id)}&select=role,account_status&limit=1`,
      { headers: { apikey: publicKey, authorization: auth } },
    );
    if (!profileResp.ok) return J({ ok: false, error: "Authorization check failed." }, 500);
    const profileRows = await profileResp.json().catch(() => []);
    const profile = Array.isArray(profileRows) ? profileRows[0] : null;
    if (!profile || profile.account_status !== "active" || !["founder_owner", "admin"].includes(String(profile.role))) {
      return J({ ok: false, error: "Founder or admin access required." }, 403);
    }

    if (req.method === "GET") {
      const r = await fetch(
        `${url}/rest/v1/coach_access_applications?select=id,first_name,last_name,email,organization,coach_title,city,state,coaching_level,years_coaching,website_or_social,verification_method,verification_detail,athlete_count,verification_status,decision_mode,verification_score,verification_evidence,verification_checked_at,decision_reason,email_domain,payment_status,reason,status,created_at,reviewed_at,review_notes,rejection_reason,access_tier,selected_plan_code,sponsored_athlete_seats,invited_at,activated_at,coach_user_id&order=created_at.desc`,
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
        verification_status: "denied",
        decision_mode: "manual",
        decision_reason: reason || "Founder/Admin denied the Coach verification after manual review.",
        verification_checked_at: new Date().toISOString(),
        payment_status: "not_ready",
        reviewed_at: new Date().toISOString(),
        reviewed_by: user.id,
        rejection_reason: reason || null,
        review_notes: clean(body.review_notes, 1000) || null,
      });
      const journeyResp = await fetch(`${url}/rest/v1/onboarding_journeys?coach_application_id=eq.${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: elevatedHeaders(secret, { "content-type": "application/json", prefer: "return=minimal" }),
        body: JSON.stringify({
          stage: "verification",
          status: "blocked",
          verification_status: "denied",
          payment_status: "not_ready",
          updated_at: new Date().toISOString(),
        }),
      });
      if (!journeyResp.ok) console.error("Rejected coach onboarding journey update failed", journeyResp.status);
      return J({ ok: true, status: "rejected", verification_status: "denied", payment_status: "not_ready", application: updated });
    }

    if (app.status === "rejected") return J({ ok: false, error: "A rejected application cannot be approved without a new review." }, 409);
    if (["invited", "activated"].includes(String(app.status))) {
      return J({ ok: true, status: app.status, application: app, message: "This legacy coach application is already provisioned." });
    }
    if (!["pending", "approved"].includes(String(app.status))) {
      return J({ ok: false, error: "This application is not eligible for approval." }, 409);
    }

    // Founder/Admin approves the PERSON here, not a paid tier.
    // The coach chooses membership + optional sponsored seats in the next simple step.
    app = await patchApplication({
      status: "approved",
      verification_status: "approved",
      decision_mode: "manual",
      decision_reason: "Founder/Admin verified the Coach application after manual evidence review.",
      verification_checked_at: new Date().toISOString(),
      payment_status: "ready",
      access_tier: null,
      selected_plan_code: null,
      sponsored_athlete_seats: 0,
      reviewed_at: app.reviewed_at || new Date().toISOString(),
      reviewed_by: app.reviewed_by || user.id,
      review_notes: clean(body.review_notes, 1000) || app.review_notes || null,
      rejection_reason: null,
    });

    const journeyResp = await fetch(`${url}/rest/v1/onboarding_journeys?coach_application_id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: elevatedHeaders(secret, { "content-type": "application/json", prefer: "return=minimal" }),
      body: JSON.stringify({
        stage: "membership",
        status: "in_progress",
        verification_status: "approved",
        selected_plan_code: null,
        sponsored_athlete_seats: 0,
        payment_status: "ready",
        last_completed_stage: "verification",
        updated_at: new Date().toISOString(),
      }),
    });
    if (!journeyResp.ok) console.error("Coach onboarding journey update failed", journeyResp.status);

    // Create a pending-payment Coach account and let Supabase send the secure setup link.
    // The account can authenticate for membership checkout, but Coach product access remains
    // locked because there is no active coach_access_entitlement until Stripe confirms payment.
    const inviteResp = await fetch(`${url}/auth/v1/invite`, {
      method: "POST",
      headers: elevatedHeaders(secret, { "content-type": "application/json" }),
      body: JSON.stringify({
        email: app.email,
        data: {
          first_name: app.first_name,
          last_name: app.last_name,
          account_type: "coach",
          mw_application_id: id,
        },
        redirect_to: "https://app.mwdynasty.com/coach/?onboarding=membership",
      }),
    });
    const invitedUser = await jsonOrEmpty(inviteResp);
    if (!inviteResp.ok || !invitedUser?.id) {
      console.error("Coach setup invitation failed", inviteResp.status, invitedUser);
      return J({
        ok: false,
        status: "approved",
        verification_status: "approved",
        payment_status: "ready",
        error: "Coach was verified, but the secure account setup invitation could not be sent. Retry approval to resend the invitation."
      }, 502);
    }

    app = await patchApplication({
      status: "invited",
      coach_user_id: invitedUser.id,
      invited_at: new Date().toISOString(),
    });

    const linkJourneyResp = await fetch(`${url}/rest/v1/onboarding_journeys?coach_application_id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: elevatedHeaders(secret, { "content-type": "application/json", prefer: "return=minimal" }),
      body: JSON.stringify({
        user_id: invitedUser.id,
        stage: "membership",
        status: "in_progress",
        verification_status: "approved",
        payment_status: "ready",
        updated_at: new Date().toISOString(),
      }),
    });
    if (!linkJourneyResp.ok) console.error("Coach onboarding account link failed", linkJourneyResp.status);

    return J({
      ok: true,
      status: "invited",
      verification_status: "approved",
      payment_status: "ready",
      application: app,
      message: "Coach verified. A secure account setup link was sent. Membership, optional sponsored-athlete seats, and payment come next."
    });
  } catch (error) {
    console.error("MW coach applications admin error", error);
    return J({ ok: false, error: "Request failed." }, 500);
  }
});
