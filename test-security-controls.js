const fs=require('fs');
const assert=require('node:assert/strict');
const path=require('path');
const root=__dirname;
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
let failures=[];
const ok=(cond,msg)=>{if(!cond)failures.push(msg)};
const includes=(p,s,msg)=>ok(read(p).includes(s),msg||`${p} missing ${s}`);

const vercel=JSON.parse(read('vercel.json'));
const globalHeaders=vercel.headers.find(x=>x.source==='/(.*)')?.headers||[];
const apiHeaders=vercel.headers.find(x=>x.source==='/api/(.*)')?.headers||[];
const header=(list,key)=>list.find(x=>String(x.key).toLowerCase()===key.toLowerCase())?.value||'';

ok(header(globalHeaders,'Strict-Transport-Security').includes('max-age=31536000'),'HSTS must be enabled');
ok(header(globalHeaders,'X-Content-Type-Options')==='nosniff','nosniff header missing');
ok(header(globalHeaders,'X-Frame-Options')==='DENY','frame denial missing');
ok(header(globalHeaders,'Referrer-Policy')==='strict-origin-when-cross-origin','referrer policy missing');
ok(header(globalHeaders,'Content-Security-Policy').includes("object-src 'none'"),'CSP object-src protection missing');
ok(header(globalHeaders,'Content-Security-Policy').includes("frame-ancestors 'none'"),'CSP frame-ancestors missing');
ok(header(apiHeaders,'Cache-Control').includes('no-store'),'API no-store header missing');

includes('lib/mw-resilience.js','MW_OFFLINE_WRITE_BLOCKED','offline write compensating control missing');
includes('lib/mw-resilience.js',"setMode('degraded'",'degraded control mode missing');
includes('mw-sw.js',"networkFirst(request)",'cached network-first recovery missing');
includes('api/mw.js','X-MW-Request-ID','API request correlation missing');
includes('api/mw.js','MW service temporarily unavailable.','sanitized 5xx response missing');
includes('server/api/diagnostics.js','mw_security_event_from_diagnostic','diagnostic-to-incident promotion missing');
includes('assets/mw-diagnostics.js','mwFounderSupabaseSession','Founder diagnostics session support missing');
includes('assets/mw-web-analytics.js',"track('client_error'",'public website client-error detection missing');
includes('assets/mw-web-analytics.js',"track('availability_degraded'",'public website availability detection missing');

includes('index.html','/lib/mw-resilience.js','website resilience layer missing');
includes('athlete/index.html','/lib/mw-resilience.js','Athlete resilience layer missing');
includes('coach/index.html','/lib/mw-resilience.js','Coach resilience layer missing');
includes('founder/index.html','/assets/mw-diagnostics.js','Founder diagnostics missing');

includes('server/api/founder.js','mw_founder_security_controls_snapshot','Founder CIA control snapshot missing');
includes('founder/index.html','SECURITY · CIA TRIAD · CONTROL SYSTEM','Founder CIA dashboard missing');
includes('founder/index.html','Compensating','Founder compensating-control view missing');

includes('SECURITY_CONTROL_FRAMEWORK.md','Fail closed','security governance standard missing');
includes('supabase/migrations/20260921_company_security_control_framework.sql','company_security_controls','security-control migration missing');
includes('supabase/migrations/20260921_public_web_security_signals.sql','availability_degraded','public website security signal migration missing');


includes('server/api/status.js',"/auth/v1/health",'Health must check the actual auth provider');
includes('server/api/status.js',"authentication:auth",'Health must distinguish auth reachability');
ok(!read('server/api/status.js').includes('auth:true'),'Health must not report hardcoded auth health');

if(failures.length){
  console.error('\nMW security baseline FAILED:\n- '+failures.join('\n- ')+'\n');
  process.exit(1);
}
// Probe behavior is deterministic and never calls a live service in CI.
const health=require('./server/api/status');
const originalFetch=global.fetch;
async function checkHealth(responseOk){
  let status,body,headers={};
  global.fetch=async(url,init)=>{
    assert.ok(String(url).endsWith('/auth/v1/health'),'must probe auth dependency');
    assert.equal(init.method,'GET');
    assert.ok(init.signal,'health check must have a deadline');
    return {ok:responseOk};
  };
  await health({method:'GET'},{
    setHeader:(key,value)=>{headers[key]=value},
    status(code){status=code;return this},
    json(value){body=value;return this}
  });
  assert.equal(status,responseOk?200:503);
  assert.equal(body.ok,responseOk);
  assert.equal(body.dependencies.authentication,responseOk?'reachable':'unavailable');
  assert.equal(body.dependencies.database,'not_checked');
  assert.equal(body.dependencies.authorization,'not_checked');
  assert.equal(headers['X-MW-Health'],responseOk?'reachable':'degraded');
}
(async()=>{
  try{
    await checkHealth(true);
    await checkHealth(false);
    console.log('MW security baseline and dependency health probes passed.');
  }finally{global.fetch=originalFetch}
})().catch(e=>{console.error(e);process.exitCode=1});
