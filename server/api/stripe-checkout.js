const { authenticate, SUPABASE_URL, SUPABASE_KEY } = require('../lib/mw-coach-auth');

const PLAN_PRODUCTS = {
  mw_athlete: { audience: 'athlete', productName: 'Athlete Membership' },
  coach_core: { audience: 'coach', productName: 'Coach Core', sponsorProductName: 'Coach Core Sponsored Athlete' },
  coach_intelligence: { audience: 'coach', productName: 'Coach Intelligence', sponsorProductName: 'Coach Intelligence Sponsored Athlete' },
  mw_sprint_performance: { audience: 'coach', productName: 'MW Sprint Performance System', sponsorProductName: 'MW Sprint Performance Sponsored Athlete' },
};

async function loadCatalogPlan(planCode, token) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/membership_plans?plan_code=eq.${encodeURIComponent(planCode)}&active=eq.true&monthly_enabled=eq.true&select=plan_code,audience,monthly_price_cents,sponsored_athlete_price_cents&limit=1`,
    { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` } }
  );
  const rows = await response.json().catch(() => []);
  if (!response.ok) throw Object.assign(new Error('MW membership pricing is temporarily unavailable.'), { status: 503 });
  const plan = Array.isArray(rows) ? rows[0] : null;
  if (!plan) throw Object.assign(new Error('This MW membership is not currently available.'), { status: 400 });
  return plan;
}

async function markCheckoutStarted(token, planCode, sponsorQuantity, providerReference = null) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/mw_mark_membership_checkout_started`, {
    method: 'POST',
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      p_plan_code: planCode,
      p_sponsor_quantity: sponsorQuantity,
      p_provider: 'stripe',
      p_provider_reference: providerReference,
    }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw Object.assign(new Error(data?.message || data?.hint || data?.details || 'MW checkout state could not be prepared.'), { status: response.status });
  }
  return data;
}

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return req.body;
}

function appUrl(req) {
  const configured = String(process.env.MW_APP_URL || '').trim().replace(/\/$/, '');
  if (configured.startsWith('https://')) return configured;
  const host = String(req.headers?.host || '').trim();
  return host ? `https://${host}` : 'https://mwdynasty.com';
}

function stripeHeaders() {
  const secret = String(process.env.STRIPE_SECRET_KEY || '').trim();
  if (!secret.startsWith('sk_')) {
    throw Object.assign(new Error('Stripe is not configured yet.'), { status: 503 });
  }
  return { Authorization: `Basic ${Buffer.from(`${secret}:`).toString('base64')}` };
}

async function stripe(path, { method = 'GET', form } = {}) {
  const headers = stripeHeaders();
  let body;
  if (form) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    body = new URLSearchParams(form).toString();
  }
  const response = await fetch(`https://api.stripe.com/v1${path}`, { method, headers, body });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error?.message || 'Stripe could not create checkout.');
    error.status = response.status === 401 ? 503 : 400;
    throw error;
  }
  return data;
}

async function findPrice(productName, amount) {
  const data = await stripe('/prices?active=true&type=recurring&limit=100&expand[]=data.product');
  const price = (data.data || []).find((item) => {
    const product = item.product && typeof item.product === 'object' ? item.product : {};
    return product.name === productName
      && item.currency === 'usd'
      && item.unit_amount === amount
      && item.recurring?.interval === 'month';
  });
  if (!price) throw Object.assign(new Error(`MW Stripe product missing: ${productName}.`), { status: 503 });
  return price.id;
}

module.exports = async function stripeCheckout(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  try {
    const body = parseBody(req);
    const planCode = String(body.planCode || '');
    const product = PLAN_PRODUCTS[planCode];
    if (!product) return res.status(400).json({ error: 'Choose a valid MW membership.' });

    const sponsorQuantity = Number.isInteger(Number(body.sponsorQuantity)) ? Number(body.sponsorQuantity) : 0;
    const sponsorshipOnly = body.sponsorshipOnly === true;
    const requestedReturnPath = String(body.returnPath || '').trim();
    const returnPath = requestedReturnPath.startsWith('/account') ? '/account/' : '';
    if (sponsorQuantity < 0 || sponsorQuantity > 250) return res.status(400).json({ error: 'Sponsor quantity must be between 0 and 250.' });
    if (product.audience === 'athlete' && sponsorQuantity !== 0) return res.status(400).json({ error: 'Athlete memberships cannot include sponsored-athlete seats.' });
    if (sponsorshipOnly && (product.audience !== 'coach' || sponsorQuantity < 1)) return res.status(400).json({ error: 'Sponsored-seat checkout requires a Coach plan and at least one athlete seat.' });

    // Checkout intentionally permits a verified/invited account that has not paid yet.
    // Product access remains locked until the Stripe webhook creates an active entitlement.
    const { token, user } = await authenticate(req);
    const catalog = await loadCatalogPlan(planCode, token);
    if (catalog.audience !== product.audience) return res.status(409).json({ error: 'MW membership catalog mismatch.' });
    const profileResp = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?select=role,account_status&user_id=eq.${encodeURIComponent(user.id)}&limit=1`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` } }
    );
    const profileRows = await profileResp.json().catch(() => []);
    const profile = Array.isArray(profileRows) ? profileRows[0] : null;
    if (!profileResp.ok || !profile) return res.status(403).json({ error: 'MW profile not found for this account.' });
    const role = String(profile.role || 'athlete');
    if (!['invited','active'].includes(String(profile.account_status || ''))) return res.status(403).json({ error: 'This MW account is not eligible for checkout.' });
    if (product.audience === 'athlete' && role !== 'athlete') return res.status(403).json({ error: 'Choose a coach membership for this account.' });
    if (product.audience === 'coach' && !['coach', 'admin', 'founder_owner'].includes(role)) return res.status(403).json({ error: 'Choose an athlete membership for this account.' });

    const billingResp = await fetch(
      `${SUPABASE_URL}/rest/v1/billing_subscriptions?beneficiary_user_id=eq.${encodeURIComponent(user.id)}&audience=eq.${encodeURIComponent(product.audience)}&select=plan_code,status,current_period_end,provider,billing_type&limit=1`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` } }
    );
    const billingRows = await billingResp.json().catch(() => []);
    const billing = Array.isArray(billingRows) ? billingRows[0] : null;
    const stillPaid = billing && ['active','trialing','cancel_at_period_end'].includes(String(billing.status || ''))
      && (!billing.current_period_end || new Date(billing.current_period_end).getTime() > Date.now());

    if (sponsorshipOnly) {
      if (!billingResp.ok || !stillPaid) return res.status(403).json({ error: 'Activate your Coach membership before adding sponsored-athlete seats.' });
      if (String(billing.plan_code || '') !== planCode) return res.status(409).json({ error: 'Sponsored seats must use your current Coach membership tier.' });
      const sponsorResp = await fetch(
        `${SUPABASE_URL}/rest/v1/coach_sponsorship_packages?coach_user_id=eq.${encodeURIComponent(user.id)}&status=in.(active,cancel_at_period_end,past_due)&select=id,status,provider_subscription_id&limit=1`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` } }
      );
      const sponsorRows = await sponsorResp.json().catch(() => []);
      if (!sponsorResp.ok) return res.status(502).json({ error: 'Sponsored-seat billing could not be checked safely.' });
      if (Array.isArray(sponsorRows) && sponsorRows[0]) {
        return res.status(409).json({ error: 'Sponsored-seat billing is already active. Use Manage Sponsored Seats instead of starting a second subscription.' });
      }
    } else {
      if (billingResp.ok && stillPaid && String(billing.billing_type || '') === 'individual' && String(billing.provider || '') !== 'stripe') {
        return res.status(409).json({ error: 'Your active membership is managed by the App Store. Manage that membership with Apple; MW will not replace it with a second web subscription.' });
      }
      // Preserve the selected membership before leaving MW Dynasty. If checkout is abandoned,
      // the same account can resume without losing its verification or onboarding progress.
      await markCheckoutStarted(token, planCode, sponsorQuantity);
    }

    const [basePrice, sponsorPrice] = await Promise.all([
      sponsorshipOnly ? Promise.resolve(null) : findPrice(product.productName, Number(catalog.monthly_price_cents)),
      sponsorQuantity ? findPrice(product.sponsorProductName, Number(catalog.sponsored_athlete_price_cents || 0)) : Promise.resolve(null),
    ]);
    const base = appUrl(req);
    const form = {
      mode: 'subscription',
      customer_email: user.email || '',
      client_reference_id: user.id,
      success_url: returnPath
        ? `${base}${returnPath}?checkout=success&session_id={CHECKOUT_SESSION_ID}`
        : `${base}/${product.audience === 'coach' ? 'coach' : 'athlete'}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: returnPath
        ? `${base}${returnPath}?checkout=cancelled`
        : `${base}/${product.audience === 'coach' ? 'coach' : 'athlete'}/?checkout=cancelled`,
      'line_items[0][price]': sponsorshipOnly ? sponsorPrice : basePrice,
      'line_items[0][quantity]': sponsorshipOnly ? String(sponsorQuantity) : '1',
      'metadata[mw_user_id]': user.id,
      'metadata[mw_plan_code]': planCode,
      'metadata[mw_sponsor_quantity]': String(sponsorQuantity),
      'metadata[mw_checkout_kind]': sponsorshipOnly ? 'sponsorship_only' : 'membership',
      'subscription_data[metadata][mw_user_id]': user.id,
      'subscription_data[metadata][mw_plan_code]': planCode,
      'subscription_data[metadata][mw_sponsor_quantity]': String(sponsorQuantity),
      'subscription_data[metadata][mw_checkout_kind]': sponsorshipOnly ? 'sponsorship_only' : 'membership',
    };
    if (!sponsorshipOnly && sponsorPrice) {
      form['line_items[1][price]'] = sponsorPrice;
      form['line_items[1][quantity]'] = String(sponsorQuantity);
    }
    const session = await stripe('/checkout/sessions', { method: 'POST', form });
    if (!session.url) throw new Error('Stripe did not return a checkout URL.');
    // Attach the provider session only to membership onboarding. Sponsorship-only checkout
    // must never replace the Coach base membership provider.
    if (!sponsorshipOnly) await markCheckoutStarted(token, planCode, sponsorQuantity, session.id);
    return res.status(200).json({
      ok: true,
      url: session.url,
      planCode,
      sponsorQuantity,
      sponsorshipOnly,
      monthlyTotalCents: sponsorshipOnly
        ? sponsorQuantity * Number(catalog.sponsored_athlete_price_cents || 0)
        : Number(catalog.monthly_price_cents) + sponsorQuantity * Number(catalog.sponsored_athlete_price_cents || 0),
    });
  } catch (error) {
    console.error('MW Stripe checkout error', error);
    return res.status(error.status || 500).json({ error: error.message || 'Checkout is temporarily unavailable.' });
  }
};
