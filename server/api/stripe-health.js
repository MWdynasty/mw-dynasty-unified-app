const { SUPABASE_URL, SUPABASE_KEY } = require('../lib/mw-coach-auth');

const PRODUCTS = {
  mw_athlete: { base: 'Athlete Membership' },
  coach_core: { base: 'Coach Core', sponsor: 'Coach Core Sponsored Athlete' },
  coach_intelligence: { base: 'Coach Intelligence', sponsor: 'Coach Intelligence Sponsored Athlete' },
  mw_sprint_performance: { base: 'MW Sprint Performance System', sponsor: 'MW Sprint Performance Sponsored Athlete' },
};

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

function priceMatches(prices, productName, amount) {
  return (prices || []).some((item) => {
    const product = item.product && typeof item.product === 'object' ? item.product : {};
    return product.name === productName
      && item.currency === 'usd'
      && Number(item.unit_amount) === Number(amount)
      && item.recurring?.interval === 'month';
  });
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
    const [catalogResp, prices, account, webhooks, payouts] = await Promise.all([
      fetch(
        `${SUPABASE_URL}/rest/v1/membership_plans?active=eq.true&monthly_enabled=eq.true&select=plan_code,monthly_price_cents,sponsored_athlete_price_cents`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
      ),
      stripe('/prices?active=true&type=recurring&limit=100&expand[]=data.product', secret),
      stripe('/account', secret),
      stripe('/webhook_endpoints?limit=100', secret),
      stripe('/payouts?limit=1', secret),
    ]);

    const catalog = await catalogResp.json().catch(() => []);
    if (!catalogResp.ok || !prices.ok) {
      return res.status(502).json({
        ok: false, configured: true, keyKind: key.kind, mode: key.mode,
        stripeReachable: prices.ok, catalogReadable: catalogResp.ok
      });
    }

    const priceRows = prices.data?.data || [];
    const planChecks = (Array.isArray(catalog) ? catalog : []).map((plan) => {
      const names = PRODUCTS[plan.plan_code] || {};
      const baseFound = Boolean(names.base) && priceMatches(priceRows, names.base, plan.monthly_price_cents);
      const sponsorRequired = Number(plan.sponsored_athlete_price_cents || 0) > 0;
      const sponsorFound = !sponsorRequired || (Boolean(names.sponsor) && priceMatches(priceRows, names.sponsor, plan.sponsored_athlete_price_cents));
      return { planCode: plan.plan_code, baseFound, sponsorFound };
    });
    const allPricesMatched = planChecks.length > 0 && planChecks.every((p) => p.baseFound && p.sponsorFound);

    const athlete = (Array.isArray(catalog) ? catalog : []).find((p) => p.plan_code === 'mw_athlete');
    const athletePrice = priceRows.find((item) => {
      const product = item.product && typeof item.product === 'object' ? item.product : {};
      return product.name === 'Athlete Membership'
        && item.currency === 'usd'
        && Number(item.unit_amount) === Number(athlete?.monthly_price_cents || 0)
        && item.recurring?.interval === 'month';
    });

    let checkoutCreated = false;
    let checkoutExpired = false;
    if (athletePrice?.id) {
      const created = await stripe('/checkout/sessions', secret, {
        method: 'POST',
        form: {
          mode: 'subscription',
          success_url: 'https://mwdynasty.com/?mw_diagnostic=success',
          cancel_url: 'https://mwdynasty.com/?mw_diagnostic=cancel',
          'line_items[0][price]': String(athletePrice.id),
          'line_items[0][quantity]': '1',
          'metadata[mw_diagnostic]': 'launch_health_check'
        }
      });
      checkoutCreated = Boolean(created.ok && created.data?.id);
      if (checkoutCreated) {
        const expired = await stripe(`/checkout/sessions/${encodeURIComponent(created.data.id)}/expire`, secret, {
          method: 'POST', form: {}
        });
        checkoutExpired = Boolean(expired.ok);
      }
    }

    const webhookRows = Array.isArray(webhooks.data?.data) ? webhooks.data.data : [];
    const expectedWebhook = webhookRows.find((item) => String(item.url || '').includes('mw-stripe-webhook'));
    let events = Array.isArray(expectedWebhook?.enabled_events) ? expectedWebhook.enabled_events : [];
    const requiredWebhookEvents = ['customer.subscription.created','customer.subscription.updated','customer.subscription.deleted','invoice.payment_failed'];
    const eventChecks = Object.fromEntries(requiredWebhookEvents.map((name) => [name, events.includes('*') || events.includes(name)]));
    let webhookEventsReady = Boolean(expectedWebhook) && Object.values(eventChecks).every(Boolean);
    let webhookRepairAttempted = false;
    let webhookRepairSucceeded = false;

    if (expectedWebhook?.id && !webhookEventsReady) {
      webhookRepairAttempted = true;
      const mergedEvents = [...new Set([...events, ...requiredWebhookEvents])];
      const body = new URLSearchParams();
      for (const name of mergedEvents) body.append('enabled_events[]', name);
      const repairResponse = await fetch(`https://api.stripe.com/v1/webhook_endpoints/${encodeURIComponent(expectedWebhook.id)}`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${secret}:`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: body.toString()
      });
      if (repairResponse.ok) {
        const repaired = await repairResponse.json().catch(() => ({}));
        events = Array.isArray(repaired?.enabled_events) ? repaired.enabled_events : mergedEvents;
        webhookRepairSucceeded = true;
        webhookEventsReady = requiredWebhookEvents.every((name) => events.includes('*') || events.includes(name));
      }
    }

    let diagnosticSubscriptionCreated = false;
    let diagnosticSubscriptionDeleted = false;
    let diagnosticCustomerDeleted = false;
    if (webhookEventsReady && athletePrice?.id) {
      const customer = await stripe('/customers', secret, {
        method: 'POST',
        form: {
          description: 'MW Dynasty launch webhook diagnostic',
          'metadata[mw_diagnostic]': 'launch_health_check'
        }
      });
      if (customer.ok && customer.data?.id) {
        const subscription = await stripe('/subscriptions', secret, {
          method: 'POST',
          form: {
            customer: String(customer.data.id),
            'items[0][price]': String(athletePrice.id),
            trial_period_days: '1',
            'metadata[mw_user_id]': 'mw-diagnostic-invalid',
            'metadata[mw_plan_code]': 'mw_athlete',
            'metadata[mw_checkout_kind]': 'membership',
            'metadata[mw_sponsor_quantity]': '0'
          }
        });
        diagnosticSubscriptionCreated = Boolean(subscription.ok && subscription.data?.id);
        if (diagnosticSubscriptionCreated) {
          const deleted = await stripe(`/subscriptions/${encodeURIComponent(subscription.data.id)}`, secret, {
            method: 'DELETE',
            form: {}
          });
          diagnosticSubscriptionDeleted = Boolean(deleted.ok);
        }
        const deletedCustomer = await stripe(`/customers/${encodeURIComponent(customer.data.id)}`, secret, {
          method: 'DELETE',
          form: {}
        });
        diagnosticCustomerDeleted = Boolean(deletedCustomer.ok);
      }
    }

    return res.status(200).json({
      ok: Boolean(allPricesMatched && checkoutCreated && checkoutExpired && webhookEventsReady && diagnosticSubscriptionCreated && diagnosticSubscriptionDeleted && diagnosticCustomerDeleted),
      configured: true,
      keyKind: key.kind,
      mode: key.mode,
      stripeReachable: true,
      allPricesMatched,
      planChecks,
      checkoutCreated,
      checkoutExpired,
      accountReadable: account.ok,
      chargesEnabled: account.ok ? Boolean(account.data?.charges_enabled) : null,
      payoutsEnabled: account.ok ? Boolean(account.data?.payouts_enabled) : null,
      detailsSubmitted: account.ok ? Boolean(account.data?.details_submitted) : null,
      webhookListReadable: webhooks.ok,
      webhookEndpointFound: Boolean(expectedWebhook),
      webhookEventsReady,
      webhookEventChecks: Object.fromEntries(requiredWebhookEvents.map((name) => [name, events.includes('*') || events.includes(name)])),
      webhookRepairAttempted,
      webhookRepairSucceeded,
      diagnosticSubscriptionCreated,
      diagnosticSubscriptionDeleted,
      diagnosticCustomerDeleted,
      payoutsReadable: payouts.ok
    });
  } catch {
    return res.status(502).json({ ok: false, configured: true, keyKind: key.kind, mode: key.mode, error: 'health_check_failed' });
  }
};
