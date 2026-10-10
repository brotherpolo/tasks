/* Cadence — Firebase configuration (optional).
   Leave apiKey empty to run without accounts (tasks stay in this browser).
   To turn on sign-in + cloud sync, paste your web app config from
   Firebase console → Project settings → Your apps → SDK setup → Config.
   These values are public identifiers, not secrets; access is enforced by
   firestore.rules. See README.md for the full setup. */
window.CADENCE_FIREBASE_CONFIG = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: ''
};

/* Sign-in methods shown on the sign-in screen. Enable the same ones in
   Firebase console → Authentication → Sign-in method. */
window.CADENCE_AUTH_PROVIDERS = { google: true, emailPassword: true };
