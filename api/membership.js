'use strict';

const HTML = String.raw`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>MW Dynasty — Memberships</title>
<meta name="description" content="Choose the MW Dynasty athlete or coach membership experience. One complete sprint-performance system for athletes, and three levels of coaching partnership for coaches and programs.">
<style>
:root{
  --bg:#02060a;--bg2:#07111b;--panel:#081521;--panel2:#0c1d2c;
  --gold:#e7b64d;--gold2:#ffd978;--text:#f8fafc;--muted:#aeb9c4;
  --line:rgba(255,255,255,.09);--blue:#56b8ff;--shadow:0 28px 90px rgba(0,0,0,.48)
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{
  margin:0;color:var(--text);
  font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;
  background:
    radial-gradient(circle at 15% 0%,rgba(64,155,255,.12),transparent 25%),
    radial-gradient(circle at 85% 5%,rgba(231,182,77,.12),transparent 23%),
    linear-gradient(180deg,#02060a,#06101a 46%,#02060a);
}
a{color:inherit;text-decoration:none}
button{font:inherit}
.wrap{width:min(1180px,calc(100% - 32px));margin:auto}
.site-nav{position:sticky;top:0;z-index:30;border-bottom:1px solid var(--line);background:rgba(2,6,10,.83);backdrop-filter:blur(18px)}
.nav-inner{min-height:74px;display:flex;align-items:center;justify-content:space-between;gap:18px}
.brand{display:flex;align-items:center;gap:12px;min-width:0}
.brand img{width:46px;height:46px;object-fit:contain;filter:drop-shadow(0 8px 20px rgba(231,182,77,.22))}
.brand-copy b{display:block;font-size:15px;letter-spacing:.14em}.brand-copy small{display:block;margin-top:3px;color:var(--gold);font-size:8px;letter-spacing:.18em}
.nav-actions{display:flex;align-items:center;gap:10px}
.btn{border:1px solid rgba(255,255,255,.14);border-radius:13px;min-height:46px;padding:0 17px;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:950;letter-spacing:.03em;transition:.2s ease}
.btn:hover{transform:translateY(-2px)}
.btn.gold{color:#071018;background:linear-gradient(180deg,#ffe18a,#d59a26);border-color:#f5d16d;box-shadow:0 10px 32px rgba(231,182,77,.18)}
.btn.dark{background:rgba(255,255,255,.035);color:#eef4f8}
.hero{padding:58px 0 26px;text-align:center}
.eyebrow{display:inline-flex;align-items:center;gap:9px;color:var(--gold);font-weight:950;font-size:10px;letter-spacing:.2em;text-transform:uppercase}
.eyebrow:before,.eyebrow:after{content:"";width:28px;height:1px;background:rgba(231,182,77,.72)}
.hero h1{margin:16px auto 14px;max-width:980px;font-size:clamp(38px,6vw,74px);line-height:.97;letter-spacing:-.055em}
.hero h1 span{color:var(--gold2)}
.hero p{max-width:760px;margin:0 auto;color:#b8c4ce;font-size:clamp(15px,1.8vw,19px);line-height:1.6}
.role-switch{width:min(700px,100%);margin:32px auto 0;padding:7px;border-radius:18px;border:1px solid rgba(231,182,77,.24);background:rgba(255,255,255,.035);display:grid;grid-template-columns:1fr 1fr;gap:7px;box-shadow:var(--shadow)}
.role-tab{border:0;cursor:pointer;min-height:58px;border-radius:13px;background:transparent;color:#9eacb7;font-weight:950;letter-spacing:.08em;font-size:12px;transition:.2s ease}
.role-tab.active{background:linear-gradient(180deg,rgba(231,182,77,.20),rgba(231,182,77,.07));color:#fff;border:1px solid rgba(231,182,77,.46);box-shadow:inset 0 1px 0 rgba(255,255,255,.08)}
.role-tab small{display:block;margin-top:3px;color:#788a98;font-weight:750;letter-spacing:.02em;text-transform:none}
.role-tab.active small{color:#d8c18b}
.view{display:none}.view.active{display:block}
.section{padding:34px 0 82px}
.flagship{
  position:relative;overflow:hidden;border:1px solid rgba(231,182,77,.38);border-radius:30px;
  min-height:620px;background:#07121c;box-shadow:var(--shadow)
}
.flagship-bg{position:absolute;inset:0;background:
  linear-gradient(90deg,rgba(3,8,13,.98) 0%,rgba(3,8,13,.91) 42%,rgba(3,8,13,.24) 70%,rgba(3,8,13,.48) 100%),
  url('/assets/mw-v2-athlete-hero.jpg') center right/cover no-repeat}
.flagship-glow{position:absolute;inset:auto -10% -40% 30%;height:420px;background:radial-gradient(circle,rgba(231,182,77,.22),transparent 68%)}
.flagship-content{position:relative;z-index:2;padding:54px;max-width:720px}
.label{color:var(--gold);font-size:11px;font-weight:950;letter-spacing:.18em;text-transform:uppercase}
.flagship h2{font-size:clamp(42px,6vw,75px);line-height:.92;letter-spacing:-.055em;margin:14px 0 12px}
.flagship h2 span{display:block;color:var(--gold2)}
.flagship-sub{color:#c4ced6;font-size:18px;line-height:1.55;max-width:610px;margin:0}
.price-row{display:flex;align-items:flex-end;gap:12px;margin:28px 0 20px}
.price{font-size:70px;line-height:.84;font-weight:1000;letter-spacing:-.075em}.price-meta{color:#a8b5bf;font-size:14px;padding-bottom:5px}
.value-pills{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 28px}
.value-pills span{border:1px solid rgba(255,255,255,.10);background:rgba(7,18,28,.76);border-radius:999px;padding:8px 10px;color:#c5d0d7;font-size:11px;font-weight:850}
.hero-cta{display:flex;gap:10px;flex-wrap:wrap}
.promise{margin-top:18px;color:#8d9daa;font-size:11px;line-height:1.5}
.value-section{margin-top:22px;border:1px solid rgba(231,182,77,.26);border-radius:26px;background:linear-gradient(145deg,#091722,#050c12);box-shadow:var(--shadow);overflow:hidden}
.value-head{padding:31px 30px 24px;border-bottom:1px solid var(--line)}
.value-head .label{margin-bottom:8px}.value-head h3{margin:0 0 8px;font-size:clamp(28px,4vw,46px);letter-spacing:-.045em}.value-head p{margin:0;color:#9fadb8;line-height:1.6;max-width:840px}
.value-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:1px;background:var(--line)}
.value-item{padding:22px 23px;background:#07131d;display:grid;grid-template-columns:44px 1fr;gap:14px}
.value-icon{width:44px;height:44px;border-radius:13px;border:1px solid rgba(231,182,77,.26);background:linear-gradient(145deg,rgba(231,182,77,.14),rgba(86,184,255,.07));display:grid;place-items:center;color:var(--gold2);font-weight:1000}
.value-item b{display:block;margin-bottom:5px;font-size:15px}.value-item span{display:block;color:#93a3af;font-size:12px;line-height:1.5}
.system-line{padding:24px 28px;display:grid;grid-template-columns:1.2fr .8fr;gap:24px;align-items:center}
.system-line strong{display:block;font-size:20px;line-height:1.2;margin-bottom:7px}.system-line p{margin:0;color:#96a6b2;font-size:13px;line-height:1.6}.system-line strong span{color:var(--gold)}
.coach-intro{padding:6px 0 24px;text-align:center}
.coach-intro h2{font-size:clamp(36px,5vw,62px);line-height:.96;letter-spacing:-.052em;margin:13px auto;max-width:920px}
.coach-intro p{max-width:780px;margin:0 auto;color:#9eacb7;font-size:16px;line-height:1.6}
.coach-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:28px}
.plan{position:relative;overflow:hidden;border:1px solid var(--line);border-radius:25px;background:linear-gradient(160deg,#0a1823,#050b10);min-height:620px;display:flex;flex-direction:column;box-shadow:0 22px 68px rgba(0,0,0,.30)}
.plan.featured{border-color:rgba(231,182,77,.56);box-shadow:0 0 0 1px rgba(231,182,77,.08),0 28px 80px rgba(0,0,0,.42);transform:translateY(-7px)}
.plan-visual{height:190px;position:relative;background-position:center;background-size:cover}
.plan-visual:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(3,8,13,.08),#07121b 100%)}
.plan.core .plan-visual{background-image:url('/coach/core-hero-clean.jpg')}
.plan.intelligence .plan-visual{background-image:url('/coach/intelligence-hero-clean.jpg')}
.plan.performance .plan-visual{background-image:url('/coach/performance-hero-clean.jpg')}
.plan-body{padding:24px;display:flex;flex-direction:column;flex:1}
.tier{color:#82ceff;font-size:9px;font-weight:950;letter-spacing:.17em;text-transform:uppercase}
.plan.featured .tier,.plan.performance .tier{color:var(--gold2)}
.plan h3{font-size:27px;line-height:1.02;letter-spacing:-.04em;margin:10px 0 5px}
.meaning{font-size:11px;color:#f1ca69;font-weight:900;letter-spacing:.05em;margin-bottom:16px}
.amount{font-size:48px;font-weight:1000;letter-spacing:-.06em;line-height:.95}.amount small{font-size:14px;color:#8797a4;letter-spacing:0}
.sponsor{color:#8ea0ad;font-size:11px;margin:7px 0 15px}
.plan-copy{color:#9faeb9;font-size:13px;line-height:1.55;min-height:80px}
.plan ul{list-style:none;padding:0;margin:17px 0 24px;display:grid;gap:9px}
.plan li{font-size:12px;color:#c3ccd3;line-height:1.42}.plan li:before{content:"✓";color:var(--gold);font-weight:1000;margin-right:8px}
.plan .btn{margin-top:auto}
.badge{position:absolute;z-index:3;top:14px;right:14px;border:1px solid rgba(231,182,77,.44);background:rgba(4,10,15,.82);color:#f7d573;border-radius:999px;padding:7px 9px;font-size:8px;font-weight:950;letter-spacing:.12em}
.coach-path{margin-top:22px;border:1px solid rgba(231,182,77,.20);border-radius:20px;overflow:hidden;background:#061018;display:grid;grid-template-columns:repeat(3,1fr)}
.path{padding:22px;border-right:1px solid var(--line)}.path:last-child{border-right:0}.path small{display:block;color:#728796;font-size:8px;font-weight:950;letter-spacing:.14em}.path b{display:block;font-size:17px;margin:7px 0}.path span{color:#8ea0ad;font-size:11px;line-height:1.45}
.sponsor-note{margin-top:16px;padding:17px 18px;border-radius:15px;border:1px solid rgba(231,182,77,.20);background:rgba(231,182,77,.045);color:#9eacb8;font-size:12px;line-height:1.55}.sponsor-note b{color:#f5d06d}
.final{padding:0 0 82px}
.final-box{text-align:center;padding:48px 24px;border:1px solid rgba(231,182,77,.28);border-radius:27px;background:radial-gradient(circle at 50% 0%,rgba(231,182,77,.10),transparent 44%),linear-gradient(145deg,#091722,#040a0f);box-shadow:var(--shadow)}
.final-box h2{font-size:clamp(34px,5vw,58px);letter-spacing:-.05em;margin:11px auto}.final-box p{max-width:690px;color:#9facb7;margin:0 auto 22px;line-height:1.6}
footer{border-top:1px solid var(--line);padding:26px 0;color:#71818d;font-size:10px}.foot{display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap}
@media(max-width:900px){
  .coach-grid{grid-template-columns:1fr}.plan.featured{transform:none}.plan{min-height:0}.coach-path{grid-template-columns:1fr}.path{border-right:0;border-bottom:1px solid var(--line)}.path:last-child{border-bottom:0}
  .flagship{min-height:0}.flagship-bg{opacity:.40;background-position:65% center}.flagship-content{padding:42px 28px;max-width:none}.system-line{grid-template-columns:1fr}
}
@media(max-width:680px){
  .wrap{width:min(100% - 20px,1180px)}.site-nav .brand-copy small{display:none}.site-nav .brand img{width:40px;height:40px}.nav-actions .dark{display:none}
  .hero{padding-top:38px}.role-switch{margin-top:24px}.role-tab{min-height:54px;font-size:11px}.role-tab small{font-size:9px}
  .section{padding-top:22px}.flagship-content{padding:34px 20px}.flagship h2{font-size:43px}.price{font-size:60px}.flagship-sub{font-size:16px}
  .value-grid{grid-template-columns:1fr}.value-head{padding:25px 20px}.value-item{padding:19px}.system-line{padding:22px 20px}
  .coach-intro{padding-top:0}.plan-visual{height:170px}.plan-body{padding:21px}.hero-cta .btn{width:100%}
}
</style>
</head>
<body>
<nav class="site-nav">
  <div class="wrap nav-inner">
    <a class="brand" href="https://mwdynasty.com">
      <img src="/mw-official-crest.png" alt="MW Dynasty crest">
      <span class="brand-copy"><b>MW DYNASTY</b><small>SPRINT PERFORMANCE SYSTEM</small></span>
    </a>
    <div class="nav-actions">
      <a class="btn dark" href="https://mwdynasty.com">BACK TO SITE</a>
      <a class="btn gold" href="https://app.mwdynasty.com">SIGN IN</a>
    </div>
  </div>
</nav>

<header class="hero">
  <div class="wrap">
    <div class="eyebrow">Choose your path</div>
    <h1>ONE DYNASTY. <span>TWO EXPERIENCES.</span></h1>
    <p>Athletes get one complete MW Sprint Performance membership. Coaches choose the level of MW partnership that fits the way they lead their program.</p>
    <div class="role-switch" role="tablist" aria-label="Membership type">
      <button class="role-tab active" type="button" data-role="athlete" role="tab" aria-selected="true">ATHLETE<small>One complete performance system</small></button>
      <button class="role-tab" type="button" data-role="coach" role="tab" aria-selected="false">COACH<small>Three levels of coaching partnership</small></button>
    </div>
  </div>
</header>

<main>
<section class="view active" id="athlete-view" data-view="athlete">
  <div class="section">
    <div class="wrap">
      <article class="flagship">
        <div class="flagship-bg"></div><div class="flagship-glow"></div>
        <div class="flagship-content">
          <div class="label">Athlete Membership · One flagship system</div>
          <h2>MW SPRINT <span>PERFORMANCE SYSTEM</span></h2>
          <p class="flagship-sub">More than workouts. A connected environment that tells the athlete what to do, teaches them why, tracks what happened, and keeps the season moving with purpose.</p>
          <div class="price-row"><div class="price">$19</div><div class="price-meta">/ month<br>complete athlete membership</div></div>
          <div class="value-pills"><span>41-WEEK SPRINT SYSTEM</span><span>STRENGTH & POWER</span><span>SPRINT SCHOOL</span><span>COACH MW</span><span>PACE + DISTANCE TOOLS</span><span>PROGRESS TRACKING</span></div>
          <div class="hero-cta">
            <a class="btn gold" href="https://app.mwdynasty.com/athlete/start.html">START ATHLETE MEMBERSHIP →</a>
            <a class="btn dark" href="#athlete-system">SEE THE COMPLETE SYSTEM</a>
          </div>
          <div class="promise">Built for 100m · 200m · 400m development. Ages 13+.</div>
        </div>
      </article>

      <section class="value-section" id="athlete-system">
        <div class="value-head">
          <div class="label">Your complete sprint performance system</div>
          <h3>Everything works together.</h3>
          <p>The value is not a list of disconnected features. Track training, strength work, education, pacing, scheduling, accountability, and guidance are designed to operate as one athlete-development environment.</p>
        </div>
        <div class="value-grid">
          <div class="value-item"><div class="value-icon">01</div><div><b>Start at the right place</b><span>Smart Entry evaluates the athlete and places them at the appropriate point in the system.</span></div></div>
          <div class="value-item"><div class="value-icon">02</div><div><b>Complete 41-week sprint progression</b><span>Structured development for the 100m, 200m and 400m across the full training year.</span></div></div>
          <div class="value-item"><div class="value-icon">03</div><div><b>Strength & Power integration</b><span>Weight-room development supports the demands of the athlete's current sprint phase.</span></div></div>
          <div class="value-item"><div class="value-icon">04</div><div><b>Warm-ups, drills & recovery</b><span>Structured preparation and recovery with instruction on how and why each piece is performed.</span></div></div>
          <div class="value-item"><div class="value-icon">05</div><div><b>MW Sprint School</b><span>Mechanics, acceleration, blocks, max velocity and race execution—not just workouts.</span></div></div>
          <div class="value-item"><div class="value-icon">06</div><div><b>Know exactly what to do today</b><span>Daily training, lifting and training history live together in one place.</span></div></div>
          <div class="value-item"><div class="value-icon">07</div><div><b>Train at the right intensity</b><span>MW Pace Calculator and Distance Pacer help turn prescriptions into executable targets.</span></div></div>
          <div class="value-item"><div class="value-icon">08</div><div><b>Track the work that gets completed</b><span>Attendance, reps and pace execution provide accountability beyond simply opening a workout.</span></div></div>
          <div class="value-item"><div class="value-icon">09</div><div><b>Follow development over time</b><span>PRs, strength numbers, goals and athlete progress stay connected to the training journey.</span></div></div>
          <div class="value-item"><div class="value-icon">10</div><div><b>Coach MW guidance</b><span>Built-in guidance helps athletes understand terminology, purpose and the work in front of them.</span></div></div>
        </div>
        <div class="system-line">
          <div><strong><span>You’re not buying a workout plan.</span> You’re entering a connected sprint-performance system.</strong><p>MW Dynasty is designed to guide the athlete from today's session to long-term development with structure, precision and purpose.</p></div>
          <a class="btn gold" href="https://app.mwdynasty.com/athlete/start.html">BUILD YOUR DYNASTY →</a>
        </div>
      </section>
    </div>
  </div>
</section>

<section class="view" id="coach-view" data-view="coach">
  <div class="section">
    <div class="wrap">
      <div class="coach-intro">
        <div class="label">Coach memberships</div>
        <h2>CHOOSE HOW MUCH OF MW DYNASTY YOU WANT BESIDE YOU.</h2>
        <p>All three options are built for coaches and programs. The difference is whether MW serves as your operating environment, your intelligence layer, or your complete sprint-development methodology.</p>
      </div>

      <div class="coach-grid">
        <article class="plan core">
          <div class="plan-visual"></div>
          <div class="plan-body">
            <div class="tier">Level 01 · Infrastructure</div>
            <h3>MW COACH CORE</h3>
            <div class="meaning">RUN YOUR PROGRAM ON MW.</div>
            <div class="amount">$49<small>/month</small></div>
            <div class="sponsor">Sponsored athletes: +$5 each / month</div>
            <p class="plan-copy">For coaches who already have their methodology and want a professional operating environment around it.</p>
            <ul>
              <li>Roster + athlete organization</li>
              <li>Attendance + completion oversight</li>
              <li>Coach-to-athlete communication</li>
              <li>Athlete notes + performance information</li>
              <li>Practice, meet + testing calendar</li>
              <li>Manual athlete availability review</li>
            </ul>
            <a class="btn dark" href="https://app.mwdynasty.com/coach/start.html">CHOOSE CORE →</a>
          </div>
        </article>

        <article class="plan intelligence featured">
          <div class="badge">COACHING INTELLIGENCE</div>
          <div class="plan-visual"></div>
          <div class="plan-body">
            <div class="tier">Level 02 · Infrastructure + Insight</div>
            <h3>MW COACH INTELLIGENCE</h3>
            <div class="meaning">RUN YOUR PROGRAM WITH MW BESIDE YOU.</div>
            <div class="amount">$79<small>/month</small></div>
            <div class="sponsor">Sponsored athletes: +$6 each / month</div>
            <p class="plan-copy">Keep your methodology while MW adds connected context around scheduling, athlete availability and season decisions.</p>
            <ul>
              <li>Everything in Core</li>
              <li>Coach MW coaching intelligence</li>
              <li>School breaks + exam-week context</li>
              <li>Smart schedule constraints</li>
              <li>Calendar-aware season planning</li>
              <li>Athlete availability + conflict context</li>
              <li>Deeper training + performance oversight</li>
            </ul>
            <a class="btn gold" href="https://app.mwdynasty.com/coach/start.html">CHOOSE INTELLIGENCE →</a>
          </div>
        </article>

        <article class="plan performance">
          <div class="badge">COMPLETE MW METHODOLOGY</div>
          <div class="plan-visual"></div>
          <div class="plan-body">
            <div class="tier">Level 03 · Complete System</div>
            <h3>MW SPRINT PERFORMANCE</h3>
            <div class="meaning">RUN THE COMPLETE MW SYSTEM.</div>
            <div class="amount">$109<small>/month</small></div>
            <div class="sponsor">Sponsored athletes: +$7 each / month</div>
            <p class="plan-copy">For coaches and programs that want the full MW Dynasty sprint-development methodology operating through the platform.</p>
            <ul>
              <li>Everything in Intelligence</li>
              <li>41-week MW sprint progression</li>
              <li>Synchronized Strength & Power system</li>
              <li>MW Sprint School ecosystem</li>
              <li>Pacing + performance tools</li>
              <li>Smart athlete placement</li>
              <li>41-week schedule intelligence</li>
              <li>Methodology-aligned season planning</li>
            </ul>
            <a class="btn dark" href="https://app.mwdynasty.com/coach/start.html">CHOOSE SPRINT PERFORMANCE →</a>
          </div>
        </article>
      </div>

      <div class="coach-path">
        <div class="path"><small>CORE</small><b>INFRASTRUCTURE</b><span>Bring your own methodology. Use MW to operate the program around it.</span></div>
        <div class="path"><small>INTELLIGENCE</small><b>INFRASTRUCTURE + INSIGHT</b><span>Keep your methodology while MW adds intelligence around the decisions.</span></div>
        <div class="path"><small>SPRINT PERFORMANCE</small><b>COMPLETE METHODOLOGY</b><span>Use the full MW sprint, strength, education and intelligence ecosystem.</span></div>
      </div>
      <div class="sponsor-note"><b>Sponsored athlete pricing:</b> Core +$5/athlete, Intelligence +$6/athlete, Sprint Performance +$7/athlete each month. A sponsored athlete does not also pay the separate $19 individual Athlete membership while covered by that coach sponsorship.</div>
    </div>
  </div>
</section>

<section class="final">
  <div class="wrap final-box">
    <div class="eyebrow">More than sports</div>
    <h2>BUILD THE ATHLETE. BUILD THE DYNASTY.</h2>
    <p>Choose the path that fits you. Athletes enter one complete development system. Coaches choose the level of partnership they want with MW Dynasty.</p>
    <div class="hero-cta" style="justify-content:center">
      <button class="btn gold" type="button" data-jump-role="athlete">VIEW ATHLETE MEMBERSHIP</button>
      <button class="btn dark" type="button" data-jump-role="coach">VIEW COACH MEMBERSHIPS</button>
    </div>
  </div>
</section>
</main>

<footer><div class="wrap foot"><span>MW DYNASTY · SPRINT PERFORMANCE SYSTEM</span><span>Faster Athletes · Stronger People · Brighter Futures</span></div></footer>

<script>
(function(){
  var tabs=[].slice.call(document.querySelectorAll('.role-tab'));
  var views=[].slice.call(document.querySelectorAll('.view'));

  function setRole(role, updateUrl){
    role = role === 'coach' ? 'coach' : 'athlete';
    tabs.forEach(function(tab){
      var on=tab.getAttribute('data-role')===role;
      tab.classList.toggle('active',on);
      tab.setAttribute('aria-selected',on?'true':'false');
    });
    views.forEach(function(view){view.classList.toggle('active',view.getAttribute('data-view')===role);});
    if(updateUrl){
      var u=new URL(window.location.href);
      u.searchParams.set('role',role);
      history.replaceState({},'',u.pathname+u.search+u.hash);
    }
    window.scrollTo({top:0,behavior:'smooth'});
  }

  tabs.forEach(function(tab){tab.addEventListener('click',function(){setRole(tab.getAttribute('data-role'),true);});});
  document.querySelectorAll('[data-jump-role]').forEach(function(btn){
    btn.addEventListener('click',function(){setRole(btn.getAttribute('data-jump-role'),true);});
  });

  var initial=new URLSearchParams(window.location.search).get('role');
  setRole(initial==='coach'?'coach':'athlete',false);
})();
</script>
</body>
</html>`;

module.exports = async function handler(req, res) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.end(HTML);
};
