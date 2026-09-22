// MW Dynasty unified Vercel Function gateway.
// Keeps the public API paths stable while deploying one Node.js Function.
const {randomUUID}=require('crypto');
const handlers = {
  'chat': require('../server/api/chat'),
  'me': require('../server/api/me'),
  'pace-chat': require('../server/api/pace-chat'),
  'pricing': require('../server/api/pricing'),
  'billing': require('../server/api/billing'),
  'diagnostics': require('../server/api/diagnostics'),
  'founder': require('../server/api/founder'),
  'founder/ai': require('../server/api/founder-ai'),
  'stripe/checkout': require('../server/api/stripe-checkout'),
  'stripe/portal': require('../server/api/stripe-portal'),
  'profile': require('../server/api/profile'),
  'program': require('../server/api/program'),
  'assigned-program': require('../server/api/assigned-program'),
  'smart-entry': require('../server/api/smart-entry'),
  'season-calendar': require('../server/api/season-calendar'),
  'speak': require('../server/api/speak'),
  'transcribe': require('../server/api/transcribe'),
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
  const requestId=String(req.headers?.['x-mw-request-id']||'').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,80)||randomUUID();
  res.setHeader('X-MW-Request-ID',requestId);
  res.setHeader('Cache-Control','no-store, max-age=0');
  res.setHeader('Pragma','no-cache');
  res.setHeader('Vary','Authorization');
  res.setHeader('X-Robots-Tag','noindex, nofollow');

  const route = String(req.query && req.query.route || '').replace(/^\/+|\/+$/g, '');
  const length=Number(req.headers?.['content-length']||0);
  const maxRequestBytes=route==='transcribe'?4_000_000:2_000_000;
  if(Number.isFinite(length)&&length>maxRequestBytes){
    return res.status(413).json({error:'Request is too large.',requestId});
  }
  const handler = handlers[route];
  if (!handler) {
    return res.status(404).json({ error: 'MW API route not found',requestId });
  }
  try {
    return await handler(req, res);
  } catch (error) {
    const status=Number(error && error.status)||500;
    console.error('MW API gateway error:',{requestId,route,status,error});
    if (!res.headersSent) {
      if(status>=500){
        res.setHeader('Retry-After','2');
        return res.status(status).json({error:'MW service temporarily unavailable.',requestId});
      }
      return res.status(status).json({error:error && error.message || 'MW request failed',requestId});
    }
  }
};
