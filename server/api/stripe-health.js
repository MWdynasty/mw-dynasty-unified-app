const { SUPABASE_URL, SUPABASE_KEY } = require('../lib/mw-coach-auth');

function classifyKey(secret) {
  if (secret.startsWith('sk_live_')) return { kind: 'secret', mode: 'live' };
  if (secret.startsWith('sk_test_')) return { kind: 'secret', mode: 'test' };
  if (secret.startsWith('rk_live_')) return { kind: 'restricted', mode: 'live' };
  if (secret.startsWith('rk_test_')) return { kind: 'restricted', mode: 'test' };
  if (secret.startsWith('sk_')) return { kind: 'secret', mode: 'unknown' };
  if (secret.startsWith('rk_')) return { kind: 'restricted', mode: 'unknown' };
  return { kind: 'invalid', mode: 'unknown' };
}

async function stripe(path, secret, options = {}) {
  const headers = {
    Authorization: `Basic ${Buffer.from(`${secret}:`).toString('base64')}`,
    ...(options.form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
  };
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.form ? new URLSearchParams(options.form).toString() : undefined,
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

module.exports = async function stripeHealth(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ ok: false });

  const secret = String(process.env.STRIPE_SECRET_KEY || '').trim();
  const key = classifyKey(secret);
  if (key.kind === 'invalid') {
    return res.status(503).json({ ok: false, configured: false, keyKind: key.kind, mode: key.mode });
  }

  try {
    const catalogResp = await fetch(
      `${SUPABASE_URL}/rest/v1/membership_plans?plan_code=eq.mw_athlete&active=eq.true&monthly_enabled=eq.true&select=monthly_price_cents&limit=1`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    const catalogRows = await catalogResp.json().catch(() => []);
    const amount = Number(Array.isArray(catalogRows) && catalogRows[0]?.monthly_price_cents || 0);

    const prices = await stripe('/prices?active=true&type=recurring&limit=100&expand[]=data.product', secret);
    if (!prices.ok) {
      return res.status(502).json({
        ok: false, configured: true, keyKind: key.kind, mode: key.mode,
        stripeReachable: false, stripeStatus: prices.status
      });
    }

    const price = (prices.data?.data || []).find((item) => {
      const product = item.product && typeof item.product === 'object' ? item.product : {};
      return product.name === 'Athlete Membership'
        && item.currency === 'usd'
        && Number(item.unit_amount) === amount
        && item.recurring?.interval === 'month';
    });

    if (!price?.id) {
      return res.status(503).json({
        ok: false, configured: true, keyKind: key.kind, mode: key.mode,
        stripeReachable: true, priceMatched: false, expectedAmountCents: amount
      });
    }

    const created = await stripe('/checkout/sessions', secret, {
      method: 'POST',
      form: {
        mode: 'subscription',
        success_url: 'https://mwdynasty.com/?mw_diagnostic=success',
        cancel_url: 'https://mwdynasty.com/?mw_diagnostic=cancel',
        'line_items[0][price]': String(price.id),
        'line_items[0][quantity]': '1',
        'metadata[mw_diagnostic]': 'launch_health_check'
      }
    });

    if (!created.ok || !created.data?.id) {
      return res.status(502).json({
        ok: false, configured: true, keyKind: key.kind, mode: key.mode,
        stripeReachable: true, priceMatched: true, checkoutCreated: false,
        stripeStatus: created.status
      });
    }

    const expired = await stripe(`/checkout/sessions/${encodeURIComponent(created.data.id)}/expire`, secret, {
      method: 'POST',
      form: {}
    });

    return res.status(expired.ok ? 200 : 502).json({
      ok: Boolean(expired.ok),
      configured: true,
      keyKind: key.kind,
      mode: key.mode,
      stripeReachable: true,
      priceMatched: true,
      checkoutCreated: true,
      checkoutExpired: Boolean(expired.ok),
      stripeStatus: expired.status
    });
  } catch (error) {
    return res.status(502).json({
      ok: false, configured: true, keyKind: key.kind, mode: key.mode,
      error: 'health_check_failed'
    });
  }
};
