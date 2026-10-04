(()=> {
  'use strict';
  const script = document.currentScript;
  const role = script?.dataset?.mwLaunchRole || 'app';
  const sessionKey = role === 'athlete' ? 'mwSupabaseSession' : role === 'coach' ? 'mwCoachSupabaseSession' : '';
  const hasSession = () => {
    try { return Boolean(localStorage.getItem(sessionKey) || sessionStorage.getItem(sessionKey)); } catch (_) { return false; }
  };
  if (!sessionKey || !hasSession()) return;

  const css = `
    #mwSessionLaunch{position:fixed;inset:0;z-index:100000;display:grid;place-items:center;overflow:hidden;background:
      radial-gradient(circle at 50% 35%,rgba(42,126,171,.22),transparent 28%),
      radial-gradient(circle at 50% 48%,rgba(232,186,77,.10),transparent 45%),
      linear-gradient(180deg,#07141d 0%,#02080c 68%,#010406 100%);
      color:#fff;text-align:center;padding:24px;opacity:1;visibility:visible;
      transition:opacity .28s ease,visibility .28s ease}
    #mwSessionLaunch.is-done{opacity:0;visibility:hidden;pointer-events:none}
    .mwSessionLaunchInner{display:grid;justify-items:center;gap:15px;transform:translateY(-2vh)}
    .mwSessionLaunchOrb{position:relative;display:grid;place-items:center;width:174px;height:174px}
    .mwSessionLaunchOrb:before,.mwSessionLaunchOrb:after{content:"";position:absolute;border-radius:50%;border:1px solid rgba(232,186,77,.30);animation:mwSessionRing 1.8s ease-out infinite}
    .mwSessionLaunchOrb:before{inset:10px}.mwSessionLaunchOrb:after{inset:-8px;animation-delay:.6s;opacity:.55}
    .mwSessionLaunchOrb img{position:relative;z-index:2;width:130px;height:130px;border-radius:28px;object-fit:cover;box-shadow:0 24px 70px rgba(0,0,0,.5),0 0 0 1px rgba(232,186,77,.42),0 0 46px rgba(232,186,77,.13);animation:mwSessionPulse 1.35s ease-in-out infinite}
    .mwSessionLaunchTitle{color:#e8ba4d;font-size:14px;font-weight:900;letter-spacing:.16em}
    .mwSessionLaunchSub{color:#8ba0ad;font-size:9px;font-weight:800;letter-spacing:.22em}
    .mwSessionLaunchLine{width:128px;height:2px;border-radius:99px;overflow:hidden;background:#16232b;margin-top:2px}
    .mwSessionLaunchLine i{display:block;width:42%;height:100%;background:linear-gradient(90deg,transparent,#e8ba4d,transparent);animation:mwSessionSweep 1.15s ease-in-out infinite}
    .mwSessionLaunchRetry{display:none;border:1px solid rgba(232,186,77,.55);border-radius:10px;padding:10px 16px;background:#0a1822;color:#f2c75d;font-weight:800;font-size:12px}
    #mwSessionLaunch.is-slow .mwSessionLaunchSub{color:#f2c75d}
    #mwSessionLaunch.is-slow .mwSessionLaunchRetry{display:block}
    @keyframes mwSessionPulse{0%,100%{transform:scale(1);filter:brightness(.96)}50%{transform:scale(1.06);filter:brightness(1.12)}}
    @keyframes mwSessionRing{0%{transform:scale(.86);opacity:0}35%{opacity:.65}100%{transform:scale(1.18);opacity:0}}
    @keyframes mwSessionSweep{0%{transform:translateX(-140%)}100%{transform:translateX(340%)}}
    @media(prefers-reduced-motion:reduce){.mwSessionLaunchOrb:before,.mwSessionLaunchOrb:after,.mwSessionLaunchOrb img,.mwSessionLaunchLine i{animation:none}}
  `;
  const style = document.createElement('style');
  style.id = 'mw-session-launch-styles';
  style.textContent = css;
  (document.head || document.documentElement).appendChild(style);
  const overlay = document.createElement('div');
  overlay.id = 'mwSessionLaunch';
  overlay.setAttribute('role','status');
  overlay.setAttribute('aria-live','polite');
  overlay.innerHTML = `<div class="mwSessionLaunchInner">
    <div class="mwSessionLaunchOrb"><img src="/mw-dynasty-app-icon-512.png" alt="MW Dynasty"></div>
    <div class="mwSessionLaunchTitle">ENTERING MW DYNASTY</div>
    <div class="mwSessionLaunchSub">${role === 'coach' ? 'COACH EXPERIENCE' : 'ATHLETE EXPERIENCE'}</div>
    <div class="mwSessionLaunchLine" aria-hidden="true"><i></i></div>
    <button class="mwSessionLaunchRetry" type="button">RETRY LOADING</button>
  </div>`;
  (document.body || document.documentElement).appendChild(overlay);

  const started = performance.now();
  let finished = false;
  const close = () => {
    if (finished) return;
    finished = true;
    const wait = Math.max(0, 360 - (performance.now() - started));
    window.setTimeout(() => {
      overlay.classList.add('is-done');
      window.setTimeout(() => { overlay.remove(); style.remove(); }, 360);
    }, wait);
  };
  const ready = () => {
    if (role === 'coach') return Boolean(document.querySelector('#app .app, #app .page, #app [data-mw-signin], #app .coach-login-screen, #app .coach-membership-screen'));
    return document.body.classList.contains('mw-auth-ready') || Boolean(document.querySelector('#mwAuthReset.show, #mwRoleMismatch:not([hidden]), #mwAthleteMembershipContinue'));
  };
  const observer = new MutationObserver(() => { if (ready()) { observer.disconnect(); close(); } });
  observer.observe(document.documentElement, { childList:true, subtree:true, attributes:true, attributeFilter:['class'] });
  if (ready()) { observer.disconnect(); close(); }
  window.setTimeout(() => {
    if (finished) return;
    overlay.classList.add('is-slow');
    const sub = overlay.querySelector('.mwSessionLaunchSub');
    if (sub) sub.textContent = 'MW IS TAKING A LITTLE LONGER';
    overlay.querySelector('.mwSessionLaunchRetry')?.addEventListener('click', () => location.reload(), { once:true });
  }, 4500);
})();
