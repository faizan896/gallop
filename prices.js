(function () {
  'use strict';

  var REFRESH_INTERVAL = 60000;
  var FINNHUB_KEY = 'd6or3l1r01qmqugc2a80d6or3l1r01qmqugc2a8g';
  var PYTH_SPY = '19e09bb805456ada3979a7d1cbb4b6d63babc3a0f8e8a9509f68afa5c4c11cd5'; // Pyth SPY feed
  var KEYS = ['btc', 'nvda', 'spx', 'gold'];

  function fmtPrice(n, decimals) {
    if (n == null || isNaN(n)) return '--';
    return '$' + Number(n).toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });
  }

  function fmtChange(pct) {
    if (pct == null || isNaN(pct)) return '--';
    var sign = pct >= 0 ? '+' : '';
    return sign + pct.toFixed(2) + '%';
  }

  function applyWidgetChange(elId, pct) {
    var el = document.getElementById(elId);
    if (!el) return;
    el.textContent = fmtChange(pct);
    if (pct != null && !isNaN(pct)) {
      el.className = 'wl-chg ' + (pct >= 0 ? 'text-status-green' : 'text-status-red');
    }
  }

  // ---- last-known-price cache (so feeds that rate-limit don't go blank) ----
  function cacheGet(key) {
    try { var v = localStorage.getItem('mm_px_' + key); return v ? JSON.parse(v) : null; } catch (e) { return null; }
  }
  function cacheSet(key, obj) {
    try { localStorage.setItem('mm_px_' + key, JSON.stringify(obj)); } catch (e) { /* ignore */ }
  }

  // ---- fetch with a couple of retries + small backoff ----
  async function fetchJsonRetry(url, tries) {
    tries = tries || 3;
    for (var i = 0; i < tries; i++) {
      try {
        var r = await fetch(url);
        if (r.ok) return await r.json();
      } catch (e) { /* network blip */ }
      if (i < tries - 1) await new Promise(function (res) { setTimeout(res, 700 * (i + 1)); });
    }
    throw new Error('fetch failed: ' + url);
  }

  function setWidget(key, price, pct, dec) {
    var el = document.getElementById('widget-price-' + key);
    if (el) { el.textContent = fmtPrice(price, dec); el.classList.remove('skeleton-text', 'text-gray-darker'); }
    applyWidgetChange('widget-change-' + key, pct);
    cacheSet(key, { p: price, c: pct, d: dec, t: Date.now() });
  }

  function updateTimestamp() {
    var el = document.getElementById('last-sync-text');
    if (el) {
      var now = new Date();
      el.textContent = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }
  }

  // --- BTC + Gold: Binance (reliable, no key) first, CoinGecko as fallback ---
  async function fetchCryptoSpot() {
    // One Binance call for both Bitcoin and PAX Gold (≈ gold spot per oz).
    try {
      var url = 'https://api.binance.com/api/v3/ticker/24hr?symbols=' + encodeURIComponent('["BTCUSDT","PAXGUSDT"]');
      var arr = await fetchJsonRetry(url, 2);
      var map = {};
      arr.forEach(function (x) { map[x.symbol] = x; });
      var ok = true;
      if (map.BTCUSDT) setWidget('btc', parseFloat(map.BTCUSDT.lastPrice), parseFloat(map.BTCUSDT.priceChangePercent), 0); else ok = false;
      if (map.PAXGUSDT) setWidget('gold', parseFloat(map.PAXGUSDT.lastPrice), parseFloat(map.PAXGUSDT.priceChangePercent), 2); else ok = false;
      if (ok) return;
    } catch (e) { /* Binance may be geo-blocked — fall back to CoinGecko */ }

    try {
      var data = await fetchJsonRetry('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,tether-gold&vs_currencies=usd&include_24hr_change=true', 2);
      if (data.bitcoin) setWidget('btc', data.bitcoin.usd, data.bitcoin.usd_24h_change, 0);
      if (data['tether-gold']) setWidget('gold', data['tether-gold'].usd, data['tether-gold'].usd_24h_change, 2);
    } catch (e) { console.warn('BTC/Gold fetch failed:', e.message); }
  }

  // --- Finnhub quote (used for NVDA) ---
  async function fetchFinnhubQuote(symbol) {
    var data = await fetchJsonRetry('https://finnhub.io/api/v1/quote?symbol=' + encodeURIComponent(symbol) + '&token=' + FINNHUB_KEY);
    if (!data || data.c === 0 || data.c == null) throw new Error('No data for ' + symbol);
    return { price: data.c, changePct: data.dp };
  }

  async function fetchNVDA() {
    try {
      var q = await fetchFinnhubQuote('NVDA');
      setWidget('nvda', q.price, q.changePct, 2);
    } catch (e) { console.warn('NVDA fetch failed:', e.message); }
  }

  async function fetchSPX() {
    try {
      // S&P 500 via Pyth oracle — SPY ETF feed × 10 ≈ index. Free, no key, real-time, client-side.
      var d = await fetchJsonRetry('https://hermes.pyth.network/v2/updates/price/latest?ids[]=' + PYTH_SPY);
      var pr = d && d.parsed && d.parsed[0] && d.parsed[0].price;
      if (!pr) throw new Error('no pyth data');
      var spx = Number(pr.price) * Math.pow(10, pr.expo) * 10;
      // Pyth's latest feed has no 24h %, so take the change figure from Finnhub's SPY quote.
      var pct = null;
      try { var q = await fetchFinnhubQuote('SPY'); pct = q.changePct; } catch (e) { /* price still shows */ }
      setWidget('spx', spx, pct, 2);
    } catch (e) { console.warn('SPX (Pyth) fetch failed:', e.message); }
  }

  // Show last-known prices instantly (before fresh data lands), so nothing is blank on load.
  function showCached() {
    KEYS.forEach(function (key) {
      var c = cacheGet(key);
      if (c && c.p != null) {
        var el = document.getElementById('widget-price-' + key);
        if (el) { el.textContent = fmtPrice(c.p, c.d); el.classList.remove('skeleton-text', 'text-gray-darker'); }
        applyWidgetChange('widget-change-' + key, c.c);
      }
    });
  }

  // After a grace period, fill any still-loading slot with the cached value, or a quiet dash.
  function fillStale() {
    KEYS.forEach(function (key) {
      var el = document.getElementById('widget-price-' + key);
      if (el && el.classList.contains('skeleton-text')) {
        var c = cacheGet(key);
        if (c && c.p != null) { el.textContent = fmtPrice(c.p, c.d); applyWidgetChange('widget-change-' + key, c.c); }
        else { el.textContent = '—'; el.classList.add('text-gray-darker'); }
        el.classList.remove('skeleton-text');
      }
    });
    var markets = document.querySelectorAll('#page-markets .price-val.skeleton-text');
    for (var j = 0; j < markets.length; j++) {
      markets[j].classList.remove('skeleton-text');
      if (markets[j].textContent === '--' || markets[j].textContent === '') markets[j].textContent = '—';
    }
  }

  function fetchAll() {
    fetchCryptoSpot();
    fetchNVDA();
    fetchSPX();
    updateTimestamp();
  }

  function init() {
    showCached();
    fetchAll();
    setInterval(fetchAll, REFRESH_INTERVAL);
    setTimeout(fillStale, 12000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
