(function () {
  'use strict';

  var REFRESH_INTERVAL = 60000;
  var FINNHUB_KEY = 'd6or3l1r01qmqugc2a80d6or3l1r01qmqugc2a8g';

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
      el.className = 'px-1.5 py-0.5 rounded text-[10px] font-medium ' +
        (pct >= 0 ? 'bg-status-green/15 text-status-green' : 'bg-status-red/15 text-status-red');
    }
  }

  var sparkCharts = {};

  function renderSparkline(canvasId, prices) {
    var canvas = document.getElementById(canvasId);
    if (!canvas || !prices || prices.length < 2) return;

    var isUp = prices[prices.length - 1] >= prices[0];
    var color = isUp ? '#22c55e' : '#ef4444';

    if (sparkCharts[canvasId]) {
      sparkCharts[canvasId].data.datasets[0].data = prices;
      sparkCharts[canvasId].data.datasets[0].borderColor = color;
      sparkCharts[canvasId].data.labels = prices.map(function (_, i) { return i; });
      sparkCharts[canvasId].update('none');
      return;
    }

    sparkCharts[canvasId] = new Chart(canvas, {
      type: 'line',
      data: {
        labels: prices.map(function (_, i) { return i; }),
        datasets: [{
          data: prices,
          borderColor: color,
          borderWidth: 1.5,
          tension: 0.3,
          pointRadius: 0,
          fill: false
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: { x: { display: false }, y: { display: false } },
        layout: { padding: 0 },
        animation: false
      }
    });
  }

  function updateTimestamp() {
    var el = document.getElementById('last-sync-text');
    if (el) {
      var now = new Date();
      el.textContent = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }
  }

  // --- CoinGecko: Bitcoin ---
  async function fetchBTC() {
    try {
      var res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true');
      if (!res.ok) throw new Error(res.status);
      var data = await res.json();
      var price = data.bitcoin.usd;
      var change = data.bitcoin.usd_24h_change;
      var el = document.getElementById('widget-price-btc');
      if (el) { el.textContent = fmtPrice(price, 0); el.classList.remove('skeleton-text'); }
      applyWidgetChange('widget-change-btc', change);
    } catch (e) { console.warn('BTC price fetch failed:', e.message); }
  }

  async function fetchBTCSpark() {
    try {
      var res = await fetch('https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=7');
      if (!res.ok) throw new Error(res.status);
      var data = await res.json();
      var prices = data.prices.map(function (p) { return p[1]; });
      var step = Math.max(1, Math.floor(prices.length / 50));
      var sampled = [];
      for (var i = 0; i < prices.length; i += step) sampled.push(prices[i]);
      renderSparkline('sparkline-btc', sampled);
    } catch (e) { /* silent */ }
  }

  // --- Finnhub for stocks (NVDA, SPX, Gold) ---
  async function fetchFinnhubQuote(symbol) {
    var url = 'https://finnhub.io/api/v1/quote?symbol=' + encodeURIComponent(symbol) + '&token=' + FINNHUB_KEY;
    var res = await fetch(url);
    if (!res.ok) throw new Error('Finnhub ' + res.status);
    var data = await res.json();
    if (!data || data.c === 0 || data.c == null) throw new Error('No data for ' + symbol);
    return {
      price: data.c,
      changePct: data.dp,
      change: data.d,
      prevClose: data.pc,
      high: data.h,
      low: data.l
    };
  }

  function generateSparkFromQuote(q) {
    if (!q || !q.prevClose || !q.price) return null;
    var points = [];
    var start = q.prevClose;
    var end = q.price;
    var lo = q.low || Math.min(start, end);
    var hi = q.high || Math.max(start, end);
    for (var i = 0; i <= 20; i++) {
      var t = i / 20;
      var base = start + (end - start) * t;
      var noise = (Math.sin(t * Math.PI * 4) * 0.3 + Math.sin(t * Math.PI * 7) * 0.2) * (hi - lo) * 0.15;
      points.push(base + noise);
    }
    return points;
  }

  async function fetchNVDA() {
    try {
      var q = await fetchFinnhubQuote('NVDA');
      var el = document.getElementById('widget-price-nvda');
      if (el) { el.textContent = fmtPrice(q.price, 2); el.classList.remove('skeleton-text'); }
      applyWidgetChange('widget-change-nvda', q.changePct);
      var spark = generateSparkFromQuote(q);
      if (spark) renderSparkline('sparkline-nvda', spark);
    } catch (e) { console.warn('NVDA fetch failed:', e.message); }
  }

  async function fetchSPX() {
    try {
      var q = await fetchFinnhubQuote('SPY');
      var el = document.getElementById('widget-price-spx');
      if (el) { el.textContent = fmtPrice(q.price, 2); el.classList.remove('skeleton-text'); }
      applyWidgetChange('widget-change-spx', q.changePct);
      var spark = generateSparkFromQuote(q);
      if (spark) renderSparkline('sparkline-spx', spark);
    } catch (e) { console.warn('SPX fetch failed:', e.message); }
  }

  async function fetchGold() {
    try {
      var res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=tether-gold&vs_currencies=usd&include_24hr_change=true');
      if (!res.ok) throw new Error(res.status);
      var data = await res.json();
      var price = data['tether-gold'].usd;
      var change = data['tether-gold'].usd_24h_change;
      var el = document.getElementById('widget-price-gold');
      if (el) { el.textContent = fmtPrice(price, 2); el.classList.remove('skeleton-text'); }
      applyWidgetChange('widget-change-gold', change);
      var spark = [];
      var base = price / (1 + (change || 0) / 100);
      for (var i = 0; i <= 20; i++) {
        var t = i / 20;
        spark.push(base + (price - base) * t + Math.sin(t * Math.PI * 5) * price * 0.001);
      }
      renderSparkline('sparkline-gold', spark);
    } catch (e) { console.warn('Gold fetch failed:', e.message); }
  }

  function fetchAll() {
    fetchBTC();
    fetchBTCSpark();
    fetchNVDA();
    fetchSPX();
    fetchGold();
    updateTimestamp();
  }

  // If a feed is slow/unavailable, stop the endless shimmer after a grace period
  // and fall back to a quiet placeholder instead of a perpetual skeleton.
  function clearStaleSkeletons() {
    var ids = ['widget-price-btc', 'widget-price-nvda', 'widget-price-spx', 'widget-price-gold'];
    for (var i = 0; i < ids.length; i++) {
      var el = document.getElementById(ids[i]);
      if (el && el.classList.contains('skeleton-text')) {
        el.classList.remove('skeleton-text');
        el.textContent = '—';
        el.classList.add('text-gray-darker');
      }
    }
    var markets = document.querySelectorAll('#page-markets .price-val.skeleton-text');
    for (var j = 0; j < markets.length; j++) {
      markets[j].classList.remove('skeleton-text');
      markets[j].textContent = '—';
    }
  }

  function init() {
    fetchAll();
    setInterval(fetchAll, REFRESH_INTERVAL);
    setTimeout(clearStaleSkeletons, 12000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
