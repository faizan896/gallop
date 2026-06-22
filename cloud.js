/* GALLOP — guest-first auth + cloud sync
 * - The app runs immediately with NO login wall (guest / local mode).
 * - Firebase is lazy-loaded only when someone taps "sign in" (keeps first load fast).
 * - Login is username + password only (no email shown). Behind the scenes the
 *   username is mapped to "<username>@gallop.app" for Firebase — users never see it.
 *   Trade-off: no email = no password recovery, which is fine for a personal app.
 */
(function () {
  'use strict';

  var firebaseConfig = {
    apiKey: "AIzaSyBy7nUAna2cv0EQC5m-ydSonY7vhG3yWHs",
    authDomain: "gallop-9c7c3.firebaseapp.com",
    projectId: "gallop-9c7c3",
    storageBucket: "gallop-9c7c3.firebasestorage.app",
    messagingSenderId: "559346525324",
    appId: "1:559346525324:web:be02ea5ea3bddf325e07a9"
  };
  var SYNC_KEYS = ['mm_cash', 'mm_crypto', 'mm_stocks', 'mm_portfolio_snapshots', 'mm_name'];
  var FB = 'https://www.gstatic.com/firebasejs/10.12.0/';

  var auth = null, db = null, fbReady = null;

  // ---- write hook: sync changes to cloud once signed in ----
  var rawSet = window.localStorage.setItem.bind(window.localStorage);
  var pushTimer = null;
  window.localStorage.setItem = function (key, value) {
    rawSet(key, value);
    if (SYNC_KEYS.indexOf(key) !== -1) schedulePush();
  };
  function schedulePush() { if (!auth || !auth.currentUser) return; clearTimeout(pushTimer); pushTimer = setTimeout(pushNow, 1200); }
  function pushNow() {
    if (!auth || !auth.currentUser || !db) return;
    var u = auth.currentUser, data = { updatedAt: Date.now() };
    SYNC_KEYS.forEach(function (k) { var v = null; try { v = localStorage.getItem(k); } catch (e) {} if (v !== null) data[k] = v; });
    db.collection('users').doc(u.uid).set(data, { merge: true }).catch(function (e) { console.warn('[gallop] push failed:', e.message); });
  }
  function pull(u) {
    return db.collection('users').doc(u.uid).get().then(function (snap) {
      if (!snap.exists) { pushNow(); return false; }
      var d = snap.data(), changed = false;
      SYNC_KEYS.forEach(function (k) {
        if (d[k] === undefined) return;
        var cur = null; try { cur = localStorage.getItem(k); } catch (e) {}
        if (cur !== d[k]) { rawSet(k, d[k]); changed = true; }
      });
      return changed;
    }).catch(function (e) { console.warn('[gallop] pull failed:', e.message); return false; });
  }

  // ---- lazy-load Firebase SDK ----
  function loadScript(src) { return new Promise(function (res, rej) { var s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = function () { rej(new Error('network')); }; document.head.appendChild(s); }); }
  function ensureFirebase() {
    if (fbReady) return fbReady;
    fbReady = loadScript(FB + 'firebase-app-compat.js')
      .then(function () { return loadScript(FB + 'firebase-auth-compat.js'); })
      .then(function () { return loadScript(FB + 'firebase-firestore-compat.js'); })
      .then(function () {
        firebase.initializeApp(firebaseConfig);
        auth = firebase.auth();
        db = firebase.firestore();
        try { auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL); } catch (e) {}
        auth.onAuthStateChanged(function (user) {
          setButtons(!!user);
          if (user) {
            try { localStorage.setItem('gallop_was_authed', '1'); } catch (e) {}
            closeModal();
            pull(user).then(function (changed) { if (changed && typeof window.__gallopReload === 'function') window.__gallopReload(); });
          } else {
            try { localStorage.removeItem('gallop_was_authed'); } catch (e) {}
          }
        });
      });
    return fbReady;
  }

  // username -> internal email (never shown to the user)
  function toEmail(username) { return username.toLowerCase().replace(/[^a-z0-9_.\-]/g, '') + '@gallop.app'; }

  // ---- sign-in modal (username + password) ----
  var modal = null;
  function buildModal() {
    var el = document.createElement('div');
    el.id = 'auth-modal';
    el.style.cssText = 'position:fixed;inset:0;z-index:200;background:rgba(20,19,21,.55);display:none;align-items:center;justify-content:center;padding:22px';
    el.innerHTML = ''
      + '<div style="width:100%;max-width:320px;background:#f2f0ec;border:1px solid #d6d2cb;border-radius:6px;padding:24px;font-family:\'IBM Plex Mono\',monospace">'
      + '  <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">'
      + '    <span style="font:500 15px/1 \'IBM Plex Mono\',monospace;color:#1b1a18">gallop</span>'
      + '    <button id="am-close" style="background:none;border:none;color:#8c8881;font-size:20px;line-height:1;cursor:pointer">×</button>'
      + '  </div>'
      + '  <div style="font-size:11px;color:#6f6c66;margin-bottom:16px">sign in to save &amp; sync your portfolio across devices</div>'
      + '  <input id="am-user" type="text" autocomplete="username" placeholder="username" style="width:100%;background:transparent;border:none;border-bottom:1px solid #cbc7bf;padding:9px 2px;margin-bottom:14px;font:400 13px \'IBM Plex Mono\',monospace;color:#1b1a18;outline:none">'
      + '  <input id="am-pass" type="password" autocomplete="current-password" placeholder="password (6+ characters)" style="width:100%;background:transparent;border:none;border-bottom:1px solid #cbc7bf;padding:9px 2px;margin-bottom:8px;font:400 13px \'IBM Plex Mono\',monospace;color:#1b1a18;outline:none">'
      + '  <div id="am-error" style="font-size:11px;color:#b6635c;min-height:16px;margin-bottom:10px"></div>'
      + '  <button id="am-signin" style="width:100%;background:#1b1a18;color:#ebeae7;border:none;border-radius:4px;padding:11px;font:400 12px \'IBM Plex Mono\',monospace;cursor:pointer">sign in</button>'
      + '  <button id="am-create" style="width:100%;background:transparent;color:#1b1a18;border:1px solid #cbc7bf;border-radius:4px;padding:11px;margin-top:10px;font:400 12px \'IBM Plex Mono\',monospace;cursor:pointer">create account</button>'
      + '</div>';
    document.body.appendChild(el);

    var user = el.querySelector('#am-user'), pass = el.querySelector('#am-pass'), err = el.querySelector('#am-error');
    function fail(e) { err.textContent = (e && e.message ? e.message : 'something went wrong').replace('Firebase: ', '').replace(/\(auth.*\)\.?/, '').trim(); }
    function clearErr() { err.textContent = ''; }
    function valid() {
      if (!user.value.trim()) { fail({ message: 'enter a username' }); return false; }
      if (pass.value.length < 6) { fail({ message: 'password needs 6+ characters' }); return false; }
      return true;
    }
    el.querySelector('#am-close').addEventListener('click', closeModal);
    el.addEventListener('click', function (e) { if (e.target === el) closeModal(); });
    el.querySelector('#am-signin').addEventListener('click', function () { clearErr(); if (!valid()) return; auth.signInWithEmailAndPassword(toEmail(user.value.trim()), pass.value).catch(fail); });
    el.querySelector('#am-create').addEventListener('click', function () { clearErr(); if (!valid()) return; auth.createUserWithEmailAndPassword(toEmail(user.value.trim()), pass.value).catch(fail); });
    pass.addEventListener('keydown', function (e) { if (e.key === 'Enter') el.querySelector('#am-signin').click(); });
    return el;
  }

  function openModal() {
    var sib = document.getElementById('signin-btn');
    if (sib) sib.textContent = 'loading…';
    ensureFirebase().then(function () {
      if (sib) sib.textContent = 'sign in';
      if (!modal) modal = buildModal();
      modal.style.display = 'flex';
      var u = modal.querySelector('#am-user'); if (u) u.focus();
    }).catch(function () {
      if (sib) sib.textContent = 'sign in';
      alert('Could not load sign-in. Please check your connection and try again.');
    });
  }
  function closeModal() { if (modal) modal.style.display = 'none'; }

  function setButtons(authed) {
    var sin = document.getElementById('signin-btn'), sout = document.getElementById('signout-btn');
    if (sin) sin.classList.toggle('hidden', authed);
    if (sout) sout.classList.toggle('hidden', !authed);
  }

  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });

  function init() {
    var sin = document.getElementById('signin-btn'); if (sin) sin.addEventListener('click', openModal);
    var sout = document.getElementById('signout-btn'); if (sout) sout.addEventListener('click', function () { if (auth) auth.signOut(); });
    setButtons(false);
    // Returning signed-in user? quietly restore the session in the background.
    var was = null; try { was = localStorage.getItem('gallop_was_authed'); } catch (e) {}
    if (was === '1') ensureFirebase();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();

/* ---------------------------------------------------------------------------
 FIRESTORE SECURITY RULES (Firebase console → Firestore → Rules):
 rules_version = '2';
 service cloud.firestore {
   match /databases/{database}/documents {
     match /users/{uid} {
       allow read, write: if request.auth != null && request.auth.uid == uid;
     }
   }
 }
 Also: Authentication → Sign-in method → enable "Email/Password" (already done).
--------------------------------------------------------------------------- */
