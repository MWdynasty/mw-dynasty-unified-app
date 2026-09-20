const { authenticate, SUPABASE_URL, SUPABASE_KEY } = require('../lib/mw-coach-auth');

const PLANS = {
  mw_athlete: {
    audience: 'athlete',
    productName: 'Athlete Membership',
    amount: 1900,
  },
  coach_core: {
    audience: 'coach',
    productName: 'Coach Core',
    amount: 4900,
    sponsorProductName: 'Coach Core Sponsored Athlete',
    sponsorAmount: 500,
  },
  coach_intelligence: {
    audience: 'coach',
    productName: 'Coach Intelligence',
    amount: 7900,
    sponsorProductName: 'Coach Intelligence Sponsored Athlete',
    sponsorAmount: 600,
  },
  mw_sprint_performance: {
    audience: 'coach',
    productName: 'MW Sprint Performance System',
    amount: 10900,
    sponsorProductName: 'MW Sprint Performance Sponsored Athlete',
    sponsorAmount: 700,
  },
};

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
    const plan = PLANS[planCode];
    if (!plan) return res.status(400).json({ error: 'Choose a valid MW membership.' });

    const sponsorQuantity = Number.isInteger(Number(body.sponsorQuantity)) ? Number(body.sponsorQuantity) : 0;
    const requestedReturnPath = String(body.returnPath || '').trim();
    const returnPath = requestedReturnPath.startsWith('/account') ? '/account/' : '';
    if (sponsorQuantity < 0 || sponsorQuantity > 250) return res.status(400).json({ error: 'Sponsor quantity must be between 0 and 250.' });
    if (plan.audience === 'athlete' && sponsorQuantity !== 0) return res.status(400).json({ error: 'Athlete memberships cannot include sponsored-athlete seats.' });

    // Checkout intentionally permits a verified/invited account that has not paid yet.
    // Product access remains locked until the Stripe webhook creates an active entitlement.
    const { token, user } = await authenticate(req);
    const profileResp = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?select=role,account_status&user_id=eq.${encodeURIComponent(user.id)}&limit=1`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` } }
    );
    const profileRows = await profileResp.json().catch(() => []);
    const profile = Array.isArray(profileRows) ? profileRows[0] : null;
    if (!profileResp.ok || !profile) return res.status(403).json({ error: 'MW profile not found for this account.' });
    const role = String(profile.role || 'athlete');
    if (!['invited','active'].includes(String(profile.account_status || ''))) return res.status(403).json({ error: 'This MW account is not eligible for checkout.' });
    if (plan.audience === 'athlete' && role !== 'athlete') return res.status(403).json({ error: 'Choose a coach membership for this account.' });
    if (plan.audience === 'coach' && !['coach', 'admin', 'founder_owner'].includes(role)) return res.status(403).json({ error: 'Choose an athlete membership for this account.' });

    const [basePrice, sponsorPrice] = await Promise.all([
      findPrice(plan.productName, plan.amount),
      sponsorQuantity ? findPrice(plan.sponsorProductName, plan.sponsorAmount) : Promise.resolve(null),
    ]);
    const base = appUrl(req);
    const form = {
      mode: 'subscription',
      customer_email: user.email || '',
      client_reference_id: user.id,
      success_url: returnPath
        ? `${base}${returnPath}?checkout=success&session_id={CHECKOUT_SESSION_ID}`
        : `${base}/${plan.audience === 'coach' ? 'coach' : 'athlete'}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: returnPath
        ? `${base}${returnPath}?checkout=cancelled`
        : `${base}/${plan.audience === 'coach' ? 'coach' : 'athlete'}/?checkout=cancelled`,
      'line_items[0][price]': basePrice,
      'line_items[0][quantity]': '1',
      'metadata[mw_user_id]': user.id,
      'metadata[mw_plan_code]': planCode,
      'metadata[mw_sponsor_quantity]': String(sponsorQuantity),
      'subscription_data[metadata][mw_user_id]': user.id,
      'subscription_data[metadata][mw_plan_code]': planCode,
      'subscription_data[metadata][mw_sponsor_quantity]': String(sponsorQuantity),
    };
    if (sponsorPrice) {
      form['line_items[1][price]'] = sponsorPrice;
      form['line_items[1][quantity]'] = String(sponsorQuantity);
    }
    const session = await stripe('/checkout/sessions', { method: 'POST', form });
    if (!session.url) throw new Error('Stripe did not return a checkout URL.');
    return res.status(200).json({ ok: true, url: session.url });
  } catch (error) {
    console.error('MW Stripe checkout error', error);
    return res.status(error.status || 500).json({ error: error.message || 'Checkout is temporarily unavailable.' });
  }
};
