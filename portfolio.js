(function () {
  'use strict';
  var FINNHUB_KEY = 'd6or3l1r01qmqugc2a80d6or3l1r01qmqugc2a8g';
  var REFRESH_INTERVAL = 60000;
  var DEFAULT_CRYPTO = [
    { id: 'bitcoin',  name: 'Bitcoin',  ticker: 'BTC', qty: 0, buy: 0 },
    { id: 'ethereum', name: 'Ethereum', ticker: 'ETH', qty: 0, buy: 0 },
    { id: 'solana',   name: 'Solana',   ticker: 'SOL', qty: 0, buy: 0 },
    { id: 'cardano',  name: 'Cardano',  ticker: 'ADA', qty: 0, buy: 0 },
    { id: 'ripple',   name: 'XRP',      ticker: 'XRP', qty: 0, buy: 0 },
  ];
  var DEFAULT_STOCKS = [
    { symbol: 'AAPL',  name: 'Apple Inc.',      qty: 0, buy: 0 },
    { symbol: 'NVDA',  name: 'NVIDIA Corp.',     qty: 0, buy: 0 },
    { symbol: 'TSLA',  name: 'Tesla Inc.',       qty: 0, buy: 0 },
    { symbol: 'GOOGL', name: 'Alphabet Inc.',    qty: 0, buy: 0 },
    { symbol: 'AMZN',  name: 'Amazon.com',       qty: 0, buy: 0 }
  ];
  function loadHoldings(key, defaults) {
    try { var saved = localStorage.getItem(key); if (saved) return JSON.parse(saved); } catch (e) { /* ignore */ }
    return defaults.map(function (h) { return Object.assign({}, h); });
  }
  function saveHoldings(key, holdings) {
    try { localStorage.setItem(key, JSON.stringify(holdings)); } catch (e) { /* ignore */ }
  }
  var cryptoHoldings = loadHoldings('mm_crypto', DEFAULT_CRYPTO);
  var stockHoldings = loadHoldings('mm_stocks', DEFAULT_STOCKS);
  function loadCache(k) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
  function saveCache(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } }
  function toast(msg) {
    var t = document.createElement('div');
    t.textContent = msg;
    t.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:rgb(var(--c-accent));color:rgb(var(--c-dark-950));font:400 12px "IBM Plex Mono",monospace;padding:10px 16px;border-radius:6px;z-index:300;box-shadow:0 6px 22px rgba(0,0,0,.25);max-width:90vw;text-align:center';
    document.body.appendChild(t);
    setTimeout(function () { t.style.transition = 'opacity .4s'; t.style.opacity = '0'; setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 400); }, 3000);
  }
  var cryptoPrices = loadCache('mm_cache_cryptoPx') || {};
  var stockPrices = loadCache('mm_cache_stockPx') || {};
  var cryptoImages = loadCache('mm_cache_cryptoImg') || {};
  var stockLogos = loadCache('mm_cache_stockLogos') || {};
  var COIN_LOGOS = {
    'bitcoin': 'https://assets.coingecko.com/coins/images/1/small/bitcoin.png',
    'ethereum': 'https://assets.coingecko.com/coins/images/279/small/ethereum.png',
    'solana': 'https://assets.coingecko.com/coins/images/4128/small/solana.png',
    'cardano': 'https://assets.coingecko.com/coins/images/975/small/cardano.png',
    'ripple': 'https://assets.coingecko.com/coins/images/44/small/xrp-symbol-white-128.png',
    'dogecoin': 'https://assets.coingecko.com/coins/images/5/small/dogecoin.png',
    'polkadot': 'https://assets.coingecko.com/coins/images/12171/small/polkadot.png',
    'avalanche-2': 'https://assets.coingecko.com/coins/images/12559/small/Avalanche_Circle_RedWhite_Trans.png',
    'chainlink': 'https://assets.coingecko.com/coins/images/877/small/chainlink-new-logo.png',
    'uniswap': 'https://assets.coingecko.com/coins/images/12504/small/uni.jpg'
  };
  function fmtPrice(n, decimals) {
    if (n == null || isNaN(n)) return '—';
    return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }
  function fmtChange(pct) {
    if (pct == null || isNaN(pct)) return '—';
    var sign = pct >= 0 ? '+' : '';
    return sign + pct.toFixed(2) + '%';
  }
  function tickerColor(str) {
    var hash = 0;
    for (var i = 0; i < str.length; i++) { hash = str.charCodeAt(i) + ((hash << 5) - hash); }
    var h = Math.abs(hash) % 360;
    return 'hsl(' + h + ', 50%, 45%)';
  }
  function escHtml(str) { var div = document.createElement('div'); div.textContent = str; return div.innerHTML; }
  function escAttr(str) { return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  /* P&L line: if user set a buy price + qty, show real profit/loss; otherwise show 24h change */
  function plHtml(price, holding, changePct) {
    var qty = holding.qty || 0;
    var buy = holding.buy || 0;
    if (price != null && qty > 0 && buy > 0) {
      var pl = (price - buy) * qty;
      var plPct = ((price - buy) / buy) * 100;
      var up = pl >= 0;
      return '<div class="text-[10px] ' + (up ? 'text-status-green' : 'text-status-red') + '">'
        + (up ? '+' : '−') + '$' + Math.abs(pl).toLocaleString('en-US', { maximumFractionDigits: 0 })
        + ' (' + (up ? '+' : '') + plPct.toFixed(1) + '%)</div>';
    }
    var isUp = changePct != null && changePct >= 0;
    return '<div class="text-[10px] ' + (isUp ? 'text-status-green' : 'text-status-red') + '">' + fmtChange(changePct) + '</div>';
  }

  function actionBtns(type, index) {
    // Always visible (hover-only icons were invisible on touch devices).
    return '<button class="edit-holding-btn text-gray-dim hover:text-light-100 transition-colors p-1" title="Edit" aria-label="Edit holding" data-type="' + type + '" data-index="' + index + '">'
      + '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"></path></svg>'
      + '</button>'
      + '<button class="remove-holding-btn text-gray-dim hover:text-status-red transition-colors p-1" title="Remove" aria-label="Remove holding" data-type="' + type + '" data-index="' + index + '">'
      + '<svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>'
      + '</button>';
  }

  function emptyStateHtml(message, addBtnId) {
    return '<div class="text-center py-8">'
      + '<p class="text-[11px] text-gray-darker mb-3">' + message + '</p>'
      + '<button class="empty-add-btn text-[10px] border border-accent/40 text-accent hover:bg-accent/10 px-3 py-1.5 rounded-md transition-colors" data-opens="' + addBtnId + '">+ Add your first entry</button>'
      + '</div>';
  }

  function bindRowButtons(list) {
    var removeBtns = list.querySelectorAll('.remove-holding-btn');
    for (var j = 0; j < removeBtns.length; j++) { removeBtns[j].addEventListener('click', handleRemove); }
    var editBtns = list.querySelectorAll('.edit-holding-btn');
    for (var k = 0; k < editBtns.length; k++) { editBtns[k].addEventListener('click', handleEdit); }
    var emptyBtns = list.querySelectorAll('.empty-add-btn');
    for (var m = 0; m < emptyBtns.length; m++) {
      emptyBtns[m].addEventListener('click', function () {
        var target = document.getElementById(this.getAttribute('data-opens'));
        if (target) target.click();
      });
    }
  }

  async function fetchCryptoPrices() {
    if (cryptoHoldings.length === 0) { renderCrypto(); return; }
    var ids = cryptoHoldings.map(function (h) { return h.id; }).join(',');
    try {
      var url = 'https://api.coingecko.com/api/v3/simple/price?ids=' + ids + '&vs_currencies=usd&include_24hr_change=true';
      var res = await fetch(url);
      if (!res.ok) throw new Error(res.status);
      var data = await res.json();
      for (var id in data) { cryptoPrices[id] = { price: data[id].usd, change: data[id].usd_24h_change }; }
    } catch (e) { console.warn('Crypto price fetch failed:', e.message); }
    try {
      var url2 = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=' + ids + '&per_page=50&page=1&sparkline=false&price_change_percentage=24h';
      var res2 = await fetch(url2);
      if (res2.ok) {
        var data2 = await res2.json();
        for (var i = 0; i < data2.length; i++) {
          var coin = data2[i];
          if (coin.image) cryptoImages[coin.id] = coin.image;
          if (coin.current_price) { cryptoPrices[coin.id] = { price: coin.current_price, change: coin.price_change_percentage_24h }; }
        }
      }
    } catch (e2) { /* silent - images are optional */ }
    saveCache('mm_cache_cryptoPx', cryptoPrices);
    saveCache('mm_cache_cryptoImg', cryptoImages);
    renderCrypto();
  }
  function getCryptoImage(holding) { return cryptoImages[holding.id] || COIN_LOGOS[holding.id] || holding.image || ''; }
  async function fetchStockPrices() {
    var promises = stockHoldings.map(function (h) { return fetchOneStock(h.symbol); });
    await Promise.allSettled(promises);
    saveCache('mm_cache_stockPx', stockPrices);
    renderStocks();
    fetchStockLogos();
  }

  // Company logos come from Finnhub's profile2 endpoint (cached so we only ask once).
  async function fetchStockLogos() {
    var need = stockHoldings.filter(function (h) { return stockLogos[h.symbol] === undefined; });
    if (need.length === 0) return;
    await Promise.allSettled(need.map(function (h) { return fetchOneStockLogo(h.symbol); }));
    saveCache('mm_cache_stockLogos', stockLogos);
    renderStocks();
  }
  async function fetchOneStockLogo(symbol) {
    try {
      var res = await fetch('https://finnhub.io/api/v1/stock/profile2?symbol=' + encodeURIComponent(symbol) + '&token=' + FINNHUB_KEY);
      if (!res.ok) throw new Error('profile ' + res.status);
      var data = await res.json();
      stockLogos[symbol] = (data && data.logo) ? data.logo : '';
    } catch (e) { stockLogos[symbol] = ''; }
  }
  async function fetchOneStock(symbol) {
    try {
      var res = await fetch('https://finnhub.io/api/v1/quote?symbol=' + encodeURIComponent(symbol) + '&token=' + FINNHUB_KEY);
      if (!res.ok) throw new Error('Finnhub ' + res.status);
      var data = await res.json();
      if (!data || data.c === 0 || data.c == null) return;
      stockPrices[symbol] = { price: data.c, change: data.dp };
    } catch (e) { console.warn('Stock fetch failed for ' + symbol + ':', e.message); }
  }

  function publishTopHoldings() {
    var all = [];
    function push(name, ticker, value, type) {
      if (value > 0) all.push({ name: name, ticker: ticker, value: value, type: type });
    }
    cryptoHoldings.forEach(function (h) {
      var p = cryptoPrices[h.id];
      if (p && h.qty > 0) push(h.name, h.ticker, p.price * h.qty, 'Crypto');
    });
    stockHoldings.forEach(function (h) {
      var p = stockPrices[h.symbol];
      if (p && h.qty > 0) push(h.name, h.symbol, p.price * h.qty, 'Stock');
    });
    all.sort(function (a, b) { return b.value - a.value; });
    window.__gallopTopHoldings = all;
  }

  function renderCrypto() {
    var list = document.getElementById('crypto-list');
    if (!list) return;
    if (cryptoHoldings.length === 0) {
      list.innerHTML = emptyStateHtml('No crypto tracked yet.', 'add-crypto-btn');
      bindRowButtons(list);
      publishTopHoldings();
      return;
    }
    var html = '';
    for (var i = 0; i < cryptoHoldings.length; i++) {
      var h = cryptoHoldings[i];
      var p = cryptoPrices[h.id];
      var price = p ? fmtPrice(p.price, p.price >= 100 ? 2 : 4) : '—';
      var value = (p && h.qty > 0) ? fmtPrice(p.price * h.qty, 2) : price;
      var numValue = (p && h.qty > 0) ? (p.price * h.qty) : 0;
      var qtyLabel = h.qty > 0 ? h.qty + ' ' + h.ticker : '';
      if (h.qty > 0 && h.buy > 0) qtyLabel += ' @ ' + fmtPrice(h.buy, h.buy >= 100 ? 2 : 4);
      var imgUrl = getCryptoImage(h);
      var fallbackDiv = '<div class="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style="background:' + tickerColor(h.ticker) + '">' + escHtml(h.ticker.substring(0, 3)) + '</div>';
      var logoHtml;
      if (imgUrl) { logoHtml = '<img src="' + escAttr(imgUrl) + '" alt="' + escAttr(h.ticker) + '" class="w-7 h-7 rounded-full" onerror="this.outerHTML=this.getAttribute(\'data-fallback\')" data-fallback="' + escAttr(fallbackDiv) + '">'; } else { logoHtml = fallbackDiv; }
      html += '<div class="holding-item flex items-center justify-between p-2 rounded-lg hover:bg-dark-700 transition-colors group" data-value="' + numValue + '">'
        + '<div class="flex items-center gap-3">'
        + '<div class="flex-shrink-0">' + logoHtml + '</div>'
        + '<div>'
        + '<div class="text-[12px] text-light-100 font-medium">' + escHtml(h.name) + '</div>'
        + '<div class="text-[10px] text-gray-darker uppercase tracking-wider">' + escHtml(h.ticker)
        + (qtyLabel ? ' · ' + escHtml(qtyLabel) : '') + '</div>'
        + '</div></div>'
        + '<div class="flex items-center gap-3">'
        + '<div class="text-right">'
        + '<div class="text-[13px] text-light-100 font-medium">' + value + '</div>'
        + plHtml(p ? p.price : null, h, p ? p.change : null)
        + '</div>'
        + actionBtns('crypto', i)
        + '</div></div>';
    }
    list.innerHTML = html;
    bindRowButtons(list);
    publishTopHoldings();
  }
  function renderStocks() {
    var list = document.getElementById('stock-list');
    if (!list) return;
    if (stockHoldings.length === 0) {
      list.innerHTML = emptyStateHtml('No stocks tracked yet.', 'add-stock-btn');
      bindRowButtons(list);
      publishTopHoldings();
      return;
    }
    var html = '';
    for (var i = 0; i < stockHoldings.length; i++) {
      var h = stockHoldings[i];
      var p = stockPrices[h.symbol];
      var price = p ? fmtPrice(p.price, 2) : '—';
      var value = (p && h.qty > 0) ? fmtPrice(p.price * h.qty, 2) : price;
      var numValue = (p && h.qty > 0) ? (p.price * h.qty) : 0;
      var qtyLabel = h.qty > 0 ? h.qty + ' shares' : '';
      if (h.qty > 0 && h.buy > 0) qtyLabel += ' @ ' + fmtPrice(h.buy, 2);
      var char = h.symbol.charAt(0);
      var stFallback = '<div class="w-7 h-7 rounded-full bg-accent text-dark-950 flex items-center justify-center text-[10px] font-bold">' + escHtml(char) + '</div>';
      var stLogo = stockLogos[h.symbol];
      var stLogoHtml = stLogo
        ? '<img src="' + escAttr(stLogo) + '" alt="' + escAttr(h.symbol) + '" class="w-7 h-7 rounded-full bg-white object-contain" onerror="this.outerHTML=this.getAttribute(\'data-fallback\')" data-fallback="' + escAttr(stFallback) + '">'
        : stFallback;
      html += '<div class="holding-item flex items-center justify-between p-2 rounded-lg hover:bg-dark-700 transition-colors group" data-value="' + numValue + '">'
        + '<div class="flex items-center gap-3">'
        + '<div class="flex-shrink-0">' + stLogoHtml + '</div>'
        + '<div>'
        + '<div class="text-[12px] text-light-100 font-medium">' + escHtml(h.name) + '</div>'
        + '<div class="text-[10px] text-gray-darker uppercase tracking-wider">' + escHtml(h.symbol)
        + (qtyLabel ? ' · ' + escHtml(qtyLabel) : '') + '</div>'
        + '</div></div>'
        + '<div class="flex items-center gap-3">'
        + '<div class="text-right">'
        + '<div class="text-[13px] text-light-100 font-medium">' + value + '</div>'
        + plHtml(p ? p.price : null, h, p ? p.change : null)
        + '</div>'
        + actionBtns('stock', i)
        + '</div></div>';
    }
    list.innerHTML = html;
    bindRowButtons(list);
    publishTopHoldings();
  }
  function handleRemove(e) {
    var btn = e.currentTarget;
    var type = btn.getAttribute('data-type');
    var idx = parseInt(btn.getAttribute('data-index'), 10);
    if (type === 'crypto') { cryptoHoldings.splice(idx, 1); saveHoldings('mm_crypto', cryptoHoldings); renderCrypto(); }
    else { stockHoldings.splice(idx, 1); saveHoldings('mm_stocks', stockHoldings); renderStocks(); }
  }
  function handleEdit(e) {
    var btn = e.currentTarget;
    var type = btn.getAttribute('data-type');
    var idx = parseInt(btn.getAttribute('data-index'), 10);
    if (type === 'crypto') {
      var h = cryptoHoldings[idx];
      var form = document.getElementById('add-crypto-form');
      form.querySelector('[name="coin-id"]').value = h.id;
      form.querySelector('[name="coin-ticker"]').value = h.ticker;
      form.querySelector('[name="coin-name"]').value = h.name;
      form.querySelector('[name="coin-qty"]').value = h.qty || '';
      form.querySelector('[name="coin-buy"]').value = h.buy || '';
      form.dataset.editIndex = idx;
      form.classList.remove('hidden');
      form.querySelector('[name="coin-qty"]').focus();
    } else {
      var hs = stockHoldings[idx];
      var formS = document.getElementById('add-stock-form');
      formS.querySelector('[name="stock-symbol"]').value = hs.symbol;
      formS.querySelector('[name="stock-name"]').value = hs.name;
      formS.querySelector('[name="stock-qty"]').value = hs.qty || '';
      formS.querySelector('[name="stock-buy"]').value = hs.buy || '';
      formS.dataset.editIndex = idx;
      formS.classList.remove('hidden');
      formS.querySelector('[name="stock-qty"]').focus();
    }
  }
  // Search CoinGecko by name/ticker so users never need to hunt for a coin id.
  function setupCoinSearch() {
    var input = document.getElementById('coin-search');
    var results = document.getElementById('coin-search-results');
    var form = document.getElementById('add-crypto-form');
    if (!input || !results || !form) return;
    var timer = null;

    function hide() { results.classList.add('hidden'); results.innerHTML = ''; }

    input.addEventListener('input', function () {
      var q = input.value.trim();
      clearTimeout(timer);
      if (q.length < 2) { hide(); return; }
      timer = setTimeout(function () { doSearch(q); }, 350);
    });

    async function doSearch(q) {
      try {
        var res = await fetch('https://api.coingecko.com/api/v3/search?query=' + encodeURIComponent(q));
        if (!res.ok) throw new Error(res.status);
        var data = await res.json();
        var coins = (data.coins || []).slice(0, 7);
        if (!coins.length) {
          results.innerHTML = '<div class="px-3 py-2 text-[11px] text-gray-darker">no matches</div>';
          results.classList.remove('hidden');
          return;
        }
        var html = '';
        coins.forEach(function (c) {
          html += '<button type="button" class="coin-pick w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-dark-700 transition-colors" data-id="' + escAttr(c.id) + '" data-sym="' + escAttr((c.symbol || '').toUpperCase()) + '" data-name="' + escAttr(c.name) + '">'
            + (c.thumb ? '<img src="' + escAttr(c.thumb) + '" class="w-4 h-4 rounded-full" alt="">' : '')
            + '<span class="text-[12px] text-light-100">' + escHtml(c.name) + '</span>'
            + '<span class="text-[10px] text-gray-dim uppercase">' + escHtml(c.symbol) + '</span>'
            + '</button>';
        });
        results.innerHTML = html;
        results.classList.remove('hidden');
        var picks = results.querySelectorAll('.coin-pick');
        for (var i = 0; i < picks.length; i++) {
          picks[i].addEventListener('click', function () {
            form.querySelector('[name="coin-id"]').value = this.getAttribute('data-id');
            form.querySelector('[name="coin-ticker"]').value = this.getAttribute('data-sym');
            form.querySelector('[name="coin-name"]').value = this.getAttribute('data-name');
            input.value = this.getAttribute('data-name');
            hide();
            var qty = form.querySelector('[name="coin-qty"]'); if (qty) qty.focus();
          });
        }
      } catch (e) { hide(); }
    }

    document.addEventListener('click', function (e) {
      if (!results.contains(e.target) && e.target !== input) hide();
    });
  }

  function setupAddCrypto() {
    var btn = document.getElementById('add-crypto-btn');
    var form = document.getElementById('add-crypto-form');
    if (!btn || !form) return;
    btn.addEventListener('click', function () { delete form.dataset.editIndex; form.classList.toggle('hidden'); if (!form.classList.contains('hidden')) form.querySelector('input').focus(); });
    var cancelBtn = form.querySelector('.cancel-btn');
    if (cancelBtn) cancelBtn.addEventListener('click', function () { delete form.dataset.editIndex; form.classList.add('hidden'); });
    var submitBtn = form.querySelector('.btn-primary');
    if (!submitBtn) return;
    submitBtn.addEventListener('click', function () {
      var idInput = form.querySelector('[name="coin-id"]');
      var nameInput = form.querySelector('[name="coin-name"]');
      var tickerInput = form.querySelector('[name="coin-ticker"]');
      var qtyInput = form.querySelector('[name="coin-qty"]');
      var buyInput = form.querySelector('[name="coin-buy"]');
      var id = idInput.value.trim().toLowerCase();
      var name = nameInput.value.trim();
      var ticker = tickerInput.value.trim().toUpperCase();
      var qty = parseFloat(qtyInput.value) || 0;
      var buy = parseFloat(buyInput.value) || 0;
      if (!id || !ticker) return;
      var entry = { id: id, name: name || ticker, ticker: ticker, qty: qty, buy: buy };
      var editIdx = form.dataset.editIndex;
      if (editIdx !== undefined) { cryptoHoldings[parseInt(editIdx, 10)] = entry; delete form.dataset.editIndex; }
      else { cryptoHoldings.push(entry); }
      saveHoldings('mm_crypto', cryptoHoldings);
      idInput.value = ''; nameInput.value = ''; tickerInput.value = ''; qtyInput.value = ''; buyInput.value = '';
      var cs = document.getElementById('coin-search'); if (cs) cs.value = '';
      form.classList.add('hidden');
      fetchCryptoPrices();
      // Don't trust a single fast check — CoinGecko can be slow/rate-limited and we
      // don't want a false "couldn't find" toast. Poll a few times before complaining.
      (function (addedId) {
        var tries = 0;
        (function check() {
          if (cryptoPrices[addedId]) return; // price arrived → it's valid, stay quiet
          if (++tries >= 6) { toast('couldn’t find "' + addedId + '" on coingecko — check the coin id'); return; }
          fetchCryptoPrices();
          setTimeout(check, 2500);
        })();
      })(id);
    });
  }
  function setupAddStock() {
    var btn = document.getElementById('add-stock-btn');
    var form = document.getElementById('add-stock-form');
    if (!btn || !form) return;
    btn.addEventListener('click', function () { delete form.dataset.editIndex; form.classList.toggle('hidden'); if (!form.classList.contains('hidden')) form.querySelector('input').focus(); });
    var cancelBtn = form.querySelector('.cancel-btn');
    if (cancelBtn) cancelBtn.addEventListener('click', function () { delete form.dataset.editIndex; form.classList.add('hidden'); });
    var submitBtn = form.querySelector('.btn-primary');
    if (!submitBtn) return;
    submitBtn.addEventListener('click', function () {
      var symbolInput = form.querySelector('[name="stock-symbol"]');
      var nameInput = form.querySelector('[name="stock-name"]');
      var qtyInput = form.querySelector('[name="stock-qty"]');
      var buyInput = form.querySelector('[name="stock-buy"]');
      var symbol = symbolInput.value.trim().toUpperCase();
      var name = nameInput.value.trim();
      var qty = parseFloat(qtyInput.value) || 0;
      var buy = parseFloat(buyInput.value) || 0;
      if (!symbol) return;
      var entry = { symbol: symbol, name: name || symbol, qty: qty, buy: buy };
      var editIdx = form.dataset.editIndex;
      if (editIdx !== undefined) { stockHoldings[parseInt(editIdx, 10)] = entry; delete form.dataset.editIndex; }
      else { stockHoldings.push(entry); }
      saveHoldings('mm_stocks', stockHoldings);
      symbolInput.value = ''; nameInput.value = ''; qtyInput.value = ''; buyInput.value = '';
      form.classList.add('hidden');
      fetchStockPrices();
      (function (sym) {
        var tries = 0;
        (function check() {
          if (stockPrices[sym]) return;
          if (++tries >= 6) { toast('no price for "' + sym + '" — check the ticker symbol'); return; }
          fetchStockPrices();
          setTimeout(check, 2500);
        })();
      })(symbol);
    });
  }
  function init() {
    renderCrypto(); renderStocks(); setupAddCrypto(); setupAddStock(); setupCoinSearch(); fetchCryptoPrices(); fetchStockPrices();
    setInterval(function () { fetchCryptoPrices(); fetchStockPrices(); }, REFRESH_INTERVAL);

    // Called by cloud.js after a sign-in/cloud pull so synced holdings appear
    // without a full-page reload.
    window.__gallopReload = function () {
      cryptoHoldings = loadHoldings('mm_crypto', DEFAULT_CRYPTO);
      stockHoldings = loadHoldings('mm_stocks', DEFAULT_STOCKS);
      renderCrypto(); renderStocks();
      fetchCryptoPrices(); fetchStockPrices();
    };

    // One-tap demo portfolio for first-time users.
    window.__gallopLoadSample = function () {
      function setQty(arr, key, sym, qty, buy) {
        for (var i = 0; i < arr.length; i++) {
          if ((arr[i].ticker || arr[i].symbol) === sym) { arr[i].qty = qty; arr[i].buy = buy || 0; }
        }
        saveHoldings(key, arr);
      }
      setQty(cryptoHoldings, 'mm_crypto', 'BTC', 0.05, 60000);
      setQty(cryptoHoldings, 'mm_crypto', 'ETH', 1.5, 2500);
      setQty(stockHoldings, 'mm_stocks', 'NVDA', 10, 120);
      setQty(stockHoldings, 'mm_stocks', 'AAPL', 15, 180);
      try { localStorage.setItem('mm_cash', '5000'); } catch (e) { /* ignore */ }
      renderCrypto(); renderStocks();
      fetchCryptoPrices(); fetchStockPrices();
      toast('sample portfolio loaded — edit or remove anytime');
    };
  }
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }
})();
