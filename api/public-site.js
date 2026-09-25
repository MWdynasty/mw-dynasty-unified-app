'use strict';

const UPSTREAM = 'https://mw-dynasty.irisblue2016.chatgpt.site';
const PUBLIC_HOST = 'https://mwdynasty.com';
const APP_HOST = 'https://app.mwdynasty.com';

function cleanPath(value) {
  if (Array.isArray(value)) return value.join('/');
  return String(value || '').replace(/^\/+/, '');
}

function buildQuery(query) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query || {})) {
    if (key === 'path' || value == null) continue;
    if (Array.isArray(value)) value.forEach(v => params.append(key, String(v)));
    else params.append(key, String(value));
  }
  const qs = params.toString();
  return qs ? '?' + qs : '';
}

function enhancementScript() {
  return `
<script id="mw-public-site-enhancement">
(() => {
  const APP = 'https://app.mwdynasty.com';
  const STYLE_ID = 'mw-system-detail-style';
  const MEMBERSHIPS = '/memberships';

  function wireMembershipLinks() {
    const links = [...document.querySelectorAll('a')];
    for (const a of links) {
      const label = (a.textContent || '').replace(/\\s+/g,' ').trim().toUpperCase();
      if (label === 'ATHLETES' || label.includes("I'M AN ATHLETE") || label.includes('I’M AN ATHLETE')) {
        a.href = MEMBERSHIPS + '#athletes';
      } else if (label === 'COACHES' || label.includes("I'M A COACH") || label.includes('I’M A COACH')) {
        a.href = MEMBERSHIPS + '#coaches';
      } else if (label.includes('MEMBERSHIP UPDATES')) {
        a.href = MEMBERSHIPS;
      }
    }
  }

  function rewriteAthleteMembershipCopy() {
    const replacements = new Map([
      ['WHAT YOU GET', 'YOUR COMPLETE SPRINT PERFORMANCE SYSTEM'],
      ['Smart Entry Assessment + personalized starting week', 'Start at the right place — MW evaluates the athlete and places them at the appropriate point in the training system.'],
      ['41-week sprint progression for 100m, 200m + 400m', 'A complete 41-week sprint progression built for the 100m, 200m and 400m.'],
      ['MW Strength & Power sessions', 'Strength & Power training integrated with sprint work so the weight room supports what happens on the track.'],
      ['Big Warm-Up, sprint drills + cool-down teaching', 'Structured warm-ups, sprint drills and recovery with instruction on how and why each piece is performed.'],
      ['Sprint School: mechanics, blocks, acceleration + race execution', 'MW Sprint School teaches mechanics, acceleration, block starts and race execution—not just workouts.'],
      [\`Today’s workout + complete training history\`, \`Know exactly what to do today with daily training, lifting and a complete training history in one place.\`],
      ['Pace Calculator + Distance Pacer', 'Train at the right intensity using the MW Pace Calculator and Distance Pacer.'],
      ['Attendance, pace compliance + reps-completed tracking', 'Track the work that actually gets completed including attendance, reps and pace execution.'],
      ['PRs, maxes, goals + athlete progress profile', 'Follow your development over time with PRs, strength numbers, goals and athlete progress.'],
      ['Coach MW guidance whenever you need it', 'Coach MW is built into the system to help athletes understand their training whenever they need guidance.'],
      ['iPhone + Android athlete-app access', 'Train anywhere with access through the MW Dynasty athlete platform.']
    ]);

    let changed = 0;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    for (const node of nodes) {
      const raw = node.nodeValue || '';
      const normalized = raw.replace(/\\s+/g, ' ').trim();
      if (!normalized) continue;
      for (const [from, to] of replacements) {
        if (normalized === from) {
          node.nodeValue = raw.replace(from, to);
          changed += 1;
          break;
        }
      }
    }
    return changed;
  }

  function addStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = \`
      #mw-system-detail-panel{margin:34px auto 0;max-width:1180px;padding:0 18px 8px;color:#f7f7f5}
      #mw-system-detail-panel *{box-sizing:border-box}
      .mw-detail-shell{border:1px solid rgba(226,181,72,.35);border-radius:24px;background:linear-gradient(145deg,rgba(7,14,20,.98),rgba(2,7,11,.98));box-shadow:0 26px 70px rgba(0,0,0,.32);overflow:hidden}
      .mw-detail-head{padding:30px 30px 22px;border-bottom:1px solid rgba(255,255,255,.08)}
      .mw-detail-kicker{font-size:11px;font-weight:900;letter-spacing:.18em;color:#e2b548;text-transform:uppercase}
      .mw-detail-head h3{margin:10px 0 10px;font-size:clamp(26px,4vw,44px);line-height:1.02;letter-spacing:-.035em;color:#fff}
      .mw-detail-head p{margin:0;max-width:900px;color:#b8c2ca;font-size:15px;line-height:1.65}
      .mw-detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:1px;background:rgba(255,255,255,.08)}
      .mw-detail-card{padding:24px 26px;background:#07121a}
      .mw-detail-card small{display:block;color:#e2b548;font-size:10px;font-weight:900;letter-spacing:.14em;margin-bottom:8px}
      .mw-detail-card b{display:block;color:#fff;font-size:18px;margin-bottom:8px}
      .mw-detail-card span{display:block;color:#9eacb7;font-size:13px;line-height:1.55}
      .mw-detail-bottom{display:grid;grid-template-columns:1.1fr .9fr;gap:20px;padding:26px 30px;align-items:center}
      .mw-detail-bottom strong{display:block;font-size:20px;color:#fff;margin-bottom:8px}
      .mw-detail-bottom p{margin:0;color:#9eacb7;font-size:13px;line-height:1.6}
      .mw-detail-actions{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap}
      .mw-detail-btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 18px;border-radius:12px;font-size:12px;font-weight:900;text-decoration:none!important}
      .mw-detail-btn.primary{background:linear-gradient(180deg,#f1ce71,#d89b25);color:#071018!important;border:1px solid #f4d77f}
      .mw-detail-btn.secondary{background:rgba(255,255,255,.04);color:#fff!important;border:1px solid rgba(255,255,255,.14)}
      @media(max-width:720px){.mw-detail-grid,.mw-detail-bottom{grid-template-columns:1fr}.mw-detail-actions{justify-content:flex-start}.mw-detail-head,.mw-detail-bottom{padding:22px}.mw-detail-card{padding:20px 22px}}
    \`;
    document.head.appendChild(style);
  }

  function findSystemSection() {
    const nodes = [...document.querySelectorAll('section,main,div')];
    return nodes.find(el => {
      const t = (el.innerText || '').replace(/\\s+/g,' ').trim();
      return t.includes('EVERYTHING YOU NEED. ALL IN ONE PLACE.') &&
             t.includes('SPRINT PERFORMANCE') &&
             t.includes('STRENGTH & POWER');
    });
  }

  function enhance() {
    if (document.getElementById('mw-system-detail-panel')) return true;
    const section = findSystemSection();
    if (!section) return false;
    addStyles();
    const panel = document.createElement('div');
    panel.id = 'mw-system-detail-panel';
    panel.innerHTML = \`
      <div class="mw-detail-shell">
        <div class="mw-detail-head">
          <div class="mw-detail-kicker">What the athlete is actually getting</div>
          <h3>NOT A FOLDER OF WORKOUTS. A CONNECTED DEVELOPMENT SYSTEM.</h3>
          <p>MW Dynasty connects the work on the track, the work in the weight room, the education behind it, the performance tools, the athlete's schedule, and the decisions that shape the season. The value is not ten separate features. The value is that the pieces are built to work together.</p>
        </div>
        <div class="mw-detail-grid">
          <div class="mw-detail-card"><small>01 · TRAIN</small><b>41-week sprint progression</b><span>Structured development for the 100m, 200m, and 400m across acceleration, max velocity, speed endurance, race execution, recovery, and competition preparation.</span></div>
          <div class="mw-detail-card"><small>02 · STRENGTHEN</small><b>Track-synchronized Strength & Power</b><span>The weight room follows the mission of the track phase so strength work supports speed development instead of competing with it.</span></div>
          <div class="mw-detail-card"><small>03 · LEARN</small><b>Sprint School + Coach MW</b><span>Athletes learn mechanics, starts, acceleration, race strategy, warm-ups, drills, and the reason behind the work—with guidance available when questions happen.</span></div>
          <div class="mw-detail-card"><small>04 · MEASURE</small><b>Pacing, distance, PRs + accountability</b><span>Performance targets, distance tools, workout completion, pace compliance, PR information, and athlete progress live in one connected environment.</span></div>
          <div class="mw-detail-card"><small>05 · ENTER SMARTER</small><b>Smart Entry assessment</b><span>Athletes who join mid-season can be placed into the system based on their events, PRs, strength background, experience, goals, and current training state.</span></div>
          <div class="mw-detail-card"><small>06 · PLAN REAL LIFE</small><b>Schedule awareness without losing the program</b><span>Independent athletes can add school, exams, work, travel, and unavailable dates. Coach-managed athletes report conflicts while the coach remains the authority over the official schedule.</span></div>
        </div>
        <div class="mw-detail-bottom">
          <div>
            <strong>One membership. One connected development environment.</strong>
            <p>The athlete should know what to do, why it matters, how fast to do it, what is happening around the training, and what comes next.</p>
          </div>
          <div class="mw-detail-actions">
            <a class="mw-detail-btn primary" href="/memberships#athletes">VIEW ATHLETE MEMBERSHIP</a>
            <a class="mw-detail-btn secondary" href="/memberships#coaches">VIEW COACH MEMBERSHIPS</a>
          </div>
        </div>
      </div>
    \`;
    section.appendChild(panel);
    return true;
  }

  wireMembershipLinks();
  rewriteAthleteMembershipCopy();

  if (!enhance()) {
    const observer = new MutationObserver(() => {
      wireMembershipLinks();
      rewriteAthleteMembershipCopy();
      if (enhance()) observer.disconnect();
    });
    observer.observe(document.documentElement,{subtree:true,childList:true});
    setTimeout(()=>observer.disconnect(),12000);
  }

  document.addEventListener('click', e => {
    setTimeout(rewriteAthleteMembershipCopy, 40);
    setTimeout(rewriteAthleteMembershipCopy, 180);
    setTimeout(rewriteAthleteMembershipCopy, 500);
    const a = e.target.closest?.('a');
    if (!a) return;
    const label = (a.textContent || '').toLowerCase();
    if (label.includes('enter the app')) {
      if (!a.href || a.href.includes('chatgpt.site')) a.href = APP;
    }
  }, true);
})();
</script>`;
}

module.exports = async function handler(req, res) {
  const ua = String(req.headers['user-agent'] || '');
  const path = cleanPath(req.query && req.query.path);
  const suffix = path ? '/' + path : '/';
  const query = buildQuery(req.query);

  if (/MWDynasty-iOS\//i.test(ua)) {
    res.statusCode = 307;
    res.setHeader('Location', APP_HOST + suffix + query);
    return res.end();
  }

  const upstreamUrl = UPSTREAM + suffix + query;

  try {
    const headers = {};
    if (ua) headers['user-agent'] = ua;
    if (req.headers.accept) headers.accept = req.headers.accept;
    if (req.headers['accept-language']) headers['accept-language'] = req.headers['accept-language'];

    const upstream = await fetch(upstreamUrl, {
      method: req.method === 'HEAD' ? 'HEAD' : 'GET',
      headers,
      redirect: 'follow'
    });

    res.statusCode = upstream.status;
    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);
    const cacheControl = upstream.headers.get('cache-control');
    if (cacheControl) res.setHeader('Cache-Control', cacheControl);

    if (req.method === 'HEAD') return res.end();

    const buffer = Buffer.from(await upstream.arrayBuffer());

    if (contentType.includes('text/html')) {
      let html = buffer.toString('utf8');
      html = html.split(UPSTREAM).join(PUBLIC_HOST);
      html = html.replace(/<\/body>/i, enhancementScript() + '</body>');
      return res.end(html);
    }

    return res.end(buffer);
  } catch (error) {
    console.error('MW public site proxy failed', error);
    res.statusCode = 502;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.end('MW Dynasty website is temporarily unavailable.');
  }
};
