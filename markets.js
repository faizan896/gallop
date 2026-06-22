(function () {
  'use strict';

  var FINNHUB_KEY = 'd6or3l1r01qmqugc2a80d6or3l1r01qmqugc2a8g';

  function escHtml(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
  function escAttr(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  async function getJson(url, tries) {
    tries = tries || 2;
    for (var i = 0; i < tries; i++) {
      try { var r = await fetch(url); if (r.ok) return await r.json(); } catch (e) { /* retry */ }
      if (i < tries - 1) await new Promise(function (res) { setTimeout(res, 700); });
    }
    throw new Error('fetch failed: ' + url);
  }

  function timeAgo(sec) {
    var diff = Math.floor(Date.now() / 1000) - sec;
    if (diff < 60) return 'now';
    if (diff < 3600) return Math.floor(diff / 60) + 'm';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h';
    return Math.floor(diff / 86400) + 'd';
  }

  function fmt(n, dec) {
    if (n == null || isNaN(n)) return '—';
    return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }

  // ---- Crypto Fear & Greed (alternative.me, free, no key) ----
  async function loadFNG() {
    var valEl = document.getElementById('fng-value');
    var labEl = document.getElementById('fng-label');
    var mark = document.getElementById('fng-marker');
    if (!valEl) return;
    try {
      var d = await getJson('https://api.alternative.me/fng/?limit=1');
      var item = d && d.data && d.data[0];
      if (!item) return;
      var v = parseInt(item.value, 10);
      valEl.textContent = v;
      if (labEl) labEl.textContent = (item.value_classification || '').toLowerCase();
      if (mark) mark.style.left = Math.max(2, Math.min(98, v)) + '%';
    } catch (e) {
      if (labEl) labEl.textContent = 'unavailable';
    }
  }

  // ---- Top movers (Binance — reliable, volume-filtered so only liquid coins show) ----
  var STABLE = { USDT: 1, USDC: 1, FDUSD: 1, TUSD: 1, DAI: 1, BUSD: 1, USDP: 1, EURT: 1, EUR: 1 };

  function renderMovers(list, picks) {
    var html = '';
    picks.forEach(function (c) {
      var up = c.chg >= 0;
      var price = '$' + Number(c.price).toLocaleString('en-US', { maximumFractionDigits: c.price >= 1 ? 2 : 6 });
      html += '<div class="flex items-center justify-between py-2.5 border-t border-dark-500">'
        + '<div class="flex items-center gap-3 min-w-0">'
        + '<div class="w-6 h-6 rounded-full bg-dark-700 text-light-100 flex items-center justify-center text-[10px] font-medium flex-shrink-0">' + escHtml(c.base.charAt(0)) + '</div>'
        + '<div class="text-[13px] text-light-100 uppercase">' + escHtml(c.base) + '</div></div>'
        + '<div class="text-right flex-shrink-0"><div class="text-[13px] text-light-100">' + price + '</div>'
        + '<div class="text-[11px] ' + (up ? 'text-status-green' : 'text-status-red') + '">' + (up ? '+' : '') + c.chg.toFixed(2) + '%</div></div>'
        + '</div>';
    });
    list.innerHTML = html;
  }

  async function loadMovers() {
    var list = document.getElementById('movers-list');
    if (!list) return;
    try {
      var arr = await getJson('https://api.binance.com/api/v3/ticker/24hr');
      var coins = [];
      for (var i = 0; i < arr.length; i++) {
        var s = arr[i].symbol;
        if (s.slice(-4) !== 'USDT') continue;
        var base = s.slice(0, -4);
        if (/(UP|DOWN|BULL|BEAR)$/.test(base)) continue; // leveraged tokens
        if (STABLE[base]) continue;
        var vol = parseFloat(arr[i].quoteVolume), chg = parseFloat(arr[i].priceChangePercent), price = parseFloat(arr[i].lastPrice);
        if (!isFinite(vol) || !isFinite(chg) || !isFinite(price)) continue;
        coins.push({ base: base, price: price, chg: chg, vol: vol });
      }
      coins.sort(function (a, b) { return b.vol - a.vol; });   // most-traded first
      var liquid = coins.slice(0, 60);                          // only liquid coins (no random micro-caps)
      liquid.sort(function (a, b) { return b.chg - a.chg; });
      var picks = liquid.slice(0, 4).concat(liquid.slice(-4).reverse());
      renderMovers(list, picks);
      try { localStorage.setItem('mm_cache_movers', JSON.stringify(picks)); } catch (e) { /* ignore */ }
    } catch (e) {
      var cached = null;
      try { cached = JSON.parse(localStorage.getItem('mm_cache_movers') || 'null'); } catch (_) { /* ignore */ }
      if (cached && cached.length) renderMovers(list, cached);
      else list.innerHTML = '<p class="text-[12px] text-gray-darker lowercase">movers unavailable right now</p>';
    }
  }

  // ---- Market news (Finnhub general news, free) ----
  async function loadNews() {
    var list = document.getElementById('news-list');
    if (!list) return;
    try {
      var items = await getJson('https://finnhub.io/api/v1/news?category=general&token=' + FINNHUB_KEY);
      if (!items || !items.length) throw new Error('empty');
      var html = '';
      items.slice(0, 10).forEach(function (n) {
        if (!n.headline || !n.url) return;
        html += '<a href="' + escAttr(n.url) + '" target="_blank" rel="noopener noreferrer" class="block py-3 border-t border-dark-500 group">'
          + '<div class="flex items-baseline justify-between gap-4">'
          + '<div class="text-[13px] text-light-100 leading-snug group-hover:underline">' + escHtml(n.headline) + '</div>'
          + '<div class="text-[10px] text-gray-darker whitespace-nowrap flex-shrink-0 lowercase">' + escHtml((n.source || '').slice(0, 16)) + ' · ' + timeAgo(n.datetime) + '</div>'
          + '</div></a>';
      });
      list.innerHTML = html || '<p class="text-[12px] text-gray-darker lowercase">no news right now</p>';
    } catch (e) {
      list.innerHTML = '<p class="text-[12px] text-gray-darker lowercase">news unavailable right now</p>';
    }
  }

  function loadAll() { loadFNG(); loadMovers(); loadNews(); }

  var loaded = false;
  function ensureLoaded() {
    if (loaded) return;
    loaded = true;
    loadAll();
    setInterval(loadAll, 300000); // refresh every 5 min
  }

  function init() {
    // Lazy: only load when the user opens the Markets page (saves API calls).
    var btns = document.querySelectorAll('[data-target="markets"]');
    for (var i = 0; i < btns.length; i++) btns[i].addEventListener('click', ensureLoaded);
    var mk = document.getElementById('page-markets');
    if (mk && !mk.classList.contains('hidden')) ensureLoaded();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
