(function () {
  'use strict';

  var SNAPSHOTS_KEY = 'mm_portfolio_snapshots';
  var viewMode = 'networth';

  // theme-aware colors pulled from CSS variables (so charts adapt to light/dark)
  function cssRgb(name) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v ? 'rgb(' + v + ')' : '#888';
  }
  function cssRgba(name, a) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v ? 'rgba(' + v.split(/\s+/).join(',') + ',' + a + ')' : 'rgba(136,136,136,' + a + ')';
  }

  function loadSnapshots() {
    try { var raw = localStorage.getItem(SNAPSHOTS_KEY); if (raw) return JSON.parse(raw); } catch (e) { /* ignore */ }
    return [];
  }

  function saveSnapshots(list) {
    try { localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(list)); } catch (e) { /* ignore */ }
  }

  var snapshots = loadSnapshots();

  function fmtMoney(n) {
    if (n == null || isNaN(n)) return '$0';
    return '$' + Math.round(n).toLocaleString('en-US');
  }

  function getPortfolioValueFromDOM(listId) {
    var total = 0;
    var list = document.getElementById(listId);
    if (!list) return 0;
    var items = list.querySelectorAll('[data-value]');
    for (var j = 0; j < items.length; j++) {
      var num = parseFloat(items[j].getAttribute('data-value'));
      if (!isNaN(num)) total += num;
    }
    return total;
  }

  function getCurrentNetWorth() {
    var cash = 0;
    try { var v = localStorage.getItem('mm_cash'); if (v !== null) cash = parseFloat(v) || 0; } catch (e) { /* ignore */ }
    var crypto = getPortfolioValueFromDOM('crypto-list');
    var stocks = getPortfolioValueFromDOM('stock-list');
    return cash + crypto + stocks;
  }

  function recordSnapshot() {
    var nw = getCurrentNetWorth();
    var today = new Date().toISOString().slice(0, 10);
    if (snapshots.length > 0 && snapshots[snapshots.length - 1].date === today) {
      snapshots[snapshots.length - 1].value = nw;
    } else {
      snapshots.push({ date: today, value: nw });
    }
    if (snapshots.length > 365) snapshots = snapshots.slice(-365);
    saveSnapshots(snapshots);
  }

  /* Fill missing days so the x-axis is proportional to real time.
     Carries the last known value forward across gaps. */
  function fillDailyGaps(snaps) {
    if (snaps.length < 2) return snaps.slice();
    var filled = [];
    var MS_DAY = 86400000;
    for (var i = 0; i < snaps.length; i++) {
      filled.push(snaps[i]);
      if (i === snaps.length - 1) break;
      var cur = new Date(snaps[i].date + 'T00:00:00Z').getTime();
      var next = new Date(snaps[i + 1].date + 'T00:00:00Z').getTime();
      for (var t = cur + MS_DAY; t < next; t += MS_DAY) {
        filled.push({ date: new Date(t).toISOString().slice(0, 10), value: snaps[i].value, interpolated: true });
      }
    }
    return filled;
  }

  var overviewChart = null;

  function renderChart() {
    var ctx = document.getElementById('overview-chart');
    if (!ctx) return;

    var heroVal = document.getElementById('chart-total-display');
    recordSnapshot();

    var currentNW = getCurrentNetWorth();
    if (snapshots.length < 1) {
      if (heroVal) heroVal.textContent = fmtMoney(currentNW);
      if (overviewChart) { overviewChart.destroy(); overviewChart = null; }
      return;
    }
    if (snapshots.length === 1) {
      var s = snapshots[0];
      var yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      snapshots.unshift({ date: yesterday.toISOString().slice(0, 10), value: s.value });
    }

    var series = fillDailyGaps(snapshots);

    var labels = series.map(function (s) {
      var parts = s.date.split('-');
      var monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return monthNames[parseInt(parts[1], 10) - 1] + ' ' + parseInt(parts[2], 10);
    });

    var values, labelText, lineColor, fillColor;

    if (viewMode === 'returns') {
      var baseVal = series[0].value;
      values = series.map(function (s) {
        return baseVal > 0 ? ((s.value - baseVal) / baseVal) * 100 : 0;
      });
      var currentReturn = values[values.length - 1];
      labelText = (currentReturn >= 0 ? '+' : '') + currentReturn.toFixed(2) + '%';
      lineColor = currentReturn >= 0 ? cssRgb('--c-status-green') : cssRgb('--c-status-red');
      fillColor = currentReturn >= 0 ? cssRgba('--c-status-green', 0.08) : cssRgba('--c-status-red', 0.08);
    } else {
      values = series.map(function (s) { return s.value; });
      labelText = fmtMoney(values[values.length - 1]);
      lineColor = cssRgb('--c-light-100');
      fillColor = cssRgba('--c-light-100', 0.05);
    }

    if (heroVal) heroVal.textContent = labelText;

    if (overviewChart) {
      overviewChart.data.labels = labels;
      overviewChart.data.datasets[0].data = values;
      overviewChart.data.datasets[0].borderColor = lineColor;
      overviewChart.data.datasets[0].backgroundColor = fillColor;
      overviewChart.data.datasets[0].pointRadius = values.length > 30 ? 0 : 4;
      overviewChart.options.scales.y.ticks.callback = viewMode === 'returns'
        ? function (v) { return v.toFixed(1) + '%'; }
        : function (v) { return v >= 1000 ? '$' + (v / 1000).toFixed(1) + 'k' : '$' + v; };
      overviewChart.update();
      return;
    }

    overviewChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: viewMode === 'returns' ? 'Return' : 'Net Worth',
          data: values,
          borderColor: lineColor,
          backgroundColor: fillColor,
          fill: true,
          tension: 0.4,
          pointRadius: values.length > 30 ? 0 : 4,
          pointHoverRadius: 6,
          pointBackgroundColor: lineColor,
          pointHoverBackgroundColor: cssRgb('--c-dark-950'),
          borderWidth: 1.5
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 350 },
        interaction: { intersect: false, mode: 'index' },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: cssRgb('--c-light-100'),
            titleFont: { size: 12, weight: '500' },
            bodyFont: { size: 13, weight: '500' },
            titleColor: cssRgba('--c-dark-950', 0.65),
            bodyColor: cssRgb('--c-dark-950'),
            padding: 12,
            cornerRadius: 4,
            borderColor: cssRgba('--c-dark-950', 0.2),
            borderWidth: 1,
            callbacks: {
              label: viewMode === 'returns'
                ? function (c) { return (c.parsed.y >= 0 ? '+' : '') + c.parsed.y.toFixed(2) + '%'; }
                : function (c) { return fmtMoney(c.parsed.y); }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: { color: cssRgb('--c-gray-dim'), font: { size: 10, family: 'IBM Plex Mono' }, maxTicksLimit: 8 }
          },
          y: {
            grid: { color: cssRgba('--c-light-100', 0.06) },
            border: { display: false },
            ticks: {
              color: cssRgb('--c-gray-dim'),
              font: { size: 10, family: 'IBM Plex Mono' },
              callback: viewMode === 'returns'
                ? function (v) { return v.toFixed(1) + '%'; }
                : function (v) { return v >= 1000 ? '$' + (v / 1000).toFixed(1) + 'k' : '$' + v; }
            }
          }
        }
      }
    });
  }

  var allocChart = null;

  function renderAllocationChart() {
    var ctx = document.getElementById('allocation-chart');
    if (!ctx) return;

    var cash = 0;
    try { var v = localStorage.getItem('mm_cash'); if (v !== null) cash = parseFloat(v) || 0; } catch (e) { /* ignore */ }

    var crypto = getPortfolioValueFromDOM('crypto-list');
    var stocks = getPortfolioValueFromDOM('stock-list');
    var total = cash + crypto + stocks;

    var data = [stocks, crypto, cash];
    var labels = ['Stocks', 'Crypto', 'Cash'];
    var colors = ['#3a4a78', '#9c7a52', '#a8a49c'];

    if (allocChart) {
      allocChart.data.datasets[0].data = data;
      allocChart.update();
    } else {
      allocChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: labels,
          datasets: [{
            data: data,
            backgroundColor: colors,
            borderWidth: 0,
            hoverOffset: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          animation: { duration: 0 },
          cutout: '80%',
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: cssRgb('--c-light-100'),
              titleColor: cssRgba('--c-dark-950', 0.65),
              bodyColor: cssRgb('--c-dark-950'),
              titleFont: { size: 12, weight: '500' },
              bodyFont: { size: 12 },
              padding: 12,
              cornerRadius: 4,
              borderColor: cssRgba('--c-dark-950', 0.2),
              borderWidth: 1,
              callbacks: {
                label: function (context) {
                  var pct = total > 0 ? ((context.parsed / total) * 100).toFixed(1) : 0;
                  return ' $' + Math.round(context.parsed).toLocaleString('en-US') + ' (' + pct + '%)';
                }
              }
            }
          }
        }
      });
    }

    var legendEl = document.getElementById('allocation-legend');
    if (legendEl) {
      var html = '';
      for (var i = 0; i < labels.length; i++) {
        var pct = total > 0 ? ((data[i] / total) * 100).toFixed(0) : 0;
        html += '<div class="flex items-center justify-between">'
          + '<div class="flex items-center gap-2"><div class="w-2 h-2 rounded-full" style="background:' + colors[i] + '"></div>'
          + '<span class="text-[11px] text-gray-muted">' + labels[i] + '</span></div>'
          + '<span class="text-[11px] text-light-100 font-medium">' + pct + '%</span>'
          + '</div>';
      }
      legendEl.innerHTML = html;
    }
  }

  function escHtml(str) { var div = document.createElement('div'); div.textContent = str; return div.innerHTML; }

  var TYPE_COLORS = { 'Stock': '#3a4a78', 'Crypto': '#9c7a52' };

  function renderTopHoldings() {
    var el = document.getElementById('top-holdings-list');
    if (!el) return;
    var holdings = window.__gallopTopHoldings || [];
    if (holdings.length === 0) {
      el.innerHTML = '<div class="py-2"><p class="text-[12px] text-gray-dim mb-3 lowercase">no holdings with quantities yet — add yours on the portfolio page, or:</p>'
        + '<button id="load-sample-btn" class="text-[11px] lowercase text-light-100 border border-dark-400 hover:bg-dark-700 px-3 py-1.5 rounded transition-colors">load a sample portfolio</button></div>';
      var sb = document.getElementById('load-sample-btn');
      if (sb) sb.addEventListener('click', function () { if (typeof window.__gallopLoadSample === 'function') window.__gallopLoadSample(); });
      return;
    }
    var total = holdings.reduce(function (sum, h) { return sum + h.value; }, 0);
    var top = holdings.slice(0, 6);
    var html = '';
    for (var i = 0; i < top.length; i++) {
      var h = top[i];
      var pct = total > 0 ? (h.value / total) * 100 : 0;
      var color = TYPE_COLORS[h.type] || '#10b981';
      html += '<div class="p-2 rounded-lg hover:bg-dark-700 transition-colors">'
        + '<div class="flex items-center justify-between mb-1.5">'
        + '<div class="flex items-center gap-2">'
        + '<span class="text-[12px] text-light-100 font-medium">' + escHtml(h.name) + '</span>'
        + '<span class="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded" style="color:' + color + ';background:' + color + '1a">' + escHtml(h.type) + '</span>'
        + '</div>'
        + '<span class="text-[12px] text-light-100 font-medium">$' + Math.round(h.value).toLocaleString('en-US') + '</span>'
        + '</div>'
        + '<div class="h-1 rounded-full bg-dark-600 overflow-hidden">'
        + '<div class="h-full rounded-full" style="width:' + pct.toFixed(1) + '%;background:' + color + '"></div>'
        + '</div>'
        + '</div>';
    }
    el.innerHTML = html;
  }

  function setupToggle() {
    var btns = document.querySelectorAll('[data-overview]');
    for (var i = 0; i < btns.length; i++) {
      btns[i].addEventListener('click', function () {
        for (var j = 0; j < btns.length; j++) {
          btns[j].classList.remove('bg-accent/15', 'text-accent-light', 'font-medium');
          btns[j].classList.add('text-gray-dim');
        }
        this.classList.remove('text-gray-dim');
        this.classList.add('bg-accent/15', 'text-accent-light', 'font-medium');
        viewMode = this.getAttribute('data-overview');
        if (overviewChart) { overviewChart.destroy(); overviewChart = null; }
        renderChart();
      });
    }
  }

  function renderAll() {
    renderChart();
    renderAllocationChart();
    renderTopHoldings();
  }

  function init() {
    setupToggle();
    renderAll();
    setTimeout(renderAll, 2000);
    setTimeout(renderAll, 6000);
    setInterval(renderAll, 20000);

    // Called by the theme toggle so charts rebuild with the new theme colors.
    window.__gallopThemeCharts = function () {
      if (overviewChart) { overviewChart.destroy(); overviewChart = null; }
      if (allocChart) { allocChart.destroy(); allocChart = null; }
      renderAll();
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
