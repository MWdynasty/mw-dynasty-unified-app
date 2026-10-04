const fs = require('fs');
const assert = require('assert');
const vm = require('vm');
const component = require('./assets/mw-signin-v3.js');
const css = fs.readFileSync('assets/mw-signin-v3.css', 'utf8');
const athlete = fs.readFileSync('athlete/index.html', 'utf8');
const coachEntry = fs.readFileSync('coach/index.html', 'utf8');
const coachPath = coachEntry.match(/src="(\/coach\/app[^"?]+)(?:\?[^" ]*)?"/)[1].slice(1);
const coach = fs.readFileSync(coachPath, 'utf8');

const athleteMarkup = component.render('athlete');
const coachMarkup = component.render('coach');
function shape(html) {
  return [...html.matchAll(/<\/?([a-z][a-z\d]*)\b[^>]*>/gi)]
    .map(m => (m[0].startsWith('</') ? '/' : '') + m[1].toLowerCase());
}
function baseForm(html) { return html.match(/<form\b[\s\S]*?<\/form>/)[0]; }
assert.deepStrictEqual(shape(baseForm(athleteMarkup)), shape(baseForm(coachMarkup)), 'Both roles must use the identical form structure');
for (const role of ['athlete', 'coach']) {
  const html = component.render(role);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'No duplicate IDs in ' + role);
  assert(html.includes('data-signin-version="3"'));
  assert(html.includes('data-mw-signin-card'));
  assert(html.includes('MW Dynasty crest'));
  assert(html.includes('Keep me signed in'));
  assert(html.includes('Forgot password?'));
  assert(html.includes('autocomplete="current-password"'));
  assert(html.includes('inputmode="email"'));
  assert(html.includes('role="status" aria-live="polite"'));
  for (const label of baseForm(html).matchAll(/<label\b[^>]*>[\s\S]*?<\/label>/g)) {
    assert(!label[0].includes('<button'), 'Password toggle must not be nested inside a field label');
  }
  assert(!/class="(?:coach-login-|mwLogin)/.test(html), 'No legacy layout class may leak into the new sign-in');
  for (const id of [...html.matchAll(/<input\b[^>]*id="([^"]+)"[^>]*type="(?:email|password)"/g)].map(m => m[1])) {
    assert(html.includes('for="' + id + '"'), 'Visible label required for #' + id);
  }
}
assert(component.render('coach', {message:'<script>alert(1)</script>'}).includes('&lt;script&gt;'));
assert.throws(() => component.render('founder'), /Unknown MW sign-in role/);
const host = {setAttribute(k,v){this[k]=v;}};
component.mount(host, 'athlete');
assert.equal(host.className, 'mw-signin');
assert.equal(host['data-signin-version'], '3');
assert(host.innerHTML.includes('id="mwAuthLogin"'));

assert(athlete.includes("window.MWSignIn.mount(document.getElementById('mwAuth'),'athlete')"));
assert(coach.includes("window.MWSignIn.render('coach',{message})"), 'The actually loaded Coach bundle must use the shared component');
assert(fs.readFileSync('coach/app.js','utf8').includes("window.MWSignIn.render('coach',{message})"));
for (const entry of [athlete, coachEntry]) {
  assert(entry.includes('/assets/mw-signin-v3.css'));
  assert(entry.includes('/assets/mw-signin-v3.js'));
  assert(entry.indexOf('/assets/mw-signin-v3.js') < entry.indexOf('</head>'), 'Component must load before auth handlers bind');
}
assert(athlete.includes("querySelector('#mwAthleteLoginForm').onsubmit=e=>{e.preventDefault();login()}"));
assert(!athlete.includes("querySelector('#mwAuthPassword').onkeydown=e=>{if(e.key==='Enter')login()}"), 'Enter must not submit twice');
assert(athlete.includes("querySelector('[data-mw-signin-card]')"), 'Membership transition retains the stable card hook');
assert(css.includes('max-width: 420px'));
assert(css.includes('min-width: 0'));
assert(css.includes('font-size: 16px !important'));
assert(css.includes('min-height: 44px'));
assert(/\.mw-signin,\s*#mwAuth\.mw-signin\s*\{[^}]*position: fixed;[^}]*inset: 0;/s.test(css), 'Both roles must scroll in the same viewport-sized container');
assert(css.includes('html:has(.mw-signin:not([hidden]):not([style*="display: none"])'), 'Do not leave a second document scrollbar behind the visible sign-in');
assert(!css.includes('position: absolute'), 'The shared component must never absolutely position form elements');
const launch = fs.readFileSync('assets/mw-session-launch-live-20261004-r1.js','utf8');
assert(launch.includes('#app [data-mw-signin]'), 'Returning-session overlay must recognize the new Coach screen');

// Test the real Coach renderLogin function with its original bindLogin hook.
const renderFn = coach.slice(coach.indexOf("function renderLogin(message=''){"), coach.indexOf('/* MW coach signup tab hook */'));
let bound = false;
const context = {window:{MWSignIn:component}, app:{innerHTML:''}, bindLogin(){bound=true;}, location:{search:''}, URLSearchParams};
vm.createContext(context);
vm.runInContext(renderFn+";renderLogin('Welcome');", context);
assert(context.app.innerHTML.includes('Coach sign in'));
assert(context.app.innerHTML.includes('id="loginEmail"'));
assert.equal(bound,true);
console.log('PASS: shared sign-in structure, live entry wiring, labels, role switches, recovery hooks and launch readiness');
