(function () {
  'use strict';

  var FINNHUB_KEY = 'd6or3l1r01qmqugc2a80d6or3l1r01qmqugc2a8g';

  function finnhubFetch(endpoint) {
    var url = 'https://finnhub.io/api/v1' + endpoint
      + (endpoint.indexOf('?') >= 0 ? '&' : '?')
      + 'token=' + FINNHUB_KEY;
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error('Finnhub ' + res.status);
      return res.json();
    });
  }

  function fmt(n, decimals) {
    if (n == null || isNaN(n)) return 'N/A';
    decimals = decimals != null ? decimals : 2;
    return Number(n).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }

  function fmtBig(n) {
    if (n == null || isNaN(n)) return 'N/A';
    if (Math.abs(n) >= 1e12) return '$' + fmt(n / 1e12) + 'T';
    if (Math.abs(n) >= 1e9) return '$' + fmt(n / 1e9) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + fmt(n / 1e6) + 'M';
    return '$' + fmt(n);
  }

  function fmtPct(n) {
    if (n == null || isNaN(n)) return 'N/A';
    return Number(n).toFixed(2) + '%';
  }

  function fmtDollar(n) {
    if (n == null || isNaN(n)) return 'N/A';
    return '$' + fmt(n);
  }

  function val(v) { return (v != null && v !== 0) ? v : null; }

  async function fetchStockData(ticker) {
    ticker = ticker.toUpperCase().trim();
    var results = await Promise.all([
      finnhubFetch('/quote?symbol=' + encodeURIComponent(ticker)),
      finnhubFetch('/stock/profile2?symbol=' + encodeURIComponent(ticker)),
      finnhubFetch('/stock/metric?symbol=' + encodeURIComponent(ticker) + '&metric=all'),
      finnhubFetch('/stock/recommendation?symbol=' + encodeURIComponent(ticker)),
      finnhubFetch('/stock/earnings?symbol=' + encodeURIComponent(ticker) + '&limit=4')
    ]);

    var quote = results[0];
    var profile = results[1];
    var metrics = results[2];
    var recommendations = results[3];
    var earnings = results[4];

    if (!quote || quote.c === 0 || quote.c == null) {
      throw new Error('No data found for ' + ticker);
    }

    return {
      ticker: ticker,
      quote: quote,
      profile: profile || {},
      metric: (metrics && metrics.metric) ? metrics.metric : {},
      recommendations: recommendations || [],
      earnings: earnings || []
    };
  }

  function buildSection(title, rows) {
    var html = '<div class="research-section">';
    html += '<h3 class="research-section-title">' + title + '</h3>';
    html += '<table class="research-table"><tbody>';
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      if (r.value === undefined || r.value === null) r.value = 'N/A';
      var colorClass = '';
      if (r.color === 'green') colorClass = ' class="val-positive"';
      else if (r.color === 'red') colorClass = ' class="val-negative"';
      html += '<tr><td class="research-label">' + r.label + '</td><td class="research-value"' + colorClass + '>' + r.value + '</td></tr>';
    }
    html += '</tbody></table></div>';
    return html;
  }

  function renderResults(d) {
    var q = d.quote;
    var p = d.profile;
    var m = d.metric;
    var ticker = d.ticker;
    var changePct = q.dp;
    var isUp = changePct != null && changePct >= 0;

    var html = '';

    // Header card
    html += '<div class="research-header">';
    html += '<div class="research-header-left">';
    html += '<h2 class="research-ticker">' + ticker + '</h2>';
    html += '<span class="research-name">' + (p.name || ticker) + '</span>';
    if (p.finnhubIndustry) html += '<span class="research-sector">' + p.finnhubIndustry + '</span>';
    html += '</div>';
    html += '<div class="research-header-right">';
    if (p.logo) html += '<img src="' + p.logo + '" alt="" style="width:40px;height:40px;border-radius:8px;margin-bottom:6px;">';
    html += '<span class="research-price">' + fmtDollar(q.c) + '</span>';
    html += '<span class="research-change ' + (isUp ? 'positive' : 'negative') + '">'
      + (isUp ? '+' : '') + (changePct != null ? changePct.toFixed(2) : '--') + '%</span>';
    html += '</div></div>';

    html += buildSection('Market Overview', [
      { label: 'Market Cap', value: fmtBig(val(p.marketCapitalization) ? p.marketCapitalization * 1e6 : null) },
      { label: 'Share Price', value: fmtDollar(q.c) },
      { label: 'Previous Close', value: fmtDollar(q.pc) },
      { label: 'Open', value: fmtDollar(q.o) },
      { label: 'Day High', value: fmtDollar(q.h) },
      { label: 'Day Low', value: fmtDollar(q.l) },
      { label: 'Change', value: q.d != null ? (q.d >= 0 ? '+' : '') + fmtDollar(q.d) : 'N/A', color: q.d >= 0 ? 'green' : 'red' },
      { label: '52W High', value: fmtDollar(val(m['52WeekHigh'])) },
      { label: '52W Low', value: fmtDollar(val(m['52WeekLow'])) },
      { label: '52W High Date', value: m['52WeekHighDate'] || 'N/A' },
      { label: '52W Low Date', value: m['52WeekLowDate'] || 'N/A' },
      { label: '10D Avg Volume', value: val(m['10DayAverageTradingVolume']) ? fmt(m['10DayAverageTradingVolume'] * 1e6, 0) : 'N/A' },
      { label: '3M Avg Volume', value: val(m['3MonthAverageTradingVolume']) ? fmt(m['3MonthAverageTradingVolume'] * 1e6, 0) : 'N/A' },
    ]);

    html += buildSection('Valuation', [
      { label: 'P/E (TTM)', value: val(m.peTTM) ? fmt(m.peTTM) : 'N/A' },
      { label: 'P/E (Annual)', value: val(m.peAnnual) ? fmt(m.peAnnual) : 'N/A' },
      { label: 'P/B (Quarterly)', value: val(m.pbQuarterly) ? fmt(m.pbQuarterly) : 'N/A' },
      { label: 'P/B (Annual)', value: val(m.pbAnnual) ? fmt(m.pbAnnual) : 'N/A' },
      { label: 'P/S (TTM)', value: val(m.psTTM) ? fmt(m.psTTM) : 'N/A' },
      { label: 'P/S (Annual)', value: val(m.psAnnual) ? fmt(m.psAnnual) : 'N/A' },
      { label: 'EV/EBITDA (Annual)', value: val(m['ev/ebitdaAnnual']) ? fmt(m['ev/ebitdaAnnual']) : 'N/A' },
      { label: 'P/FCF (TTM)', value: val(m.pfcfTTM) ? fmt(m.pfcfTTM) : 'N/A' },
    ]);

    html += buildSection('Financial Health', [
      { label: 'Revenue/Share (TTM)', value: val(m.revenuePerShareTTM) ? fmtDollar(m.revenuePerShareTTM) : 'N/A' },
      { label: 'Revenue/Share (Annual)', value: val(m.revenuePerShareAnnual) ? fmtDollar(m.revenuePerShareAnnual) : 'N/A' },
      { label: 'Net Income/Share', value: val(m.netIncomePerShareTTM) ? fmtDollar(m.netIncomePerShareTTM) : 'N/A' },
      { label: 'Cash/Share (Quarterly)', value: val(m.cashPerSharePerShareQuarterly) ? fmtDollar(m.cashPerSharePerShareQuarterly) : 'N/A' },
      { label: 'Current Ratio (Quarterly)', value: val(m.currentRatioQuarterly) ? fmt(m.currentRatioQuarterly) : 'N/A' },
      { label: 'Debt/Equity (Quarterly)', value: val(m.totalDebt_totalEquityQuarterly) ? fmt(m.totalDebt_totalEquityQuarterly) : 'N/A' },
      { label: 'LT Debt/Equity (Quarterly)', value: val(m.longTermDebt_equityQuarterly) ? fmt(m.longTermDebt_equityQuarterly) : 'N/A' },
      { label: 'Book Value/Share (Quarterly)', value: val(m.bookValuePerShareQuarterly) ? fmtDollar(m.bookValuePerShareQuarterly) : 'N/A' },
      { label: 'Tangible Book Value/Share', value: val(m.tangibleBookValuePerShareQuarterly) ? fmtDollar(m.tangibleBookValuePerShareQuarterly) : 'N/A' },
    ]);

    html += buildSection('Profitability & Growth', [
      { label: 'Gross Margin (TTM)', value: fmtPct(val(m.grossMarginTTM)) },
      { label: 'Gross Margin (5Y)', value: fmtPct(val(m.grossMargin5Y)) },
      { label: 'Operating Margin (TTM)', value: fmtPct(val(m.operatingMarginTTM)) },
      { label: 'Operating Margin (5Y)', value: fmtPct(val(m.operatingMargin5Y)) },
      { label: 'Net Profit Margin (TTM)', value: fmtPct(val(m.netProfitMarginTTM)) },
      { label: 'Net Profit Margin (5Y)', value: fmtPct(val(m.netProfitMargin5Y)) },
      { label: 'ROA (TTM)', value: fmtPct(val(m.roaTTM)) },
      { label: 'ROE (TTM)', value: fmtPct(val(m.roeTTM)) },
      { label: 'ROI (TTM)', value: fmtPct(val(m.roiTTM)) },
      { label: 'Revenue Growth (3Y)', value: fmtPct(val(m.revenueGrowth3Y)) },
      { label: 'Revenue Growth (5Y)', value: fmtPct(val(m.revenueGrowth5Y)) },
      { label: 'EPS Growth (TTM)', value: fmtPct(val(m.epsGrowthTTMYoy)) },
      { label: 'EPS Growth (3Y)', value: fmtPct(val(m.epsGrowth3Y)) },
      { label: 'EPS Growth (5Y)', value: fmtPct(val(m.epsGrowth5Y)) },
    ]);

    html += buildSection('Earnings Per Share', [
      { label: 'EPS (TTM)', value: val(m.epsTTM) ? fmtDollar(m.epsTTM) : 'N/A' },
      { label: 'EPS (Annual)', value: val(m.epsAnnual) ? fmtDollar(m.epsAnnual) : 'N/A' },
      { label: 'Book Value/Share', value: val(m.bookValuePerShareQuarterly) ? fmtDollar(m.bookValuePerShareQuarterly) : 'N/A' },
    ]);

    if (d.earnings && d.earnings.length > 0) {
      var qRows = [];
      for (var i = 0; i < d.earnings.length; i++) {
        var e = d.earnings[i];
        var actual = e.actual != null ? e.actual.toFixed(2) : 'N/A';
        var estimate = e.estimate != null ? e.estimate.toFixed(2) : 'N/A';
        var surprise = e.surprisePercent != null ? e.surprisePercent.toFixed(2) : null;
        qRows.push({
          label: (e.period || 'Q' + (i + 1)) + ' (Actual / Est)',
          value: '$' + actual + ' / $' + estimate + (surprise != null ? '  (' + (e.surprisePercent >= 0 ? '+' : '') + surprise + '% surprise)' : ''),
          color: surprise != null ? (e.surprisePercent >= 0 ? 'green' : 'red') : null
        });
      }
      html += buildSection('Quarterly Earnings History', qRows);
    }

    html += buildSection('Dividends & Yield', [
      { label: 'Dividend Yield (Indicated)', value: fmtPct(val(m.dividendYieldIndicatedAnnual)) },
      { label: 'Dividends/Share', value: val(m.dividendsPerShareTTM) ? fmtDollar(m.dividendsPerShareTTM) : 'N/A' },
      { label: 'Dividend Growth (5Y)', value: fmtPct(val(m.dividendGrowthRate5Y)) },
      { label: 'Payout Ratio', value: fmtPct(val(m.payoutRatioTTM)) },
      { label: 'Dividend Yield (5Y)', value: fmtPct(val(m['currentDividendYieldTTM'])) },
    ]);

    html += buildSection('Shares & Beta', [
      { label: 'Shares Outstanding', value: val(p.shareOutstanding) ? fmt(p.shareOutstanding * 1e6, 0) : 'N/A' },
      { label: 'Beta', value: val(m.beta) ? fmt(m.beta) : 'N/A' },
    ]);

    if (d.recommendations && d.recommendations.length > 0) {
      var rec = d.recommendations[0];
      html += buildSection('Analyst Recommendations (' + rec.period + ')', [
        { label: 'Strong Buy', value: String(rec.strongBuy || 0), color: 'green' },
        { label: 'Buy', value: String(rec.buy || 0), color: 'green' },
        { label: 'Hold', value: String(rec.hold || 0) },
        { label: 'Sell', value: String(rec.sell || 0), color: 'red' },
        { label: 'Strong Sell', value: String(rec.strongSell || 0), color: 'red' },
      ]);
    }

    if (p.name) {
      var infoRows = [];
      if (p.exchange) infoRows.push({ label: 'Exchange', value: p.exchange });
      if (p.country) infoRows.push({ label: 'Country', value: p.country });
      if (p.ipo) infoRows.push({ label: 'IPO Date', value: p.ipo });
      if (p.weburl) infoRows.push({ label: 'Website', value: '<a href="' + p.weburl + '" target="_blank" style="color:#10b981">' + p.weburl + '</a>' });
      if (p.phone) infoRows.push({ label: 'Phone', value: p.phone });
      if (infoRows.length > 0) html += buildSection('Company Info', infoRows);
    }

    return html;
  }

  var searchInput = document.getElementById('research-search-input');
  var searchBtn = document.getElementById('research-search-btn');
  var resultsContainer = document.getElementById('research-results');
  var loadingEl = document.getElementById('research-loading');
  var errorEl = document.getElementById('research-error');

  if (!searchInput || !searchBtn) return;

  async function doSearch() {
    var ticker = searchInput.value.trim();
    if (!ticker) return;

    resultsContainer.innerHTML = '';
    errorEl.style.display = 'none';
    errorEl.classList.add('hidden');
    loadingEl.style.display = 'flex';
    loadingEl.classList.remove('hidden');

    try {
      var data = await fetchStockData(ticker);
      resultsContainer.innerHTML = renderResults(data);
    } catch (e) {
      var errP = errorEl.querySelector('p');
      if (errP) errP.textContent = 'Could not fetch data for "' + ticker.toUpperCase() + '". Check the ticker and try again.';
      errorEl.style.display = 'block';
      errorEl.classList.remove('hidden');
    } finally {
      loadingEl.style.display = 'none';
      loadingEl.classList.add('hidden');
    }
  }

  searchBtn.addEventListener('click', doSearch);
  searchInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') doSearch();
  });
})();
