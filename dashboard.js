(function () {
  'use strict';

  function loadNum(key, fallback) {
    try {
      var v = localStorage.getItem(key);
      if (v !== null) return parseFloat(v);
    } catch (e) { /* ignore */ }
    return fallback;
  }

  function saveNum(key, val) {
    try { localStorage.setItem(key, String(val)); } catch (e) { /* ignore */ }
  }

  function loadStr(key, fallback) {
    try {
      var v = localStorage.getItem(key);
      if (v !== null && v !== '') return v;
    } catch (e) { /* ignore */ }
    return fallback;
  }

  var cashOnHand = loadNum('mm_cash', 0);
  var userName = loadStr('mm_name', 'Investor');

  function fmtMoney(n) {
    if (n == null || isNaN(n)) return '$0';
    return '$' + Math.round(n).toLocaleString('en-US');
  }

  function getPortfolioTotal(listId) {
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

  // --- Greeting + user name ---
  function initials(name) {
    var parts = name.trim().split(/\s+/);
    var out = '';
    for (var i = 0; i < parts.length && out.length < 2; i++) out += parts[i].charAt(0).toUpperCase();
    return out || 'IN';
  }

  function setGreeting() {
    var el = document.getElementById('greeting-text');
    var dateEl = document.getElementById('current-date');
    var avatarEl = document.getElementById('user-avatar');
    if (!el) return;

    var now = new Date();
    var hour = now.getHours();
    var prefix;
    if (hour >= 5 && hour < 12) prefix = 'Good morning';
    else if (hour >= 12 && hour < 17) prefix = 'Good afternoon';
    else if (hour >= 17 && hour < 22) prefix = 'Good evening';
    else prefix = 'Burning the midnight oil';
    el.textContent = prefix + ', ' + userName;

    if (avatarEl) avatarEl.textContent = initials(userName);

    if (dateEl) {
      var options = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };
      dateEl.textContent = now.toLocaleDateString('en-US', options);
    }
  }

  function setupUserName() {
    var avatarEl = document.getElementById('user-avatar');
    if (!avatarEl) return;
    avatarEl.addEventListener('click', function () {
      var name = window.prompt('Your name:', userName === 'Investor' ? '' : userName);
      if (name === null) return;
      name = name.trim();
      userName = name || 'Investor';
      try { localStorage.setItem('mm_name', userName); } catch (e) { /* ignore */ }
      setGreeting();
    });
  }

  // --- Market status (NYSE hours, DST-aware via America/New_York) ---
  function updateMarketStatus() {
    var dotEl = document.getElementById('market-status-dot');
    var labelEl = document.getElementById('market-status-text');
    if (!dotEl || !labelEl) return;

    var isOpen = false;
    try {
      var fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false
      });
      var parts = fmt.formatToParts(new Date());
      var map = {};
      for (var i = 0; i < parts.length; i++) map[parts[i].type] = parts[i].value;
      var day = map.weekday;
      var totalMin = parseInt(map.hour, 10) * 60 + parseInt(map.minute, 10);
      var isWeekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].indexOf(day) !== -1;
      // NYSE regular session: 9:30 AM – 4:00 PM ET
      isOpen = isWeekday && totalMin >= 570 && totalMin < 960;
    } catch (e) { /* leave closed on error */ }

    if (isOpen) {
      dotEl.className = 'w-2 h-2 rounded-full bg-status-green animate-pulse';
      labelEl.textContent = 'Markets Open';
    } else {
      dotEl.className = 'w-2 h-2 rounded-full bg-status-red';
      labelEl.textContent = 'Markets Closed';
    }
  }

  // --- Update stat cards ---
  function updateStats() {
    cashOnHand = loadNum('mm_cash', 0);

    var cryptoTotal = getPortfolioTotal('crypto-list');
    var stockTotal = getPortfolioTotal('stock-list');
    var ondoTotal = getPortfolioTotal('ondo-list');
    var investedTotal = cryptoTotal + stockTotal + ondoTotal;
    var netWorth = cashOnHand + investedTotal;

    var nwEl = document.getElementById('nw-display');
    if (nwEl) nwEl.textContent = fmtMoney(netWorth);

    var cashEl = document.getElementById('coh-display');
    if (cashEl) cashEl.textContent = fmtMoney(cashOnHand);

    var invEl = document.getElementById('ti-display');
    if (invEl) invEl.textContent = fmtMoney(investedTotal);

    var investedSub = document.getElementById('ti-sub');
    if (investedSub) {
      var parts = [];
      if (cryptoTotal > 0) parts.push(fmtMoney(cryptoTotal) + ' crypto');
      if (stockTotal > 0) parts.push(fmtMoney(stockTotal) + ' stocks');
      if (ondoTotal > 0) parts.push(fmtMoney(ondoTotal) + ' Ondo GM');
      investedSub.textContent = parts.length > 0 ? parts.join(' · ') : 'Stocks · Crypto · RWA';
    }
  }

  // --- Cash edit ---
  function setupCashEdit() {
    var btn = document.getElementById('coh-edit-btn');
    var displayContainer = document.getElementById('coh-display-container');
    var editContainer = document.getElementById('coh-edit-container');
    var input = document.getElementById('coh-input');
    var saveBtn = document.getElementById('coh-save');
    var cancelBtn = document.getElementById('coh-cancel');
    if (!btn || !editContainer) return;

    function openEdit() {
      displayContainer.classList.add('hidden');
      editContainer.classList.remove('hidden');
      input.value = cashOnHand || '';
      input.focus();
    }

    function closeEdit() {
      displayContainer.classList.remove('hidden');
      editContainer.classList.add('hidden');
    }

    btn.addEventListener('click', function (e) { e.stopPropagation(); openEdit(); });

    saveBtn.addEventListener('click', function () {
      cashOnHand = parseFloat(input.value) || 0;
      saveNum('mm_cash', cashOnHand);
      closeEdit();
      updateStats();
    });

    cancelBtn.addEventListener('click', closeEdit);

    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') saveBtn.click();
      if (e.key === 'Escape') cancelBtn.click();
    });
  }

  // --- Page Navigation ---
  var switchPageFn = null;

  function setupPageNav() {
    var navBtns = document.querySelectorAll('.nav-btn[data-target]');
    var sections = document.querySelectorAll('.page-section');
    var validPages = [];
    sections.forEach(function (sec) { validPages.push(sec.id.replace('page-', '')); });

    function switchPage(pageName) {
      if (validPages.indexOf(pageName) === -1) return;
      navBtns.forEach(function (b) {
        var isActive = b.getAttribute('data-target') === pageName;
        b.classList.remove('bg-accent/10', 'text-accent-light');
        b.classList.add('text-gray-dim');
        var indicator = b.querySelector('.active-indicator');
        if (indicator) {
          indicator.classList.remove('opacity-100');
          indicator.classList.add('opacity-0');
        }
        var svg = b.querySelector('svg');
        if (svg) {
          svg.classList.remove('opacity-100');
          svg.classList.add('opacity-70');
        }

        if (isActive) {
          b.classList.remove('text-gray-dim');
          b.classList.add('bg-accent/10', 'text-accent-light');
          if (indicator) {
            indicator.classList.remove('opacity-0');
            indicator.classList.add('opacity-100');
          }
          if (svg) {
            svg.classList.remove('opacity-70');
            svg.classList.add('opacity-100');
          }
        }
      });

      sections.forEach(function (sec) {
        var secName = sec.id.replace('page-', '');
        if (secName === pageName) {
          sec.classList.remove('hidden');
          sec.classList.remove('fade-in');
          void sec.offsetWidth;
          sec.classList.add('fade-in');
        } else {
          sec.classList.add('hidden');
          sec.classList.remove('fade-in');
        }
      });

      try { localStorage.setItem('mm_current_page', pageName); } catch (e) { /* ignore */ }
    }

    switchPageFn = switchPage;

    navBtns.forEach(function (btn) {
      btn.addEventListener('click', function () {
        switchPage(this.getAttribute('data-target'));
      });
    });

    // Restore last page (ignore pages that no longer exist, e.g. removed sections)
    var savedPage = null;
    try { savedPage = localStorage.getItem('mm_current_page'); } catch (e) { /* ignore */ }
    if (savedPage && validPages.indexOf(savedPage) !== -1) switchPage(savedPage);
  }

  // --- Mobile sidebar (off-canvas drawer) ---
  function setupMobileNav() {
    var sidebar = document.getElementById('sidebar');
    var backdrop = document.getElementById('sidebar-backdrop');
    var toggleBtn = document.getElementById('sidebar-toggle');
    if (!sidebar || !backdrop || !toggleBtn) return;

    function openNav() {
      sidebar.classList.add('is-open');
      backdrop.classList.add('is-open');
      document.body.classList.add('sidebar-open');
    }
    function closeNav() {
      sidebar.classList.remove('is-open');
      backdrop.classList.remove('is-open');
      document.body.classList.remove('sidebar-open');
    }

    toggleBtn.addEventListener('click', function () {
      if (sidebar.classList.contains('is-open')) closeNav(); else openNav();
    });
    backdrop.addEventListener('click', closeNav);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeNav();
    });
    // On phones, tapping a nav item should navigate AND close the drawer.
    var navBtns = document.querySelectorAll('.nav-btn[data-target]');
    navBtns.forEach(function (b) { b.addEventListener('click', closeNav); });
  }

  // --- Header search → Research page ---
  function setupHeaderSearch() {
    var input = document.getElementById('header-search-input');
    if (!input) return;
    input.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var q = input.value.trim();
      if (!q) return;
      if (switchPageFn) switchPageFn('research');
      var researchInput = document.getElementById('research-search-input');
      var researchBtn = document.getElementById('research-search-btn');
      if (researchInput && researchBtn) {
        researchInput.value = q.toUpperCase();
        researchBtn.click();
      }
      input.value = '';
    });
  }

  // --- Export / Import data ---
  var DATA_KEYS = ['mm_crypto', 'mm_stocks', 'mm_ondo', 'mm_cash', 'mm_portfolio_snapshots', 'mm_ondo_wallet', 'mm_name', 'mm_current_page'];

  function setupExportImport() {
    var exportBtn = document.getElementById('export-data-btn');
    var importBtn = document.getElementById('import-data-btn');
    var fileInput = document.getElementById('import-file-input');
    if (!exportBtn || !importBtn || !fileInput) return;

    exportBtn.addEventListener('click', function () {
      var payload = { app: 'gallop', version: 1, exportedAt: new Date().toISOString(), data: {} };
      for (var i = 0; i < DATA_KEYS.length; i++) {
        try {
          var v = localStorage.getItem(DATA_KEYS[i]);
          if (v !== null) payload.data[DATA_KEYS[i]] = v;
        } catch (e) { /* ignore */ }
      }
      var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'gallop-backup-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });

    importBtn.addEventListener('click', function () { fileInput.click(); });

    fileInput.addEventListener('change', function () {
      var file = fileInput.files && fileInput.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var payload = JSON.parse(reader.result);
          if (!payload || payload.app !== 'gallop' || !payload.data) {
            window.alert('This file is not a valid GALLOP backup.');
            return;
          }
          if (!window.confirm('Importing will replace your current data with the backup. Continue?')) return;
          for (var key in payload.data) {
            if (DATA_KEYS.indexOf(key) !== -1) {
              try { localStorage.setItem(key, payload.data[key]); } catch (e) { /* ignore */ }
            }
          }
          window.location.reload();
        } catch (e) {
          window.alert('Could not read that file. Make sure it is a GALLOP backup JSON.');
        }
      };
      reader.readAsText(file);
      fileInput.value = '';
    });
  }

  // --- Sync prices to Markets page ---
  function syncMarketPrices() {
    var pairs = [
      { widget: 'widget-price-btc', market: 'mk-btc', widgetChange: 'widget-change-btc' },
      { widget: 'widget-price-nvda', market: 'mk-nvda', widgetChange: 'widget-change-nvda' },
      { widget: 'widget-price-spx', market: 'mk-spx', widgetChange: 'widget-change-spx' },
      { widget: 'widget-price-gold', market: 'mk-gold', widgetChange: 'widget-change-gold' }
    ];

    for (var i = 0; i < pairs.length; i++) {
      var widgetEl = document.getElementById(pairs[i].widget);
      var marketEl = document.getElementById(pairs[i].market);
      var changeEl = document.getElementById(pairs[i].widgetChange);

      if (widgetEl && marketEl) {
        var priceVal = marketEl.querySelector('.price-val');
        if (priceVal && widgetEl.textContent !== '--') {
          priceVal.textContent = widgetEl.textContent;
          priceVal.classList.remove('skeleton-text');
        }
      }
      if (changeEl && marketEl) {
        var changeVal = marketEl.querySelector('.change-val');
        if (changeVal && changeEl.textContent !== '--') {
          changeVal.textContent = changeEl.textContent;
          var isUp = changeEl.textContent.indexOf('-') !== 0;
          changeVal.className = 'text-[16px] mt-2 font-medium change-val ' + (isUp ? 'text-status-green' : 'text-status-red');
        }
      }
    }
  }

  function init() {
    setGreeting();
    setupUserName();
    updateMarketStatus();
    setupCashEdit();
    setupPageNav();
    setupMobileNav();
    setupHeaderSearch();
    setupExportImport();
    updateStats();

    setInterval(updateStats, 10000);
    setInterval(updateMarketStatus, 60000);
    setInterval(syncMarketPrices, 8000);
    setTimeout(syncMarketPrices, 4000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
