// MW Dynasty unified Vercel Function gateway.
// Keeps the public API paths stable while deploying one Node.js Function.
const handlers = {
  'chat': require('../server/api/chat'),
  'me': require('../server/api/me'),
  'pace-chat': require('../server/api/pace-chat'),
  'pricing': require('../server/api/pricing'),
  'billing': require('../server/api/billing'),
  'stripe/checkout': require('../server/api/stripe-checkout'),
  'profile': require('../server/api/profile'),
  'program': require('../server/api/program'),
  'assigned-program': require('../server/api/assigned-program'),
  'smart-entry': require('../server/api/smart-entry'),
  'season-calendar': require('../server/api/season-calendar'),
  'speak': require('../server/api/speak'),
  'status': require('../server/api/status'),
  'coach/access': require('../server/api/coach/access'),
  'coach/athlete': require('../server/api/coach/athlete'),
  'coach/invite': require('../server/api/coach/invite'),
  'coach/notifications': require('../server/api/coach/notifications'),
  'coach/program-import': require('../server/api/coach/program-import'),
  'coach/attendance': require('../server/api/coach/attendance'),
  'coach/coach-mw': require('../server/api/coach/coach-mw'),
  'coach/program': require('../server/api/coach/program'),
  'coach/performance': require('../server/api/coach/performance'),
  'coach/progression': require('../server/api/coach/progression'),
  'coach/roster': require('../server/api/coach/roster')
};

module.exports = async function mwGateway(req, res) {
  const route = String(req.query && req.query.route || '').replace(/^\/+|\/+$/g, '');
  const handler = handlers[route];
  if (!handler) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(404).json({ error: 'MW API route not found' });
  }
  try {
    return await handler(req, res);
  } catch (error) {
    console.error('MW API gateway error:', route, error);
    if (!res.headersSent) {
      return res.status(error && error.status || 500).json({ error: error && error.message || 'MW server error' });
    }
  }
};
