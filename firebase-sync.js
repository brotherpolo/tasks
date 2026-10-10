/* Cadence — Firebase Authentication + Cloud Firestore sync (optional, build-free).
   Active only when firebase-config.js has an apiKey and projectId.
   Data layout (matches firestore.rules):
     users/{uid}/items/settings   → task types + importance levels
     users/{uid}/items/{taskId}   → one document per task                    */
(function () {
  const C = window.Cadence;
  const { esc, icon } = C;
  const cfg = window.CADENCE_FIREBASE_CONFIG || {};
  const providers = window.CADENCE_AUTH_PROVIDERS || { google: true, emailPassword: true };
  const inArtifact = !!(window.claude && typeof window.claude.use === 'function');
  const enabled = !!(cfg.apiKey && cfg.projectId) && !inArtifact;
  const V = '10.12.2';
  const SDK = 'https://www.gstatic.com/firebasejs/' + V + '/';

  const FB = { enabled, user: null, signOut: null, projectId: cfg.projectId || null };
  C.firebaseSync = FB;
  if (!enabled) return;

  const load = (src) => new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res;
    s.onerror = () => rej(new Error('Could not load Firebase. Check your connection and reload.'));
    document.head.appendChild(s);
  });

  let once = null;
  FB.collection = function () {
    if (!once) once = connectOnce().catch((e) => { once = null; throw e; });
    return once;
  };
  async function connectOnce() {
    await load(SDK + 'firebase-app-compat.js');
    await Promise.all([load(SDK + 'firebase-auth-compat.js'), load(SDK + 'firebase-firestore-compat.js')]);
    const app = firebase.apps.length ? firebase.app() : firebase.initializeApp(cfg);
    const auth = app.auth();
    const db = app.firestore();

    const user = await new Promise((resolve) => {
      auth.onAuthStateChanged((u) => { if (u) { hideGate(); resolve(u); } else showGate(auth); });
    });
    FB.user = { uid: user.uid, email: user.email, name: user.displayName };
    FB.signOut = async () => {
      await auth.signOut();
      try { localStorage.removeItem('cadence.v1'); } catch (e) { /* blocked */ }
      location.reload();
    };
    // after sign-in, a later sign-out (e.g. from another tab) returns to the gate
    auth.onAuthStateChanged((u) => { if (!u && FB.user) location.reload(); });

    const col = db.collection('users').doc(user.uid).collection('items');
    return {
      col, uid: user.uid, label: 'firebase',
      listen: (next, err) => col.onSnapshot({ includeMetadataChanges: true }, next, err)
    }
  };

  /* ---------- sign-in gate ---------- */
  let gate = null, mode = 'signin';
  const ERR = {
    'auth/invalid-email': 'That email address doesn’t look right.',
    'auth/missing-password': 'Enter your password.',
    'auth/invalid-credential': 'Email or password is incorrect.',
    'auth/wrong-password': 'Email or password is incorrect.',
    'auth/user-not-found': 'No account uses that email. Create one instead.',
    'auth/email-already-in-use': 'An account already uses that email. Sign in instead.',
    'auth/weak-password': 'Use a password with at least 6 characters.',
    'auth/popup-closed-by-user': 'The Google window was closed before signing in.',
    'auth/popup-blocked': 'Your browser blocked the Google window. Allow pop-ups for this site and try again.',
    'auth/unauthorized-domain': 'This domain isn’t authorized. Add it in Firebase console → Authentication → Settings → Authorized domains.',
    'auth/operation-not-allowed': 'This sign-in method is turned off in the Firebase console.',
    'auth/too-many-requests': 'Too many attempts. Wait a minute and try again.',
    'auth/network-request-failed': 'Network error. Check your connection and try again.'
  };
  const msg = (e) => ERR[e && e.code] || (e && e.message) || 'Something went wrong. Try again.';

  function showGate(auth) {
    if (!gate) {
      gate = document.createElement('div');
      gate.className = 'gate';
      document.body.appendChild(gate);
      gate.addEventListener('submit', (e) => onSubmit(e, auth));
      gate.addEventListener('click', (e) => onClick(e, auth));
    }
    renderGate();
  }
  function hideGate() { if (gate) { gate.remove(); gate = null; } }

  function renderGate(error, note) {
    const up = mode === 'signup';
    gate.innerHTML = '<div class="gate-card" role="dialog" aria-modal="true" aria-labelledby="gate-title">' +
      '<div class="brand"><svg class="logo" viewBox="0 0 32 32" aria-hidden="true"><rect x="2" y="2" width="28" height="28" rx="9" class="logo-bg"/><rect x="8.5" y="16" width="3.6" height="8" rx="1.8" class="logo-bar"/><rect x="14.2" y="11" width="3.6" height="13" rx="1.8" class="logo-bar"/><rect x="19.9" y="7.5" width="3.6" height="16.5" rx="1.8" class="logo-bar hi"/></svg><span class="brand-name">Cadence</span></div>' +
      '<h1 id="gate-title" class="gate-title">' + (up ? 'Create your account' : 'Sign in to your tasks') + '</h1>' +
      '<p class="muted gate-sub">Your tasks sync across your devices. Only you can read them.</p>' +
      (providers.google ? '<button type="button" class="btn block gate-google" data-g>' + icon('sparkle') + '<span>Continue with Google</span></button>' : '') +
      (providers.google && providers.emailPassword ? '<div class="gate-or"><span>or</span></div>' : '') +
      (providers.emailPassword ? '<form class="gate-form" novalidate>' +
        '<label class="field-label" for="gate-email">Email</label><label class="input-wrap"><input id="gate-email" type="email" autocomplete="email" required></label>' +
        '<label class="field-label" for="gate-pass">Password</label><label class="input-wrap"><input id="gate-pass" type="password" autocomplete="' + (up ? 'new-password' : 'current-password') + '" minlength="6" required></label>' +
        (error ? '<p class="gate-err" role="alert">' + esc(error) + '</p>' : '') + (note ? '<p class="gate-note" role="status">' + esc(note) + '</p>' : '') +
        '<button type="submit" class="btn primary block gate-submit">' + (up ? 'Create account' : 'Sign in') + '</button>' +
        '<div class="gate-links">' +
        '<button type="button" class="gate-link" data-mode>' + (up ? 'Have an account? Sign in' : 'New here? Create an account') + '</button>' +
        (!up ? '<button type="button" class="gate-link" data-reset>Forgot password?</button>' : '') + '</div>' +
        '</form>' : (error ? '<p class="gate-err" role="alert">' + esc(error) + '</p>' : '')) +
      '</div>';
  }
  async function onSubmit(e, auth) {
    e.preventDefault();
    const email = gate.querySelector('#gate-email').value.trim();
    const pass = gate.querySelector('#gate-pass').value;
    const btn = gate.querySelector('.gate-submit');
    btn.disabled = true; btn.textContent = mode === 'signup' ? 'Creating account…' : 'Signing in…';
    try {
      if (mode === 'signup') await auth.createUserWithEmailAndPassword(email, pass);
      else await auth.signInWithEmailAndPassword(email, pass);
    } catch (err) { renderGate(msg(err)); const em = gate.querySelector('#gate-email'); if (em) em.value = email; }
  }
  async function onClick(e, auth) {
    if (e.target.closest('[data-g]')) {
      try { await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()); }
      catch (err) {
        if (err && (err.code === 'auth/popup-blocked' || err.code === 'auth/operation-not-supported-in-this-environment')) {
          try { return await auth.signInWithRedirect(new firebase.auth.GoogleAuthProvider()); } catch (e2) { return renderGate(msg(e2)); }
        }
        renderGate(msg(err));
      }
    } else if (e.target.closest('[data-mode]')) {
      mode = mode === 'signup' ? 'signin' : 'signup'; renderGate();
    } else if (e.target.closest('[data-reset]')) {
      const email = gate.querySelector('#gate-email').value.trim();
      if (!email) return renderGate('Enter your email above, then choose “Forgot password?” again.');
      try { await auth.sendPasswordResetEmail(email); renderGate(null, 'Check ' + email + ' for a link to reset your password.'); }
      catch (err) { renderGate(msg(err)); }
      const em = gate && gate.querySelector('#gate-email'); if (em) em.value = email;
    }
  }
})();
