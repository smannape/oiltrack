// js/stocks.js  --  Stock Tickers page
// Called by app.js: initStocksPage() on tab activation
// Data source: /api/stocks -> Netlify blob -> Yahoo Finance v7/v8

(function () {
  'use strict';

  var _allStocks    = [];
  var _filterCat    = 'ALL';
  var _sortBy       = 'order';
  var _searchQ      = '';
  var _initialized  = false;

  // ── public entry point ──────────────────────────────────────
  window.initStocksPage = function () {
    if (_initialized) { renderStocks(); return; }
    setStatus('loading');
    fetch('/api/stocks')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.status === 'initializing') {
          setStatus('initializing');
          setTimeout(window.initStocksPage, 6000);
          return;
        }
        _allStocks   = d.stocks || [];
        _initialized = true;
        setStatus('ok', d.fetchedAt);
        updateSummary(d.summary || {});
        renderStocks();
        wireFilters();
      })
      .catch(function (e) {
        console.error('[stocks] fetch error:', e);
        setStatus('error');
      });
  };

  // ── status ──────────────────────────────────────────────────
  function setStatus(s, fetchedAt) {
    var el = document.getElementById('stocks-badge');
    if (!el) return;
    if (s === 'loading')      { el.textContent = 'LOADING...';   el.style.color = '#ffb300'; return; }
    if (s === 'initializing') { el.textContent = 'INITIALIZING'; el.style.color = '#ffb300'; return; }
    if (s === 'error')        { el.textContent = 'DATA ERROR';   el.style.color = '#ff1744'; return; }
    if (s === 'ok') {
      el.textContent = 'LIVE (15min delay)';
      el.style.color = '#00e676';
      var ts = document.getElementById('stocks-updated');
      if (ts && fetchedAt) {
        ts.textContent = 'Updated: ' + new Date(fetchedAt).toUTCString().slice(0, 25);
      }
    }
  }

  // ── summary strip ────────────────────────────────────────────
  function updateSummary(s) {
    var set = function (id, v) { var e = document.getElementById(id); if (e) e.textContent = v; };
    set('stocks-up',    s.up   != null ? s.up   : '--');
    set('stocks-down',  s.down != null ? s.down : '--');
    set('stocks-flat',  s.flat != null ? s.flat : '--');
    set('stocks-mcap',  s.totalMcap ? formatMcap(s.totalMcap) : '--');
    var avg = s.avgChangePct;
    var avgEl = document.getElementById('stocks-avg');
    if (avgEl) {
      avgEl.textContent = avg != null ? (avg >= 0 ? '+' : '') + avg.toFixed(2) + '%' : '--';
      avgEl.style.color = avg != null ? (avg > 0 ? '#00e676' : avg < 0 ? '#e05a5a' : '#8ba3bc') : '';
    }
    set('stocks-count', _allStocks.filter(function(s){ return s.price != null; }).length + ' / ' + _allStocks.length + ' live');
  }

  // ── filter + sort + render ───────────────────────────────────
  function renderStocks() {
    var filtered = _allStocks.filter(function (s) {
      if (_filterCat !== 'ALL' && s.category !== _filterCat) return false;
      if (_searchQ) {
        var q = _searchQ.toLowerCase();
        if (!s.name.toLowerCase().includes(q) && !s.symbol.toLowerCase().includes(q)) return false;
      }
      return true;
    });

    // Sort
    filtered.sort(function (a, b) {
      if (_sortBy === 'price') return (b.price || 0) - (a.price || 0);
      if (_sortBy === 'change') return (b.changePct || -999) - (a.changePct || -999);
      if (_sortBy === 'mcap') return (b.marketCap || 0) - (a.marketCap || 0);
      if (_sortBy === 'name') return a.name.localeCompare(b.name);
      return 0; // preserve original order
    });

    var grid = document.getElementById('stocks-grid');
    if (!grid) return;

    if (!filtered.length) {
      grid.innerHTML = '<div style="grid-column:1/-1;padding:40px;text-align:center;font-family:var(--font-mono);font-size:11px;color:var(--text-dim)">No stocks match the current filter.</div>';
      return;
    }

    grid.innerHTML = filtered.map(renderCard).join('');

    // Update count badge
    var cnt = document.getElementById('stocks-filter-count');
    if (cnt) cnt.textContent = filtered.length + ' stocks';
  }

  // ── sparkline SVG ────────────────────────────────────────────
  function buildSparkline(points, isUp) {
    if (!points || points.length < 2) {
      return '<svg class="stk-spark" viewBox="0 0 80 28"><line x1="0" y1="14" x2="80" y2="14" stroke="#1a2332" stroke-width="1"/></svg>';
    }
    var W = 80, H = 28, pad = 2;
    var mn = Math.min.apply(null, points);
    var mx = Math.max.apply(null, points);
    var range = mx - mn || 1;
    var coords = points.map(function (v, i) {
      var x = pad + (i / (points.length - 1)) * (W - pad * 2);
      var y = H - pad - ((v - mn) / range) * (H - pad * 2);
      return x.toFixed(1) + ',' + y.toFixed(1);
    });
    var col = isUp ? '#00e676' : '#e05a5a';
    var pts = coords.join(' ');
    // fill area under sparkline
    var first = coords[0].split(',');
    var last  = coords[coords.length - 1].split(',');
    var fillPts = pts + ' ' + last[0] + ',' + (H - pad) + ' ' + first[0] + ',' + (H - pad);
    return '<svg class="stk-spark" viewBox="0 0 ' + W + ' ' + H + '">' +
      '<polygon points="' + fillPts + '" fill="' + col + '" opacity="0.08"/>' +
      '<polyline points="' + pts + '" fill="none" stroke="' + col + '" stroke-width="1.5" opacity="0.85"/>' +
      '</svg>';
  }

  // ── individual card ──────────────────────────────────────────
  function renderCard(s) {
    var hasData  = s.price != null;
    var isUp     = (s.changePct || 0) >= 0;
    var chgColor = hasData ? (isUp ? '#00e676' : '#e05a5a') : '#3a6080';
    var catClass = { Major:'stk-cat-major', EP:'stk-cat-ep', OFS:'stk-cat-ofs', Intl:'stk-cat-intl' }[s.category] || 'stk-cat-ofs';
    var catLabel = { Major:'Major', EP:'E&amp;P', OFS:'OFS', Intl:'Intl' }[s.category] || s.category;

    var priceStr   = hasData ? s.price.toFixed(2) : 'N/A';
    var changeStr  = hasData ? (isUp ? '+' : '') + s.change.toFixed(2) : '--';
    var pctStr     = hasData ? (isUp ? '+' : '') + s.changePct.toFixed(2) + '%' : '--';
    var volStr     = s.volume  ? formatVol(s.volume)       : '--';
    var rangeStr   = (s.week52Low && s.week52High) ? s.week52Low.toFixed(2) + ' - ' + s.week52High.toFixed(2) : '--';
    var divStr     = s.divYield != null ? s.divYield.toFixed(1) + '%'  : '--';
    var mcapStr    = s.marketCap ? formatMcap(s.marketCap) : '--';
    var peStr      = s.pe       ? s.pe.toFixed(1) + 'x'   : '--';

    var sparkSvg = buildSparkline(s.sparkline, isUp);

    return '<div class="stk-card" onclick="window._stockClick(\'' + s.symbol + '\')">' +
      '<div class="stk-card-hdr">' +
        '<div>' +
          '<div class="stk-ticker">' + s.symbol + '</div>' +
          '<div class="stk-exchange">' + s.exchange + ' &bull; ' + s.currency + '</div>' +
        '</div>' +
        '<span class="stk-cat ' + catClass + '">' + catLabel + '</span>' +
      '</div>' +
      '<div class="stk-name">' + escapeHtml(s.name) + '</div>' +
      sparkSvg +
      '<div class="stk-price-row">' +
        '<span class="stk-price">' + priceStr + '</span>' +
        '<span class="stk-change" style="color:' + chgColor + '">' + changeStr + '</span>' +
        '<span class="stk-pct" style="color:' + chgColor + '">' + pctStr + '</span>' +
      '</div>' +
      '<div class="stk-meta">' +
        '<span class="stk-meta-item">Vol <b>' + volStr + '</b></span>' +
        '<span class="stk-meta-item">52w <b>' + rangeStr + '</b></span>' +
        '<span class="stk-meta-item">Div <b>' + divStr + '</b></span>' +
      '</div>' +
      '<div class="stk-footer">' +
        '<span class="stk-mcap">MCap&nbsp;<b>' + mcapStr + '</b></span>' +
        '<span class="stk-pe">P/E&nbsp;<b>' + peStr + '</b></span>' +
      '</div>' +
      (s.error ? '<div class="stk-error">Data unavailable</div>' : '') +
    '</div>';
  }

  // ── wire filter/sort/search controls ────────────────────────
  function wireFilters() {
    // Category buttons
    var catBtns = document.querySelectorAll('#stk-cat-btns .stk-fbtn');
    catBtns.forEach(function (btn) {
      if (btn._stkWired) return;
      btn._stkWired = true;
      btn.addEventListener('click', function () {
        catBtns.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        _filterCat = btn.dataset.cat || 'ALL';
        renderStocks();
      });
    });

    // Sort buttons
    var sortBtns = document.querySelectorAll('#stk-sort-btns .stk-fbtn');
    sortBtns.forEach(function (btn) {
      if (btn._stkWired) return;
      btn._stkWired = true;
      btn.addEventListener('click', function () {
        sortBtns.forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        _sortBy = btn.dataset.sort || 'order';
        renderStocks();
      });
    });

    // Search
    var search = document.getElementById('stk-search');
    if (search && !search._stkWired) {
      search._stkWired = true;
      var debounce;
      search.addEventListener('input', function () {
        clearTimeout(debounce);
        debounce = setTimeout(function () {
          _searchQ = search.value.trim();
          renderStocks();
        }, 200);
      });
    }
  }

  // ── helpers ──────────────────────────────────────────────────
  function formatVol(v) {
    if (v >= 1e9) return (v / 1e9).toFixed(1) + 'B';
    if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
    if (v >= 1e3) return (v / 1e3).toFixed(0) + 'K';
    return v.toString();
  }

  function formatMcap(v) {
    if (v >= 1e12) return '$' + (v / 1e12).toFixed(2) + 'T';
    if (v >= 1e9)  return '$' + (v / 1e9).toFixed(1)  + 'B';
    if (v >= 1e6)  return '$' + (v / 1e6).toFixed(0)  + 'M';
    return '$' + v.toLocaleString();
  }

  // Yahoo Finance deep link for each stock
  window._stockClick = function (symbol) {
    window.open('https://finance.yahoo.com/quote/' + encodeURIComponent(symbol), '_blank');
  };

})();
