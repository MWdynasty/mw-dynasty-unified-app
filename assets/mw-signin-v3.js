/* One sign-in component for both roles. Authentication remains owned by each app. */
(function (root) {
  'use strict';
  const roles = {
    athlete: {
      name: 'Athlete', other: 'Coach', otherPath: '/coach/',
      description: 'Your training, tools and progress in one place.',
      form: 'mwAthleteLoginForm', email: 'mwAuthEmail', password: 'mwAuthPassword',
      toggle: 'mwTogglePassword', remember: 'mwRememberMe', forgot: 'mwForgotPassword',
      submit: 'mwAuthLogin', status: 'mwAuthStatus'
    },
    coach: {
      name: 'Coach', other: 'Athlete', otherPath: '/athlete/',
      description: 'Your team, practice and progress in one place.',
      form: 'loginForm', email: 'loginEmail', password: 'loginPassword',
      toggle: 'togglePassword', remember: 'rememberMe', forgot: 'forgotPassword',
      submit: 'loginSubmit', status: 'loginMessage'
    }
  };
  function escapeText(value) {
    return String(value || '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[ch]);
  }
  function content(role, options = {}) {
    const c = roles[role];
    if (!c) throw new Error('Unknown MW sign-in role');
    const signup = role === 'coach'
      ? '<button type="button" data-coach-signup="1" class="mw-signin-create">Create account</button>'
      : '<a id="mwAthleteSignupOpen" class="mw-signin-create" href="/athlete/signup.html?plan=mw_athlete">Create account</a>';
    const recovery = role === 'athlete' ? `
      <div id="mwAuthReset" class="mwAuthReset mw-signin-recovery">
        <label class="mw-signin-field" for="mwNewPassword"><span>New password</span><input id="mwNewPassword" type="password" autocomplete="new-password" placeholder="At least 8 characters"></label>
        <label class="mw-signin-field" for="mwConfirmPassword"><span>Confirm password</span><input id="mwConfirmPassword" type="password" autocomplete="new-password" placeholder="Repeat your new password"></label>
        <button id="mwSavePassword" class="mw-signin-submit" type="button">Save new password</button>
      </div>` : '';
    return `<div class="mw-signin-shell">
      <header class="mw-signin-brand">
        <img src="/mw-dynasty-app-icon-512.png" alt="MW Dynasty crest" width="60" height="60">
        <div><b>MW DYNASTY</b><span>BUILT FOR YOUR NEXT LEVEL</span></div>
      </header>
      <section class="mw-signin-card" data-mw-signin-card aria-labelledby="mwSignInTitle">
        <div class="mw-signin-heading"><span class="mw-signin-role">${c.name.toUpperCase()} ACCESS</span><h1 id="mwSignInTitle">${c.name} sign in</h1><p>${c.description}</p></div>
        <form id="${c.form}" class="mw-signin-form" novalidate>
          <label class="mw-signin-field" for="${c.email}"><span>Email address</span><input id="${c.email}" name="email" type="email" autocomplete="email" inputmode="email" autocapitalize="none" spellcheck="false" placeholder="you@example.com" required></label>
          <label class="mw-signin-field" for="${c.password}"><span>Password</span><span class="mw-signin-password"><input id="${c.password}" name="password" type="password" autocomplete="current-password" placeholder="Enter your password" required><button id="${c.toggle}" class="mw-signin-toggle" type="button" aria-label="Show password" aria-controls="${c.password}" aria-pressed="false">Show</button></span></label>
          <div class="mw-signin-options"><label class="mw-signin-remember"><input id="${c.remember}" type="checkbox" checked><span>Keep me signed in</span></label><button id="${c.forgot}" class="mw-signin-forgot" type="button">Forgot password?</button></div>
          <button id="${c.submit}" class="mw-signin-submit" type="submit"><span>Sign in</span><span aria-hidden="true">→</span></button>
        </form>
        ${recovery}
        <div id="${c.status}" class="mw-signin-status${role === 'coach' ? ' login-message' : ''}${options.message ? ' show' : ''}" role="status" aria-live="polite">${escapeText(options.message)}</div>
        ${role === 'athlete' ? '<div id="mwRoleMismatch" class="mwRoleMismatch" hidden></div>' : ''}
        <a class="mw-signin-switch" href="${c.otherPath}">Sign in as ${c.other}<span aria-hidden="true">→</span></a>
        <div class="mw-signin-signup"><span>New to MW Dynasty?</span>${signup}</div>
      </section>
      <footer class="mw-signin-footer"><a href="/privacy.html" target="_blank" rel="noopener">Privacy</a><span aria-hidden="true">·</span><a href="/terms.html" target="_blank" rel="noopener">Terms</a><span aria-hidden="true">·</span><a href="/support.html" target="_blank" rel="noopener">Support</a></footer>
    </div>`;
  }
  function render(role, options = {}) {
    return `<div class="mw-signin" data-mw-signin="${role}" data-signin-version="3">${content(role, options)}</div>`;
  }
  function mount(element, role, options = {}) {
    if (!element) throw new Error('MW sign-in host is missing');
    element.className = 'mw-signin';
    element.setAttribute('data-mw-signin', role);
    element.setAttribute('data-signin-version', '3');
    element.innerHTML = content(role, options);
  }
  const api = Object.freeze({render, mount});
  root.MWSignIn = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
