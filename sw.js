/* GALLOP service worker — offline app shell + faster repeat loads.
   Bump CACHE when you redeploy to force clients onto fresh files. */
var CACHE = 'gallop-v3';
var ASSETS = [
  './', './index.html', './styles.css', './tailwind.css',
  './prices.js', './portfolio.js', './overview.js', './research.js', './markets.js', './dashboard.js', './cloud.js',
  './manifest.json', './icon-192.png', './icon-512.png', './apple-touch-icon.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(ASSETS); })
      .then(function () { return self.skipWaiting(); })
      .catch(function () { /* a missing asset shouldn't block install */ })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  // Let cross-origin requests (Firebase auth/Firestore, Finnhub, CoinGecko, fonts) go straight to the network.
  if (url.origin !== self.location.origin) return;

  // Network-first for our own files: new deploys load immediately, and the cache
  // is only used as an offline fallback. (Cache-first could trap an installed app
  // on stale code — exactly what broke login in the home-screen app.)
  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.status === 200) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (cached) { return cached || caches.match('./index.html'); });
    })
  );
});
