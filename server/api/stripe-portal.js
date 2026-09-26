const { authenticate, SUPABASE_URL, SUPABASE_KEY } = require('../lib/mw-coach-auth');

function appUrl(req) {
  const configured = String(process.env.MW_APP_URL || '').trim().replace(/\/$/, '');
  if (configured.startsWith('https://')) return configured;
  const host = String(req.headers?.host || '').trim();
  return host ? `https://${host}` : 'https://app.mwdynasty.com';
}

function stripeHeaders() {
  const secret = String(process.env.STRIPE_SECRET_KEY || '').trim();
  const isStripeServerKey = secret.startsWith('sk_') || secret.startsWith('rk_');
  if (!isStripeServerKey) {
    throw Object.assign(new Error('Stripe is not configured yet.'), { status: 503 });
  }
  return {
    Authorization: `Basic ${Buffer.from(`${secret}:`).toString('base64')}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  };
}

module.exports = async function stripePortal(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  try {
    const { token, user } = await authenticate(req);
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const sponsorshipOnly = body.sponsorshipOnly === true;
    const lookupUrl = sponsorshipOnly
      ? `${SUPABASE_URL}/rest/v1/coach_sponsorship_packages?select=provider,metadata,updated_at,status&coach_user_id=eq.${encodeURIComponent(user.id)}&status=in.(active,cancel_at_period_end,past_due)&order=updated_at.desc&limit=1`
      : `${SUPABASE_URL}/rest/v1/billing_subscriptions?select=provider,metadata,updated_at&beneficiary_user_id=eq.${encodeURIComponent(user.id)}&order=updated_at.desc&limit=1`;
    const lookup = await fetch(lookupUrl, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    });
    const rows = await lookup.json().catch(() => []);
    if (!lookup.ok) {
      throw Object.assign(new Error(rows?.message || 'MW billing lookup failed.'), { status: lookup.status });
    }

    const billing = Array.isArray(rows) ? rows[0] : null;
    const customerId = billing?.metadata?.stripe_customer_id;
    if (billing?.provider !== 'stripe' || !customerId) {
      return res.status(409).json({ error: sponsorshipOnly ? 'No sponsored-seat billing profile is connected to this Coach account yet.' : 'No Stripe billing profile is connected to this account yet.' });
    }

    const response = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: stripeHeaders(),
      body: new URLSearchParams({
        customer: String(customerId),
        return_url: `${appUrl(req)}/account/`,
      }).toString(),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw Object.assign(new Error(data?.error?.message || 'Stripe billing portal is unavailable.'), { status: 400 });
    }
    if (!data.url) throw new Error('Stripe did not return a billing portal URL.');

    return res.status(200).json({ ok: true, url: data.url });
  } catch (error) {
    console.error('MW Stripe portal error', error);
    return res.status(error.status || 500).json({ error: error.message || 'Billing portal is temporarily unavailable.' });
  }
};