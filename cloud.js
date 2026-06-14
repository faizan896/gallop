/* GALLOP — Firebase auth + cross-device cloud sync
 * ------------------------------------------------------------------
 * 1. Create a free Firebase project at https://console.firebase.google.com
 * 2. Enable Authentication → Sign-in method → "Email/Password" and "Google"
 * 3. Create a Firestore database (Production mode) and paste the rules from
 *    the README comment at the bottom of this file.
 * 4. Project settings → "Your apps" → Web app → copy the config values into
 *    firebaseConfig below (replace every PASTE_... value).
 * Until you fill it in, the app simply runs in local-only mode.
 * ------------------------------------------------------------------ */
(function () {
  'use strict';

  var firebaseConfig = {
    apiKey: "AIzaSyBy7nUAna2cv0EQC5m-ydSonY7vhG3yWHs",
    authDomain: "gallop-9c7c3.firebaseapp.com",
    projectId: "gallop-9c7c3",
    storageBucket: "gallop-9c7c3.firebasestorage.app",
    messagingSenderId: "559346525324",
    appId: "1:559346525324:web:be02ea5ea3bddf325e07a9",
    measurementId: "G-G4HBZFQ33T"
  };

  var SYNC_KEYS = ['mm_cash', 'mm_crypto', 'mm_stocks', 'mm_ondo', 'mm_portfolio_snapshots', 'mm_ondo_wallet', 'mm_name'];

  var CONFIGURED = firebaseConfig.apiKey && firebaseConfig.apiKey.indexOf('PASTE') === -1;
  if (!CONFIGURED || typeof firebase === 'undefined') {
    console.info('[gallop] cloud sync off — running local-only. Add your Firebase config in cloud.js to enable login.');
    return;
  }

  firebase.initializeApp(firebaseConfig);
  var auth = firebase.auth();
  var db = firebase.firestore();

  // ---- keep a raw setter so we can write cloud values without re-triggering a push ----
  var rawSet = window.localStorage.setItem.bind(window.localStorage);
  var pushTimer = null;

  window.localStorage.setItem = function (key, value) {
    rawSet(key, value);
    if (SYNC_KEYS.indexOf(key) !== -1) schedulePush();
  };

  function schedulePush() {
    if (!auth.currentUser) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(pushNow, 1200);
  }

  function pushNow() {
    var u = auth.currentUser;
    if (!u) return;
    var data = { updatedAt: Date.now() };
    SYNC_KEYS.forEach(function (k) {
      var v = null;
      try { v = window.localStorage.getItem(k); } catch (e) { /* ignore */ }
      if (v !== null) data[k] = v;
    });
    db.collection('users').doc(u.uid).set(data, { merge: true })
      .catch(function (e) { console.warn('[gallop] cloud push failed:', e.message); });
  }

  // Pull cloud → local. Returns true if local data actually changed.
  function pull(u) {
    return db.collection('users').doc(u.uid).get().then(function (snap) {
      if (!snap.exists) { pushNow(); return false; }        // first login: seed cloud from this device
      var d = snap.data();
      var changed = false;
      SYNC_KEYS.forEach(function (k) {
        if (d[k] === undefined) return;
        var cur = null;
        try { cur = window.localStorage.getItem(k); } catch (e) { /* ignore */ }
        if (cur !== d[k]) { rawSet(k, d[k]); changed = true; }
      });
      return changed;
    }).catch(function (e) { console.warn('[gallop] cloud pull failed:', e.message); return false; });
  }

  /* ------------------------- login gate UI ------------------------- */
  function buildGate() {
    var el = document.createElement('div');
    el.id = 'auth-gate';
    el.style.cssText = 'position:fixed;inset:0;z-index:200;background:#ebeae7;display:flex;align-items:center;justify-content:center;padding:24px;';
    el.innerHTML = ''
      + '<div style="width:100%;max-width:320px">'
      + '  <div style="display:flex;align-items:center;gap:10px;margin-bottom:28px">'
      + '    <svg width="17" height="21" viewBox="0 0 32 40" fill="none" stroke="#1b1a18" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">'
      + '      <path d="M6 38 V16 A10 10 0 0 1 26 16 V38"/><path d="M5 38 H27"/><path d="M16 17 V7"/>'
      + '      <path d="M16 17 L13.4 7.4"/><path d="M16 17 L18.6 7.4"/><path d="M16 17 L11 8.7"/><path d="M16 17 L21 8.7"/>'
      + '      <path d="M16 17 L7.6 12.5"/><path d="M16 17 L24.4 12.5"/></svg>'
      + '    <span style="font:500 15px/1 \'IBM Plex Mono\',monospace;color:#1b1a18;letter-spacing:-0.01em">gallop</span>'
      + '  </div>'
      + '  <div id="ag-title" style="font:400 11px \'IBM Plex Mono\',monospace;color:#8c8881;letter-spacing:.02em;margin-bottom:18px">sign in to sync your portfolio</div>'
      + '  <input id="ag-email" type="email" autocomplete="email" placeholder="email" style="width:100%;background:transparent;border:none;border-bottom:1px solid #cbc7bf;padding:9px 2px;margin-bottom:14px;font:400 13px \'IBM Plex Mono\',monospace;color:#1b1a18;outline:none">'
      + '  <input id="ag-pass" type="password" autocomplete="current-password" placeholder="password" style="width:100%;background:transparent;border:none;border-bottom:1px solid #cbc7bf;padding:9px 2px;margin-bottom:8px;font:400 13px \'IBM Plex Mono\',monospace;color:#1b1a18;outline:none">'
      + '  <div id="ag-error" style="font:400 11px \'IBM Plex Mono\',monospace;color:#b6635c;min-height:16px;margin-bottom:10px"></div>'
      + '  <button id="ag-signin" style="width:100%;background:#1b1a18;color:#ebeae7;border:none;border-radius:4px;padding:11px;font:400 12px \'IBM Plex Mono\',monospace;cursor:pointer;letter-spacing:.02em">sign in</button>'
      + '  <button id="ag-create" style="width:100%;background:transparent;color:#1b1a18;border:1px solid #cbc7bf;border-radius:4px;padding:11px;margin-top:10px;font:400 12px \'IBM Plex Mono\',monospace;cursor:pointer;letter-spacing:.02em">create account</button>'
      + '  <div style="display:flex;align-items:center;gap:12px;margin:18px 0;color:#b0aca5;font:400 10px \'IBM Plex Mono\',monospace"><span style="flex:1;height:1px;background:#d4d1cb"></span>or<span style="flex:1;height:1px;background:#d4d1cb"></span></div>'
      + '  <button id="ag-google" style="width:100%;background:transparent;color:#1b1a18;border:1px solid #cbc7bf;border-radius:4px;padding:11px;font:400 12px \'IBM Plex Mono\',monospace;cursor:pointer;letter-spacing:.02em">continue with google</button>'
      + '</div>';
    document.body.appendChild(el);

    var email = el.querySelector('#ag-email');
    var pass = el.querySelector('#ag-pass');
    var err = el.querySelector('#ag-error');
    function fail(e) { err.textContent = (e && e.message ? e.message : 'something went wrong').replace('Firebase: ', '').replace(/\(auth.*\)\.?/, '').trim(); }
    function clearErr() { err.textContent = ''; }

    el.querySelector('#ag-signin').addEventListener('click', function () {
      clearErr();
      auth.signInWithEmailAndPassword(email.value.trim(), pass.value).catch(fail);
    });
    el.querySelector('#ag-create').addEventListener('click', function () {
      clearErr();
      auth.createUserWithEmailAndPassword(email.value.trim(), pass.value).catch(fail);
    });
    el.querySelector('#ag-google').addEventListener('click', function () {
      clearErr();
      auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()).catch(fail);
    });
    pass.addEventListener('keydown', function (e) { if (e.key === 'Enter') el.querySelector('#ag-signin').click(); });
    return el;
  }

  var gate = null;
  function showGate() { if (!gate) gate = buildGate(); gate.style.display = 'flex'; }
  function hideGate() { if (gate) gate.style.display = 'none'; }

  function setupSignOut() {
    var btn = document.getElementById('signout-btn');
    if (!btn) return;
    btn.classList.remove('hidden');
    btn.addEventListener('click', function () {
      sessionStorage.removeItem('gallop_synced');
      auth.signOut();
    });
  }

  /* ------------------------- auth state ------------------------- */
  auth.onAuthStateChanged(function (user) {
    if (!user) {
      hideGateMarkSignedOut();
      showGate();
      var b = document.getElementById('signout-btn');
      if (b) b.classList.add('hidden');
      return;
    }
    hideGate();
    setupSignOut();
    // already synced this session? then local is current, no reload needed.
    if (sessionStorage.getItem('gallop_synced') === user.uid) return;
    pull(user).then(function (changed) {
      sessionStorage.setItem('gallop_synced', user.uid);
      if (changed) location.reload();   // re-init all modules from synced data
    });
  });

  function hideGateMarkSignedOut() { /* placeholder to keep flow readable */ }
})();

/* ---------------------------------------------------------------------------
 FIRESTORE SECURITY RULES — paste these in Firebase console → Firestore → Rules:

 rules_version = '2';
 service cloud.firestore {
   match /databases/{database}/documents {
     match /users/{uid} {
       allow read, write: if request.auth != null && request.auth.uid == uid;
     }
   }
 }
--------------------------------------------------------------------------- */
