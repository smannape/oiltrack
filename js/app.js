// ============================================================
// CRUDE RADAR -- js/app.js
// Single clean IIFE. No code outside the closure.
// ============================================================

(function () {
  'use strict';

  // ?? STATE ??????????????????????????????????????????????????
  const state = {
    page:              'dashboard',
    user:              null,
    chatOpen:          false,
    mapMode:           'production',
    map:               null,
    pipelineMap:       null,
    mapLayers:         { tankers: null, production: null, consumption: null },
    contracts:         JSON.parse(JSON.stringify(CrudeRadar.contracts)),
    liveDataActive:    false,   // true once real prices arrive -> stops simulation
    statsInitialized:  false,
    countryInitialized: false,
    eiaChartsInitialized: false,
    eiaExtraInitialized:  false,
    stocksInitialized:    false,
    liveNews:          [],
    telegramNews:      [],
    fxRates:           null,
    chatMessages: [
      { user: 'OilTrader_KW',  text: 'Anyone watching Brent this morning? Big move incoming.',   time: '09:12', me: false },
      { user: 'MarketWatch88', text: 'OPEC+ holding firm. Saudis want $85+ before any unwind.', time: '09:15', me: false },
      { user: 'System',        text: 'Market open.',                                             time: '09:30', me: false },
    ],
  };

  // ── Shared ticker news store ─────────────────────────────────
  // Both RSS and Telegram write here; ticker always rebuilt from union.
  var _tickerRSS      = [];   // articles from /api/oil-news
  var _tickerTelegram = [];   // critical items from Telegram

  function rebuildTicker() {
    // Critical Telegram items lead, then RSS mix
    var all = _tickerTelegram.concat(_tickerRSS);
    if (all.length) {
      updateTickerFromNews(all);
    }
  }

  // ── BOOT ──────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    buildTicker();
    loadEvents();
    startClock();
    renderPriceGrid();
    renderNewsPanel([]);
    // Snapshot the static tanker seed so it survives applyLiveTankers overwrites
    CrudeRadar._staticTankers = JSON.parse(JSON.stringify(CrudeRadar.tankers));
    renderTankersTable(CrudeRadar.tankers);
    updateTankerStats(CrudeRadar.tankers, 0);
    renderProductionTable();
    setupNavigation();
    setupAuth();
    setupChat();
    initLeafletMap();
    startSimulatedPriceUpdates();
    fetchLiveData();
    setTimeout(initTelegramFeed, 3000);
  });

  // ============================================================
  // LIVE DATA -- reads from Netlify Blob endpoints
  // ============================================================
  async function fetchLiveData() {
    console.log('[CrudeRadar] Fetching live data...');

    const [pricesResult, newsResult, eiaResult, tankersResult, fxResult] =
      await Promise.allSettled([
        CrudeAPI.fetchCachedPrices(),    // /api/oil-prices
        CrudeAPI.fetchCachedNews(),      // /api/oil-news
        CrudeAPI.fetchCachedEIA(),       // /api/oil-eia
        CrudeAPI.fetchCachedTankers(),   // /api/oil-tankers
        CrudeAPI.fetchFX(),              // ExchangeRate-API
      ]);

    // ?? Prices ??????????????????????????????????????????????
    const parsedPrices = CrudeAPI.parsePriceCache(
      pricesResult.status === 'fulfilled' ? pricesResult.value : null
    );
    if (parsedPrices) {
      applyLivePrices(parsedPrices);
      setStatusBadge('api-status-prices', 'live', 'PRICES LIVE');
    } else {
      console.warn('[CrudeRadar] No live prices. Check COMMODITY_API_KEY + run /api/oil-refresh');
      setStatusBadge('api-status-prices', 'demo', 'PRICES DEMO');
    }

    // ?? News ????????????????????????????????????????????????
    const parsedNews = CrudeAPI.parseNewsCache(
      newsResult.status === 'fulfilled' ? newsResult.value : null
    );
    if (parsedNews.length > 0) {
      state.liveNews = parsedNews;
      renderNewsPanel(parsedNews);
      updateNewsPage(parsedNews);
      _tickerRSS = parsedNews;   // update shared store
      rebuildTicker();            // rebuild with latest from both sources
      setStatusBadge('api-status-news', 'live', 'NEWS LIVE');
    } else {
      console.warn('[CrudeRadar] No live news. Check RSS feeds + GNEWS_API_KEY');
      renderNewsPanel([]);
      setStatusBadge('api-status-news', 'demo', 'NEWS DEMO');
    }

    // ?? EIA ?????????????????????????????????????????????????
    const parsedEIA = CrudeAPI.parseEIACache(
      eiaResult.status === 'fulfilled' ? eiaResult.value : null
    );
    if (parsedEIA) {
      applyEIACache(parsedEIA);
      setStatusBadge('api-status-eia', 'live', 'EIA LIVE');
    } else {
      setStatusBadge('api-status-eia', 'demo', 'EIA DEMO');
    }

    // ?? Tankers (from AISstream Blob) ???????????????????????
    if (tankersResult.status === 'fulfilled' && Array.isArray(tankersResult.value) && tankersResult.value.length > 0) {
      applyLiveTankers(tankersResult.value);
      // If blob data is older than 30 min, quietly trigger a fresh AIS collection
      var blobAge = tankersResult.value._blobAgeMs || 0;
      if (blobAge > 30 * 60 * 1000) {
        console.log('[CrudeRadar] AIS data stale (>30 min) -- triggering background refresh');
        fetch('/api/ais-refresh', { method: 'POST' }).catch(function(){});
      }
    } else {
      // Empty blob -- trigger AIS refresh and retry after 60s
      setStatusBadge('api-status-tankers', 'demo', 'AIS LOADING...');
      console.log('[CrudeRadar] No tankers -- triggering AIS refresh, retrying in 60s');
      fetch('/api/ais-refresh', { method: 'POST' }).catch(function(){});
      setTimeout(function() {
        CrudeAPI.fetchCachedTankers().then(function(t) {
          if (t && t.length > 0) applyLiveTankers(t);
          else setStatusBadge('api-status-tankers', 'demo', 'AIS DEMO');
        });
      }, 60000);
    }

    // ?? FX ??????????????????????????????????????????????????
    if (fxResult.status === 'fulfilled' && fxResult.value) {
      state.fxRates = fxResult.value;
      updateFXDisplay();
    }

    // Re-fetch full data every 5 minutes
    setTimeout(fetchLiveData, 5 * 60 * 1000);

    // Refresh tankers every 60 seconds so map and table stay current
    setTimeout(function refreshTankers() {
      CrudeAPI.fetchCachedTankers().then(function(t) {
        if (t && t.length > 0) applyLiveTankers(t);
      });
      setTimeout(refreshTankers, 60 * 1000);
    }, 60 * 1000);
  }

  // ?? APPLY LIVE TANKERS ???????????????????????????????????
  function applyLiveTankers(tankers) {
    if (!tankers?.length) return;

    const normalised = tankers.map(t => ({
      mmsi:        String(t.mmsi || ''),
      name:        t.name        || 'UNKNOWN',
      type:        t.vesselClass || t.type || 'Tanker',
      flag:        t.flag        || '?',
      cargo:       t.cargo       || 'Crude Oil',
      lat:         parseFloat(t.lat || 0),
      lng:         parseFloat(t.lng || 0),
      speed:       String(t.speed || '0.0'),
      course:      t.course      || 0,
      status:      t.status      || 'underway',
      destination: t.destination || t.to || '--',
      eta:         t.eta         || '--',
      imo:         t.imo         || '--',
      from:        t.from        || '--',
      to:          t.to          || t.destination || '--',
      updatedAt:   t.updatedAt   || '',
      stale:       t.stale       || false,
    }));

    const liveTankers  = normalised.filter(t => !t.stale);
    const staleTankers = normalised.filter(t => t.stale);

    // MERGE: keep static seed tankers for regions where live data has no coverage.
    // Live data replaces static entries with same MMSI; static fills gaps.
    var liveMMSIs = new Set(normalised.map(function(t){ return t.mmsi; }));
    var staticFill = (CrudeRadar._staticTankers || []).filter(function(t){
      return !liveMMSIs.has(String(t.mmsi));
    }).map(function(t){
      return Object.assign({}, t, { stale: true });
    });
    var merged = normalised.concat(staticFill);

    // Carry over metadata from the raw array
    merged._fetchedAt = tankers._fetchedAt || null;
    merged._blobAgeMs = tankers._blobAgeMs || 0;
    CrudeRadar.tankers = merged;
    renderTankersTable(merged);
    updateTankerStats(merged, liveTankers.length);

    // Render on map -- poll until map is ready (handles cold start + re-renders)
    renderTankersOnMap();

    const badge = liveTankers.length > 0
      ? 'AIS LIVE . ' + liveTankers.length + ' vessels'
      : 'AIS CACHED';
    setStatusBadge('api-status-tankers', liveTankers.length > 0 ? 'live' : 'demo', badge);
    console.log('[CrudeRadar] AIS: ' + liveTankers.length + ' live, ' + staleTankers.length + ' cached');
  }

  // Render tankers on map -- safe to call any time, handles timing automatically
  window.renderTankersOnMap = function() {};  // placeholder until defined
  function renderTankersOnMap() {
    window.renderTankersOnMap = renderTankersOnMap;  // update global ref
    // Sync state.map from global in case it was set externally
    if (!state.map && window._crudeMap) state.map = window._crudeMap;
    // If map not ready yet, retry every 500ms for up to 10s
    if (!state.map) {
      var attempts = 0;
      var timer = setInterval(function() {
        attempts++;
        if (state.map) {
          clearInterval(timer);
          renderTankersOnMap();
        } else if (attempts > 20) {
          clearInterval(timer); // give up after 10s
        }
      }, 500);
      return;
    }
    // Only render if currently in tankers mode
    var mode = state.mapMode || 'tankers';
    if (mode !== 'tankers') return;
    // Don't render if no data
    if (!CrudeRadar.tankers || !CrudeRadar.tankers.length) return;

    renderMapMode('tankers');
    updateMapLegend('tankers');
  }

  // Render production on map -- safe to call any time
  // Production data is static so always available immediately
  function renderProductionOnMap() {
    if (!state.map && window._crudeMap) state.map = window._crudeMap;
    if (!state.map) {
      var attempts = 0;
      var timer = setInterval(function() {
        attempts++;
        if (state.map) { clearInterval(timer); renderProductionOnMap(); }
        else if (attempts > 20) { clearInterval(timer); }
      }, 500);
      return;
    }
    var mode = state.mapMode || 'tankers';
    if (mode !== 'production') return;
    renderMapMode('production');
    updateMapLegend('production');
  }

  // ?? TANKER STATS ?????????????????????????????????????????
  // Computes all stats dynamically from AIS vessel array.
  // Uses position (lat/lng) and destination keyword matching.
  function updateTankerStats(tankers, liveCount) {
    if (!tankers?.length) return;

    // ?? Fleet composition ?????????????????????????????????
    const total    = tankers.length;
    const underway = tankers.filter(t => t.status === 'underway').length;
    const anchored = tankers.filter(t => t.status === 'anchored' || t.status === 'moored').length;

    const classCount = (cls) => tankers.filter(t =>
      (t.type || '').toUpperCase().includes(cls.toUpperCase())
    ).length;

    setText('ais-total-count',    total);
    setText('ais-underway-count', underway);
    setText('ais-anchored-count', anchored);
    setText('ais-vlcc-count',     classCount('VLCC'));
    setText('ais-suezmax-count',  classCount('Suezmax'));
    setText('ais-aframax-count',  classCount('Aframax'));

    // Fetch timestamp
    if (liveCount > 0) {
      setText('ais-fetched-at', `Live . ${liveCount} AIS positions`);
    } else {
      setText('ais-fetched-at', 'Cached positions');
    }

    // ?? Zone detection (by lat/lng bounding boxes) ????????
    function inBox(t, latMin, latMax, lngMin, lngMax) {
      return t.lat >= latMin && t.lat <= latMax && t.lng >= lngMin && t.lng <= lngMax;
    }

    const zonePG       = tankers.filter(t => inBox(t, 21, 30,  50, 60)).length;
    const zoneRedSea   = tankers.filter(t => inBox(t, 10, 25,  40, 55)).length;
    const zoneMalacca  = tankers.filter(t => inBox(t,  1,  6, 100,105)).length;
    const zoneNorthSea = tankers.filter(t => inBox(t, 51, 62,  -5, 10)).length;

    setText('zone-pg',       zonePG);
    setText('zone-redsea',   zoneRedSea);
    setText('zone-malacca',  zoneMalacca);
    setText('zone-northsea', zoneNorthSea);

    // ?? Route detection (by position + destination) ???????
    // Middle East origin: vessel in Persian Gulf or Red Sea bounding box
    // OR destination keywords suggest Middle East origin
    const ME_ORIGIN_LAT_MIN = 10, ME_ORIGIN_LAT_MAX = 30;
    const ME_ORIGIN_LNG_MIN = 40, ME_ORIGIN_LNG_MAX = 60;

    const ASIA_DEST  = ['china','korea','japan','singapore','taiwan','india','thailand','vietnam','indonesia','ningbo','tianjin','qingdao','ulsan','busan','jurong','chennai','mundra'];
    const EU_DEST    = ['rotterdam','amsterdam','antwerp','hamburg','rotterdam','marseille','trieste','genoa','barcelona','italy','spain','france','germany','netherlands','uk','london','liverpool','gothenburg'];
    const AM_ORIGIN_LNG_MIN = -100, AM_ORIGIN_LNG_MAX = -60;
    const AM_ORIGIN_LAT_MIN = 15,   AM_ORIGIN_LAT_MAX = 50;

    function destMatch(t, keywords) {
      const d = (t.destination || t.to || '').toLowerCase();
      return keywords.some(k => d.includes(k));
    }

    function inME(t) {
      return inBox(t, ME_ORIGIN_LAT_MIN, ME_ORIGIN_LAT_MAX, ME_ORIGIN_LNG_MIN, ME_ORIGIN_LNG_MAX);
    }
    function inAmericas(t) {
      return inBox(t, AM_ORIGIN_LAT_MIN, AM_ORIGIN_LAT_MAX, AM_ORIGIN_LNG_MIN, AM_ORIGIN_LNG_MAX);
    }

    // ME -> Asia: vessel from ME region heading to Asian port
    const meToAsia = tankers.filter(t =>
      t.status === 'underway' && (inME(t) || destMatch(t, ASIA_DEST)) &&
      destMatch(t, ASIA_DEST)
    ).length;

    // ME -> Europe: vessel from ME region heading to European port
    const meToEurope = tankers.filter(t =>
      t.status === 'underway' && (inME(t) || destMatch(t, EU_DEST)) &&
      destMatch(t, EU_DEST)
    ).length;

    // Americas -> Europe: vessel from Atlantic heading east to Europe
    const amToEurope = tankers.filter(t =>
      t.status === 'underway' && inAmericas(t) && destMatch(t, EU_DEST)
    ).length;

    // Average speed of underway vessels
    const underwayVessels = tankers.filter(t => t.status === 'underway' && parseFloat(t.speed) > 0.5);
    const avgSpeed = underwayVessels.length > 0
      ? (underwayVessels.reduce((sum, t) => sum + parseFloat(t.speed), 0) / underwayVessels.length).toFixed(1)
      : '--';

    setText('route-me-asia',    meToAsia   || '--');
    setText('route-me-europe',  meToEurope || '--');
    setText('route-am-europe',  amToEurope || '--');
    setText('ais-avg-speed',    avgSpeed + (avgSpeed !== '--' ? ' kn' : ''));

    // Detail lines
    const vlccUnderway = tankers.filter(t => t.status === 'underway' && (t.type||'').includes('VLCC')).length;
    setText('route-me-asia-detail',   `${tankers.filter(t => destMatch(t, ASIA_DEST)).length} with Asian destination`);
    setText('route-me-europe-detail', `${tankers.filter(t => destMatch(t, EU_DEST)).length} with European destination`);
    setText('route-am-europe-detail', `${inAmericas.length || amToEurope} Atlantic crossings`);
    setText('ais-avg-speed-detail',   `${underwayVessels.length} vessels underway`);
  }

  function setText(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = String(val);
  }

  // ?? APPLY LIVE PRICES ????????????????????????????????????
  // parsedPrices shape: { wti, brent, dubai, natgas, rbob, heatoil }
  // each: { price, change, changePct, history:[{period,value}] }
  function applyLivePrices(parsedPrices) {
    if (!parsedPrices) return;

    // Map contract IDs (state.contracts[].id) -> parsedPrices keys
    const idToKey = {
      // Live from Commodity Price API
      wti:      'wti',
      brent:    'brent',
      dubai:    'dubai',
      crude_ng: 'natgas',
      hho:      'heatoil',
      rbob:     'rbob',
      // Derived server-side from benchmarks
      opec:     'opec',
      urals:    'urals',
      wcs:      'wcs',
      lco:      'lco',
      bonny:    'bonny',
      espo:     'espo',
    };

    let updated = 0;
    for (const [contractId, priceKey] of Object.entries(idToKey)) {
      const data = parsedPrices[priceKey];
      if (!data?.price) continue;
      const c = state.contracts.find(x => x.id === contractId);
      if (!c) continue;
      c.prev           = c.price;
      c.price          = parseFloat(data.price.toFixed(2));
      c._liveChange    = data.change    ?? null;
      c._liveChangePct = data.changePct ?? null;
      updated++;
    }

    if (updated > 0) {
      state.liveDataActive     = true;
      state._lastParsedPrices  = parsedPrices;  // save for chart headers
      renderPriceGrid();
      updateChartHeaders(parsedPrices);          // update chart page headers live
      console.log(`[CrudeRadar] Applied live prices to ${updated} tiles`);
    }

    // Commodity API returns current prices only (no history).
    // Charts always use EIA monthly data (loaded in applyEIACache).
    // We only use Commodity API for current price tiles, not chart history.
    // Chart rendering happens in applyEIACache after EIA data loads.
  }

  // ?? APPLY EIA CACHE ?????????????????????????????????????
  function applyEIACache(eiaData) {
    // Inventory widget
    const invEl = document.getElementById('inventory-widget');
    if (invEl && eiaData.stocksLatest) {
      const chg = eiaData.stocksChange || 0;
      invEl.innerHTML = `
        <div style="font-family:var(--font-display);font-size:22px;color:var(--text-bright)">
          ${(eiaData.stocksLatest / 1000).toFixed(1)}M
        </div>
        <div style="font-family:var(--font-mono);font-size:10px;color:${chg < 0 ? 'var(--accent-green)' : 'var(--accent-red)'};margin-top:3px">
          ${chg < 0 ? '\u25BC' : '\u25B2'} ${Math.abs(chg / 1000).toFixed(2)}M bbl week-over-week
        </div>
        <div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);margin-top:2px">
          EIA . ${eiaData.stocksPeriod || ''}
        </div>`;
    }

    // Sidebar production metrics
    if (eiaData.opecProductionLatest?.value) {
      const el = document.getElementById('sidebar-opec-prod');
      if (el) el.textContent = (eiaData.opecProductionLatest.value / 1000).toFixed(1) + ' Mb/d';
    }
    if (eiaData.usProductionLatest?.value) {
      const el = document.getElementById('sidebar-us-prod');
      if (el) el.textContent = (eiaData.usProductionLatest.value / 1000).toFixed(1) + ' Mb/d';
    }

    // If Commodity API is not active, use EIA monthly WTI/Brent for price tiles
    if (!state.liveDataActive) {
      if (eiaData.wtiLatest?.value) {
        const c = state.contracts.find(x => x.id === 'wti');
        if (c) { c.prev = c.price; c.price = eiaData.wtiLatest.value; }
      }
      if (eiaData.brentLatest?.value) {
        const c = state.contracts.find(x => x.id === 'brent');
        if (c) { c.prev = c.price; c.price = eiaData.brentLatest.value; }
      }
      renderPriceGrid();
    }

    // ?? CHART HISTORY (always from EIA monthly -- clean 30-point history) ??
    // EIA monthly gives one clean data point per month, perfect for charts.
    // Format YYYY-MM periods as "Jan 2025" labels.
    function eiaToChartData(series, count = 30) {
      if (!series?.length) return null;
      const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return [...series]
        .slice(0, count)
        .reverse()
        .map(d => {
          const parts = (d.period || '').split('-');
          const label = parts.length === 2
            ? months[parseInt(parts[1]) - 1] + ' ' + parts[0]
            : d.period;
          return { label, value: d.value };
        });
    }

    const wtiChart   = eiaToChartData(eiaData.wtiMonthly,   30);
    const brentChart = eiaToChartData(eiaData.brentMonthly, 30);

    if (wtiChart?.length) {
      CrudeRadar.priceHistory.wti = wtiChart.map(d => d.value);
      CrudeRadar.chartLabels      = wtiChart.map(d => d.label);
      console.log('[charts] EIA WTI history loaded: ' + wtiChart.length + ' months (' + wtiChart[0]?.label + ' -> ' + wtiChart[wtiChart.length-1]?.label + ')');
    }
    if (brentChart?.length) {
      CrudeRadar.priceHistory.brent = brentChart.map(d => d.value);
    }

    // Always re-render charts when EIA data loads -- this is the authoritative history source
    state.chartsInitialized = false;
    try {
      ['chart-wti','chart-brent','chart-dubai','chart-natgas','chart-rbob','chart-heatoil'].forEach(id => {
        const canvas = document.getElementById(id);
        if (canvas) { const c = Chart.getChart(canvas); if (c) c.destroy(); }
      });
    } catch (_) {}
    // Only render immediately if charts page is visible
    if (state.page === 'charts') initChartsPage();
  }

  // ?? STATUS BADGE ?????????????????????????????????????????
  function setStatusBadge(id, type, label) {
    const el = document.getElementById(id);
    if (!el) return;
    const color = type === 'live' ? 'var(--accent-green)' : 'var(--accent-amber)';
    el.innerHTML = `<span style="color:${color};font-family:var(--font-mono);font-size:9px;letter-spacing:1px">? ${label}</span>`;
  }

  // ?? FX DISPLAY ???????????????????????????????????????????
  function updateFXDisplay() {
    const el = document.getElementById('fx-rates');
    if (!el || !state.fxRates) return;
    const r = state.fxRates;
    const pairs = [
      { label: 'EUR/USD', rate: (1 / r.EUR).toFixed(4) },
      { label: 'GBP/USD', rate: (1 / r.GBP).toFixed(4) },
      { label: 'JPY/USD', rate: (r.JPY).toFixed(2) },
      { label: 'CNY/USD', rate: (r.CNY).toFixed(4) },
    ];
    el.innerHTML = pairs.map(p =>
      `<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid rgba(30,45,69,0.4);font-family:var(--font-mono);font-size:11px">
         <span style="color:var(--text-dim)">${p.label}</span>
         <span style="color:var(--text-primary)">${p.rate}</span>
       </div>`
    ).join('');
  }

  // ============================================================
  // UPCOMING EVENTS  --  /api/events
  // ============================================================
  function renderEvents(events) {
    const el = document.getElementById('events-list');
    if (!el) return;
    if (!events || !events.length) {
      el.innerHTML = '<div style="padding:6px 0;color:var(--text-dim);font-size:10px">No upcoming events</div>';
      return;
    }
    const sourceColor = {
      EIA: 'var(--accent-orange)', IEA: '#e8b84b',
      OPEC: '#e05a5a', 'CME/NYMEX': '#4a9ab0', ICE: '#2a7ab0',
    };
    function daysUntil(dateStr) {
      const d = new Date(dateStr + 'T00:00:00');
      const now = new Date(); now.setHours(0,0,0,0);
      const diff = Math.round((d - now) / 86400000);
      if (diff === 0) return '<span style="color:#e05a5a;font-weight:700">TODAY</span>';
      if (diff === 1) return '<span style="color:#ffb300">TOMORROW</span>';
      if (diff <= 7)  return '<span style="color:#ffb300">in ' + diff + 'd</span>';
      return '<span style="color:var(--text-dim)">in ' + diff + 'd</span>';
    }
    const shown = events.slice(0, 6);
    el.innerHTML = shown.map(function(e, i) {
      const col  = sourceColor[e.source] || 'var(--accent-orange)';
      const border = i < shown.length - 1 ? 'border-bottom:1px solid rgba(30,45,69,0.35);' : '';
      const click  = e.url ? ' onclick="window.open(\'' + e.url + '\',\'_blank\')" style="cursor:pointer"' : '';
      return '<div style="padding:7px 0;' + border + '"' + click + '>' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:2px">' +
          '<span style="color:' + col + ';font-size:9px;letter-spacing:.5px">' +
            e.displayDate + ' &bull; ' + e.source + '</span>' + daysUntil(e.date) +
        '</div>' +
        '<div style="color:var(--text-primary);font-size:11px;line-height:1.4">' + escapeHtml(e.label) + '</div>' +
        (e.note ? '<div style="color:var(--text-dim);font-size:9px;margin-top:2px">' + escapeHtml(e.note) + '</div>' : '') +
      '</div>';
    }).join('');
    const badge = document.getElementById('events-badge');
    if (badge) { badge.textContent = events.length + ' events'; badge.style.color = 'var(--accent-green)'; }
  }

  function loadEvents() {
    fetch('/api/events')
      .then(function(r){ return r.json(); })
      .then(function(d){
        if (d.events && d.events.length) { renderEvents(d.events); }
        else if (d.status === 'initializing') { setTimeout(loadEvents, 8000); }
      })
      .catch(function(e){ console.warn('[events] fetch error:', e.message); });
  }

  // ============================================================
  // TICKER
  // ============================================================
  function buildTicker(items) {
    // items: array of {text, critical} -- if omitted, use demo messages
    const msgs = items && items.length ? items : (CrudeRadar.tickerMessages || []);
    if (!msgs.length) return;
    // Repeat content enough times that the track is always wider than the container
    // regardless of how many items there are. Minimum 3 full copies for smooth loop.
    const copies = Math.max(3, Math.ceil(6 / msgs.length));
    let repeated = [];
    for (let i = 0; i < copies; i++) repeated = repeated.concat(msgs);

    const track = document.getElementById('ticker-track');
    if (!track) return;

    // Pause, update content, then restart -- avoids mid-animation flash
    track.classList.remove('is-scrolling');
    track.innerHTML = repeated.map(m =>
      '<span class="ticker-item' + (m.critical ? ' critical' : '') + '">' +
      '<span class="dot">&bull;</span> ' + (m.text || '') + '</span>'
    ).join('');

    // Compute duration: ~14px per char per second feels natural
    const totalChars = msgs.reduce((s, m) => s + (m.text || '').length, 0);
    const dur = Math.max(30, Math.min(180, totalChars * 0.22));
    track.style.setProperty('--ticker-dur', dur + 's');

    // Force reflow then start animation (prevents restart flash)
    void track.offsetWidth;
    track.classList.add('is-scrolling');
  }

  function updateTickerFromNews(articles) {
    const cutoff = Date.now() - 21 * 24 * 60 * 60 * 1000;
    const recent = (articles || []).filter(a => {
      if (!a.pubDate) return true;
      const d = new Date(a.pubDate);
      return isNaN(d) || d.getTime() >= cutoff;
    });

    // Build ordered item list: breaking first, then regular headlines
    const critical = recent.filter(a => a.critical).slice(0, 8);
    const regular  = recent.filter(a => !a.critical).slice(0, 15);

    const items = [
      ...critical.map(a => ({
        text: (a.headline || a.text || '').slice(0, 100),
        critical: true,
      })),
      ...regular.map(a => ({
        text: (a.source ? a.source.split(' ')[0] + ': ' : '') + (a.headline || a.text || '').slice(0, 90),
        critical: false,
      })),
    ].filter(i => i.text.length > 5);

    if (items.length) buildTicker(items);
  }

  // ============================================================
  // CLOCK
  // ============================================================
  function startClock() {
    const el = document.getElementById('live-clock');
    if (!el) return;
    const update = () => { el.textContent = new Date().toUTCString().slice(17, 25) + ' UTC'; };
    update();
    setInterval(update, 1000);
  }

  // ============================================================
  // PRICE GRID
  // ============================================================
  function renderPriceGrid() {
    const grid = document.getElementById('price-grid');
    if (!grid) return;
    grid.innerHTML = state.contracts.map(c => {
      // Use live change from API when available
      const hasLiveChange = c._liveChange !== undefined && c._liveChange !== null;
      const hasLivePct    = c._liveChangePct !== undefined && c._liveChangePct !== null;
      const chg = hasLiveChange
        ? c._liveChange
        : (c.prev > 0 ? (c.price - c.prev) : 0);  // avoid 100% when prev=0
      const pct = hasLivePct
        ? Math.abs(c._liveChangePct).toFixed(2)
        : (c.prev > 0 ? Math.abs((chg / c.prev) * 100).toFixed(2) : '0.00');
      const dir   = chg > 0 ? 'up' : chg < 0 ? 'down' : 'neutral';
      const arrow = chg > 0 ? '\u25B2' : chg < 0 ? '\u25BC' : '--';
      const priceStr = c.price > 0 ? '$' + c.price.toFixed(2) : '--';
      // If no change data and no previous price, show just the price without change
      const hasChangeData = hasLiveChange || c.prev > 0;
      const chgStr = c.price <= 0 ? 'Loading...'
        : !hasChangeData ? '--'
        : `${arrow} ${Math.abs(chg).toFixed(2)} (${pct}%)`;
      return `<div class="price-card ${dir}" id="pc-${c.id}">
        <div class="label">${c.flag} ${c.label}</div>
        <div class="name">${c.name}</div>
        <div class="price">${priceStr}</div>
        <div class="change">${chgStr}</div>
        <div class="exchange">${c.exchange} . ${c.unit}</div>
      </div>`;
    }).join('');
  }

  // ?? SIMULATED UPDATES (demo only -- stops when live data loads)
  function startSimulatedPriceUpdates() {
    setInterval(() => {
      if (state.liveDataActive) return; // do NOT overwrite real prices
      state.contracts.forEach(c => {
        if (c.price <= 0) return; // don't animate zeros
        const oldPrice = c.price;
        c.price = parseFloat(Math.max(c.price + (Math.random() - 0.5) * 0.28, 0.1).toFixed(2));
        const card = document.getElementById('pc-' + c.id);
        if (!card) return;
        const chg = c.price - c.prev;
        const pct = ((chg / (c.prev || 1)) * 100).toFixed(2);
        const dir   = chg > 0 ? 'up' : chg < 0 ? 'down' : 'neutral';
        const arrow = chg > 0 ? '\u25B2' : chg < 0 ? '\u25BC' : '--';
        card.className = 'price-card ' + dir;
        card.querySelector('.price').textContent = '$' + c.price.toFixed(2);
        card.querySelector('.change').textContent = `${arrow} ${Math.abs(chg).toFixed(2)} (${pct}%)`;
        if (c.price !== oldPrice) {
          card.classList.add(c.price > oldPrice ? 'flash-up' : 'flash-down');
          setTimeout(() => card.classList.remove('flash-up', 'flash-down'), 700);
        }
      });
    }, 3000);
  }

  // ============================================================
  // NEWS
  // ============================================================
  function renderNewsPanel(newsItems) {
    const el = document.getElementById('news-feed');
    if (!el) return;
    // Filter to 21 days
    const _cutoff = Date.now() - 21 * 24 * 60 * 60 * 1000;
    newsItems = (newsItems || []).filter(n => {
      if (!n.pubDate) return true;
      const d = new Date(n.pubDate);
      return isNaN(d) || d.getTime() >= _cutoff;
    });
    if (!newsItems || newsItems.length === 0) {
      el.innerHTML = `<div style="padding:14px 12px;font-family:var(--font-mono);font-size:11px;color:var(--text-dim);text-align:center">
        <div style="margin-bottom:4px">? Loading live news...</div>
        <div style="font-size:9px;color:var(--text-dim)">Fetched hourly from OPEC . IEA . OilPrice . Rigzone . Energy Voice</div>
      </div>`;
      return;
    }
    el.innerHTML = newsItems.slice(0, 10).map(n =>
      `<div class="news-item" ${n.url ? `onclick="window.open('${n.url}','_blank')"` : ''}>
        <div class="news-source">${n.source} <span class="news-tag${n.critical ? ' critical' : ''}">${n.tag}</span></div>
        <div class="news-headline">${escapeHtml(n.headline)}</div>
        <div class="news-time">${n.time}</div>
      </div>`
    ).join('');
  }

  // ?? Region classifier ??????????????????????????????????????
  function classifyRegion(article) {
    const text = ((article.headline || '') + ' ' + (article.source || '') + ' ' + (article.description || '')).toLowerCase();

    const MENA = [
      'saudi','riyadh','aramco','opec','iran','iraq','basrah','kirkuk','uae','dubai',
      'kuwait','oman','qatar','libya','algeria','egypt','hormuz','mideast','middle east',
      'gulf','bahrain','yemen','jordan','mees','arab','persian','israel','cairo',
      'tehran','baghdad','abu dhabi','muscat','doha'
    ];
    const EU = [
      'equinor','norway','north sea','norsk','brent','uk ','united kingdom','britain',
      'scotland','shell','bp ','total','druzhba','russia','gazprom','europe','european',
      'germany','france','italy','spain','poland','netherlands','denmark','finland',
      'sweden','vienna','opec+','iea','london','paris','berlin','amsterdam','rotterdam',
      'baltic','ukraine','nato','brussels','eu '
    ];
    const NA = [
      'permian','shale','bakken','eagle ford','haynesville','marcellus','wti',
      'cushing','nymex','eia ','texas','oklahoma','north dakota','colorado','canada',
      'alberta','keystone','pipeline us','gulf of mexico','gulf coast','mexico ',
      'pemex','chevron','exxon','conoco','pioneer','halliburton','schlumberger',
      'coterra','devon','us crude','u.s.','american','washington','houston','calgary'
    ];
    const AP = [
      'china','beijing','india','mumbai','japan','tokyo','korea','singapore',
      'indonesia','malaysia','vietnam','thailand','australia','india','lng asia',
      'cnooc','sinopec','petrochina','bhp','woodside','jera','kogas','ongc',
      'reliance','dubai crude','asia','pacific','taiwan','myanmar','bangladesh'
    ];

    if (MENA.some(k => text.includes(k))) return 'MENA';
    if (AP.some(k => text.includes(k)))   return 'AP';
    if (EU.some(k => text.includes(k)))   return 'EU';
    if (NA.some(k => text.includes(k)))   return 'NA';

    // fallback by tag
    if (article.tag === 'MIDEAST') return 'MENA';
    if (article.tag === 'AFRICA')  return 'MENA';
    return 'NA'; // default to NA (most articles are US-centric)
  }

  function tagClass(tag) {
    const t = (tag || '').toUpperCase();
    if (t === 'MARKET') return 'nws-tag-market';
    if (t === 'SUPPLY') return 'nws-tag-supply';
    if (t === 'PRICE')  return 'nws-tag-price';
    if (t === 'GAS' || t === 'LNG') return 'nws-tag-gas';
    if (t === 'MIDEAST' || t === 'OPEC') return 'nws-tag-mideast';
    if (t === 'REPORT') return 'nws-tag-report';
    return 'nws-tag-news';
  }

  function renderNewsCard(n) {
    const url = escapeHtml(n.url || '');
    const onClick = url ? `onclick="window.open('${url}','_blank')"` : '';
    const breakingPill = n.critical ? '<span class="nws-breaking-pill">BREAKING</span>' : '';
    return `<div class="nws-card" ${onClick}>
      <div class="nws-card-meta">
        <span class="nws-card-src">${escapeHtml(n.source || '')}</span>
        <span class="nws-tag ${tagClass(n.tag)}">${n.tag || 'NEWS'}</span>
        ${breakingPill}
        <span class="nws-card-time">${n.time || ''}</span>
      </div>
      <div class="nws-card-hl">${escapeHtml(n.headline || '')}</div>
      ${url ? '<div class="nws-card-link">Read article &#8599;</div>' : ''}
    </div>`;
  }

  let _nwsDonutChart = null;

  function updateNewsPage(articles) {
    // 21-day filter
    const _c21 = Date.now() - 21 * 24 * 60 * 60 * 1000;
    articles = (articles || []).filter(n => {
      if (!n.pubDate) return true;
      const d = new Date(n.pubDate);
      return isNaN(d) || d.getTime() >= _c21;
    });

    // Apply active region + topic filters
    const regionFilter = document.querySelector('#nws-region-btns .nws-fbtn.active')?.dataset.region || 'ALL';
    const topicFilter  = document.querySelector('#nws-topic-btns  .nws-fbtn.active')?.dataset.topic  || 'ALL';
    const searchQ      = (document.getElementById('nws-search')?.value || '').toLowerCase().trim();
    const sortMode     = document.querySelector('#nws-sort-btns .nws-fbtn.active')?.dataset.sort || 'newest';

    // Classify region for each article
    const classified = articles.map(n => ({ ...n, region: classifyRegion(n) }));

    // Filter
    let filtered = classified.filter(n => {
      if (regionFilter !== 'ALL' && n.region !== regionFilter) return false;
      if (topicFilter  !== 'ALL' && n.tag !== topicFilter)     return false;
      if (searchQ && !n.headline?.toLowerCase().includes(searchQ) &&
                     !n.source?.toLowerCase().includes(searchQ)) return false;
      return true;
    });

    // Sort
    if (sortMode === 'newest') {
      filtered.sort((a, b) => {
        const da = a.pubDate ? new Date(a.pubDate).getTime() : 0;
        const db = b.pubDate ? new Date(b.pubDate).getTime() : 0;
        return db - da;
      });
    }

    // Counts per region (from ALL articles, not filtered, for the chart)
    const allClassified = classified;
    const counts = { MENA: 0, NA: 0, EU: 0, AP: 0 };
    allClassified.forEach(n => { if (counts[n.region] !== undefined) counts[n.region]++; });
    const total = allClassified.length;

    // Update donut chart
    const donutCanvas = document.getElementById('news-donut-chart');
    if (donutCanvas) {
      const chartData = [counts.MENA, counts.NA, counts.EU, counts.AP];
      if (_nwsDonutChart) {
        _nwsDonutChart.data.datasets[0].data = chartData;
        _nwsDonutChart.update('none');
      } else {
        _nwsDonutChart = new Chart(donutCanvas, {
          type: 'doughnut',
          data: {
            labels: ['Middle East & N.Africa', 'North America', 'Europe', 'Asia Pacific'],
            datasets: [{
              data: chartData,
              backgroundColor: ['#c07020', '#2a7ab0', '#3a8010', '#502880'],
              borderColor: '#0d1117',
              borderWidth: 3,
              hoverOffset: 4,
            }],
          },
          options: {
            responsive: true, maintainAspectRatio: false, cutout: '68%',
            plugins: {
              legend: { display: false },
              tooltip: {
                backgroundColor: '#0e1117', borderColor: '#1e2d45', borderWidth: 1,
                titleColor: '#e8b84b', bodyColor: '#e0e8f0',
                titleFont: { family: "'Share Tech Mono', monospace", size: 11 },
                bodyFont:  { family: "'Share Tech Mono', monospace", size: 11 },
                callbacks: { label: ctx => '  ' + ctx.label + ': ' + ctx.parsed + ' (' + (total ? Math.round(ctx.parsed/total*100) : 0) + '%)' },
              },
            },
          },
        });
      }
    }

    // Update KPIs
    const pct = v => total ? Math.round(v / total * 100) + '%' : '0%';
    const setEl = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    setEl('nws-total-num',   total);
    setEl('nws-kpi-total',   total);
    setEl('nws-kpi-breaking', allClassified.filter(n => n.critical).length);
    setEl('nws-pct-mena', pct(counts.MENA));
    setEl('nws-pct-na',   pct(counts.NA));
    setEl('nws-pct-eu',   pct(counts.EU));
    setEl('nws-pct-ap',   pct(counts.AP));
    setEl('news-count-label', filtered.length + ' articles shown');

    // Colour legend percentages
    const legColors = { 'nws-pct-mena': '#e8b84b', 'nws-pct-na': '#4a9ab0', 'nws-pct-eu': '#5a9040', 'nws-pct-ap': '#8060b0' };
    Object.entries(legColors).forEach(([id, col]) => {
      const e = document.getElementById(id); if (e) e.style.color = col;
    });

    // Render 4 region columns
    const REGIONS = [
      { key: 'MENA', listId: 'nws-items-mena', countId: 'nws-count-mena' },
      { key: 'EU',   listId: 'nws-items-eu',   countId: 'nws-count-eu'   },
      { key: 'NA',   listId: 'nws-items-na',   countId: 'nws-count-na'   },
      { key: 'AP',   listId: 'nws-items-ap',   countId: 'nws-count-ap'   },
    ];

    REGIONS.forEach(({ key, listId, countId }) => {
      const regionArticles = (regionFilter === 'ALL' || regionFilter === key)
        ? filtered.filter(n => n.region === key)
        : [];
      const el = document.getElementById(listId);
      const cEl = document.getElementById(countId);
      if (cEl) cEl.textContent = counts[key] + ' articles';
      if (!el) return;
      if (!regionArticles.length) {
        const msg = regionFilter !== 'ALL' && regionFilter !== key
          ? '<div class="nws-empty">Filtered out</div>'
          : '<div class="nws-empty">No articles yet</div>';
        el.innerHTML = msg;
        return;
      }
      el.innerHTML = regionArticles.map(renderNewsCard).join('');
    });
  }

  // ============================================================
  // TANKERS TABLE
  // ============================================================
  function renderTankersTable(tankers) {
    const tbody = document.getElementById('tankers-tbody');
    if (!tbody) return;

    // Update row count badge if element exists
    const countEl = document.getElementById('tankers-count');
    if (countEl) countEl.textContent = (tankers || []).length + ' vessels';
    // Show last updated time
    const updEl = document.getElementById('tankers-updated');
    if (updEl && tankers && tankers._fetchedAt) {
      var ago = Math.round((Date.now() - new Date(tankers._fetchedAt).getTime()) / 60000);
      updEl.textContent = ago < 2 ? 'Updated just now' : 'Updated ' + ago + ' min ago';
    }

    tbody.innerHTML = (tankers || []).map(t => {
      const lat    = parseFloat(t.lat || 0);
      const lng    = parseFloat(t.lng || 0);
      const speed  = parseFloat(t.speed || 0);
      const status = t.status || 'underway';
      // Stale = position from previous fetch cycle
      const staleMarker = t.stale
        ? '<span style="color:var(--text-dim);font-size:9px;margin-left:4px">CACHED</span>'
        : '<span style="color:var(--accent-green);font-size:9px;margin-left:4px">?</span>';
      // Course arrow based on heading
      const courseArrow = t.course
        ? `<span style="display:inline-block;transform:rotate(${t.course}deg);font-size:12px">?</span>`
        : '';

      return `<tr style="${t.stale ? 'opacity:0.6' : ''}">
        <td>
          <span class="tanker-status-dot ${status}"></span>
          <span style="font-weight:500">${escapeHtml(t.name)}</span>
          ${staleMarker}
          ${t.imo && t.imo !== '--' ? `<div style="font-size:9px;color:var(--text-dim);margin-top:1px">IMO ${t.imo}</div>` : ''}
        </td>
        <td>${t.flag} ${t.type}</td>
        <td style="color:var(--text-dim)">${escapeHtml(t.from)}</td>
        <td style="color:var(--text-bright)">${escapeHtml(t.destination || t.to)}</td>
        <td style="font-family:var(--font-mono);font-size:11px">
          ${lat.toFixed(3)} deg, ${lng.toFixed(3)} deg
        </td>
        <td style="font-family:var(--font-mono)">
          ${courseArrow} ${speed.toFixed(1)} kn
        </td>
        <td><span class="tag">${status.toUpperCase()}</span></td>
        <td style="font-family:var(--font-mono);font-size:11px">${escapeHtml(t.eta)}</td>
      </tr>`;
    }).join('');
  }

  // ============================================================
  // PRODUCTION TABLE
  // ============================================================
  function renderProductionTable() {
    const tbody = document.getElementById('prod-tbody');
    if (!tbody) return;
    const maxP = Math.max(...CrudeRadar.production.map(p => p.production));
    tbody.innerHTML = CrudeRadar.production.map(p => {
      const net  = (p.production - p.consumption).toFixed(1);
      const barW = Math.round((p.production / maxP) * 100);
      return `<tr>
        <td>${p.country}</td>
        <td><div class="bar-cell"><div class="bar-fill" style="width:${barW}px"></div>${p.production.toFixed(1)}</div></td>
        <td>${p.consumption.toFixed(1)}</td>
        <td class="${net >= 0 ? 'up' : 'down'}">${net >= 0 ? '+' : ''}${net}</td>
        <td>${p.share.toFixed(1)}%</td>
        <td style="color:var(--text-dim);font-size:11px">${p.company}</td>
      </tr>`;
    }).join('');
  }

  // ============================================================
  // LEAFLET MAP
  // ============================================================
  const COUNTRY_LATLNG = {
    US:[38.9,-97.5], RU:[62,95],    SA:[24,45],    CA:[57,-97],   IQ:[33,44],
    CN:[35.5,103],   AE:[23.4,53.8],IR:[32.4,53.7],BR:[-10,-55], KW:[29.3,47.5],
    MX:[24,-102],    NG:[9.1,8.7],  KZ:[48,68],    NO:[65,16],    LY:[27,17],
  };

  function initLeafletMap() {
    const container = document.getElementById('leaflet-map');
    if (!container || typeof L === 'undefined') return;
    state.map = L.map('leaflet-map', { center:[20,10], zoom:2, minZoom:1, maxZoom:8 });
    window._crudeMap = state.map;  // expose for external access
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '? <a href="https://openstreetmap.org/copyright" style="color:#ff6b00">OpenStreetMap</a> contributors, ? <a href="https://carto.com/attributions" style="color:#ff6b00">CARTO</a>',
      subdomains: 'abcd', maxZoom: 19,
    }).addTo(state.map);
    setTimeout(() => {
      const attr = document.querySelector('.leaflet-control-attribution');
      if (attr) Object.assign(attr.style, { background:'rgba(10,12,15,0.85)',color:'#4a6078',fontSize:'9px',border:'1px solid #1e2d45' });
    }, 500);
    // Set default mode
    state.mapMode = 'tankers';
    // Render static tankers immediately -- no API wait needed
    // This shows global coverage from data.js from the first frame
    setTimeout(function() {
      if (state.map) state.map.invalidateSize();
      // Render static tankers right away (data.js has 36 global vessels)
      if (CrudeRadar.tankers && CrudeRadar.tankers.length > 0) {
        renderTankersLayer();
        updateMapLegend('tankers');
      }
    }, 100);
    // Mark tankers button active by default
    document.querySelectorAll('.map-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === 'tankers');
    });
    document.querySelectorAll('.map-btn').forEach(btn => {
      btn.addEventListener('click', function() {
        document.querySelectorAll('.map-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.mapMode = btn.dataset.mode;
        renderMapMode(state.mapMode);
        updateMapLegend(state.mapMode);
      });
    });
  }

  function renderMapMode(mode) {
    if (!state.map) return;
    state.map.invalidateSize();
    Object.values(state.mapLayers).forEach(l => { if (l) try { state.map.removeLayer(l); } catch(e){} });
    state.mapLayers = { tankers: null, production: null, consumption: null };
    if (mode === 'production')       renderProductionLayer();
    else if (mode === 'consumption') renderConsumptionLayer();
    else if (mode === 'tankers')     renderTankersLayer();
    updateMapLegend(mode);
  }

  function makePopup(borderColor, title, lines) {
    return `<div style="background:#111520;border:1px solid ${borderColor};padding:10px 14px;min-width:180px;font-family:'Share Tech Mono',monospace">
      <div style="color:${borderColor};font-size:11px;letter-spacing:2px;margin-bottom:6px">${title}</div>
      ${lines.map(l => `<div style="color:#8899aa;font-size:10px;margin-top:3px">${l}</div>`).join('')}
    </div>`;
  }

  function renderProductionLayer() {
    var group = L.layerGroup();
    CrudeRadar.production.forEach(function(p) {
      var ll = COUNTRY_LATLNG[p.code];
      if (!ll) return;

      // Color-coded barrel: orange=major, amber=mid, blue=small
      var col  = p.production >= 10 ? '#ff6b00' : p.production >= 5 ? '#ffb300' : '#4ab0e0';
      var size = p.production >= 10 ? 22 : p.production >= 5 ? 18 : 14;

      // Two-ring marker: outer white ring for visibility + inner colored fill
      var marker = L.circleMarker(ll, {
        radius:      size,
        fillColor:   col,
        color:       '#ffffff',
        weight:      2.5,
        opacity:     1,
        fillOpacity: 0.85,
      });

      // Label: small text div centered on the circle
      var label = L.divIcon({
        html: '<div style="width:' + size*2 + 'px;height:' + size*2 + 'px;display:flex;align-items:center;justify-content:center;font-size:' + Math.round(size*0.7) + 'px;text-shadow:0 0 3px #000,0 0 3px #000;pointer-events:none">&#x1F6E2;</div>',
        iconSize:   [size*2, size*2],
        iconAnchor: [size, size],
        className:  '',
      });
      var labelMarker = L.marker(ll, { icon: label, interactive: false, zIndexOffset: -100 });

      // Hover tooltip with full details
      var net    = (p.production - p.consumption).toFixed(1);
      var netCol = parseFloat(net) >= 0 ? '#00e676' : '#e05a5a';
      var netLbl = (parseFloat(net) >= 0 ? '+' : '') + net + ' Mb/d ' +
                   (parseFloat(net) >= 0 ? '(exporter)' : '(importer)');

      var tip =
        '<div style="background:#111520;border:1px solid ' + col + ';padding:10px 14px;min-width:190px;font-family:monospace;pointer-events:none">' +
          '<div style="color:' + col + ';font-size:11px;letter-spacing:2px;margin-bottom:6px">&#x1F6E2; ' + p.country.toUpperCase() + '</div>' +
          '<div style="color:#8899aa;font-size:10px;margin-top:3px">Production: <b style="color:#fff">' + p.production + ' Mb/d</b></div>' +
          '<div style="color:#8899aa;font-size:10px;margin-top:3px">Consumption: <b style="color:#fff">' + p.consumption + ' Mb/d</b></div>' +
          '<div style="color:#8899aa;font-size:10px;margin-top:3px">Net: <b style="color:' + netCol + '">' + netLbl + '</b></div>' +
          '<div style="color:#8899aa;font-size:10px;margin-top:3px">Share: <b style="color:#fff">' + p.share + '%</b></div>' +
          '<div style="color:#8899aa;font-size:10px;margin-top:3px">Operator: <b style="color:' + col + '">' + p.company + '</b></div>' +
        '</div>';

      marker.bindTooltip(tip, {
        permanent:  false,
        direction:  'top',
        offset:     L.point(0, -size - 4),
        opacity:    1,
        className:  'crude-barrel-tooltip',
      });

      group.addLayer(marker);
      group.addLayer(labelMarker);
    });
    group.addTo(state.map);
    state.mapLayers.production = group;
  }

  function renderConsumptionLayer() {
    const group = L.layerGroup();
    const data = [
      { name:'United States', ll:[38.9,-97.5], value:20.4 },
      { name:'China',         ll:[35.5,103],   value:15.8 },
      { name:'India',         ll:[20.6,79.1],  value:5.3  },
      { name:'Japan',         ll:[37.7,138],   value:3.6  },
      { name:'Russia',        ll:[60,90],      value:3.6  },
      { name:'Saudi Arabia',  ll:[24,45],      value:3.7  },
      { name:'South Korea',   ll:[36,128],     value:2.8  },
      { name:'Brazil',        ll:[-12,-51],    value:3.1  },
      { name:'Germany',       ll:[51.2,10],    value:2.3  },
      { name:'Canada',        ll:[57,-97],     value:2.4  },
    ];
    data.forEach(p => {
      const r = Math.max(12, Math.min(48, p.value * 2.7));
      const color = p.value >= 15 ? '#ff1744' : p.value >= 5 ? '#ff6b00' : '#ffb300';
      const circle = L.circleMarker(p.ll, { radius:r, fillColor:color, color, weight:1.5, opacity:0.85, fillOpacity:0.3 });
      circle.bindPopup(makePopup('#ff1744', p.name.toUpperCase(), [
        `Consumption: <span style="color:#fff">${p.value} Mb/d</span>`,
      ]), { className:'crude-popup', closeButton:false });
      group.addLayer(circle);
    });
    group.addTo(state.map);
    state.mapLayers.consumption = group;
  }

  // Hardcoded ME/Asia/global tanker positions -- always rendered as base layer
  // These supplement live AIS data and are never overwritten
  var SEED_TANKERS = [
    {name:'BAHRI YANBU',    flag:'SA',type:'VLCC',    lat:26.60,lng:56.30,status:'anchored', speed:'0.0', from:'Ras Tanura',  to:'Rotterdam'},
    {name:'BAHRI JUBAIL',   flag:'SA',type:'VLCC',    lat:27.10,lng:56.80,status:'anchored', speed:'0.0', from:'Jubail',      to:'Rotterdam'},
    {name:'SIRIUS STAR',    flag:'SA',type:'ULCC',    lat:26.20,lng:57.10,status:'anchored', speed:'0.0', from:'Ras Tanura',  to:'Waiting'},
    {name:'ADNOC UMRIQAH',  flag:'AE',type:'VLCC',    lat:25.30,lng:55.10,status:'moored',   speed:'0.0', from:'Fujairah',    to:'Ruwais'},
    {name:'AL DHAFRA',      flag:'AE',type:'Aframax', lat:24.50,lng:54.40,status:'moored',   speed:'0.0', from:'Jebel Ali',   to:'Singapore'},
    {name:'AL BIDAA',       flag:'KW',type:'Suezmax', lat:29.10,lng:48.10,status:'anchored', speed:'0.0', from:'Mina Ahmadi', to:'Rotterdam'},
    {name:'AL SHUWAIMIYAH', flag:'BH',type:'VLCC',    lat:26.00,lng:50.60,status:'moored',   speed:'0.0', from:'Sitra',       to:'Rotterdam'},
    {name:'YUAN HAI',       flag:'CN',type:'VLCC',    lat:25.80,lng:57.50,status:'underway', speed:'13.5',from:'Ras Tanura',  to:'Qingdao'},
    {name:'SAUDI VISION',   flag:'SA',type:'VLCC',    lat:22.10,lng:62.30,status:'underway', speed:'14.5',from:'Ras Tanura',  to:'Rotterdam'},
    {name:'MAHARASHTRA',    flag:'IN',type:'Suezmax', lat:22.50,lng:59.80,status:'underway', speed:'9.2', from:'Hormuz',      to:'Mumbai'},
    {name:'JNPT STAR',      flag:'IN',type:'Aframax', lat:18.70,lng:66.40,status:'underway', speed:'12.1',from:'Muscat',      to:'Mumbai'},
    {name:'AL SALAM',       flag:'OM',type:'Suezmax', lat:20.30,lng:61.50,status:'underway', speed:'11.8',from:'Oman',        to:'Rotterdam'},
    {name:'GLORY TRADER',   flag:'LR',type:'Suezmax', lat:15.20,lng:42.80,status:'underway', speed:'13.8',from:'Jeddah',      to:'Rotterdam'},
    {name:'CAPE PIONEER',   flag:'LR',type:'VLCC',    lat:12.60,lng:43.50,status:'underway', speed:'11.2',from:'Ras Tanura',  to:'Cape Route'},
    {name:'HELLESPONT AJAX',flag:'GR',type:'ULCC',    lat:13.50,lng:48.20,status:'underway', speed:'12.9',from:'Kharg Island',to:'Ulsan'},
    {name:'MARSHAL ISLAND', flag:'MH',type:'VLCC',    lat:5.80, lng:74.20,status:'underway', speed:'15.2',from:'Muscat',      to:'Singapore'},
    {name:'PACIFIC ARROW',  flag:'HK',type:'Aframax', lat:8.20, lng:75.40,status:'underway', speed:'12.5',from:'Sikka',       to:'Singapore'},
    {name:'PACIFIC VOYAGER',flag:'MH',type:'Suezmax', lat:2.50, lng:83.10,status:'underway', speed:'14.1',from:'Oman',        to:'Ningbo'},
    {name:'MARINA BAY',     flag:'SG',type:'Suezmax', lat:2.10, lng:96.50,status:'underway', speed:'13.7',from:'Oman',        to:'Singapore'},
    {name:'SINGAPORE SPIRIT',flag:'SG',type:'Aframax',lat:3.50, lng:103.8,status:'underway', speed:'12.8',from:'Singapore',   to:'Busan'},
    {name:'INDO MASTER',    flag:'ID',type:'Aframax', lat:1.20, lng:104.5,status:'underway', speed:'11.5',from:'Singapore',   to:'Jakarta'},
    {name:'HK FORTUNE',     flag:'HK',type:'VLCC',    lat:10.50,lng:112.3,status:'underway', speed:'14.1',from:'Singapore',   to:'Ningbo'},
    {name:'HK VIRTUE',      flag:'HK',type:'VLCC',    lat:15.80,lng:115.6,status:'underway', speed:'13.9',from:'Oman',        to:'Qingdao'},
    {name:'HK EXCELLENCE',  flag:'HK',type:'Suezmax', lat:8.30, lng:109.2,status:'underway', speed:'12.3',from:'Singapore',   to:'Zhoushan'},
    {name:'NISSHO MARU',    flag:'JP',type:'VLCC',    lat:31.20,lng:124.5,status:'underway', speed:'15.8',from:'Singapore',   to:'Tokyo'},
    {name:'KOREA STAR',     flag:'KR',type:'VLCC',    lat:33.50,lng:126.8,status:'underway', speed:'14.2',from:'Kuwait',      to:'Ulsan'},
    {name:'ATLANTIC GLORY', flag:'LR',type:'VLCC',    lat:35.60,lng:-40.2,status:'underway', speed:'14.1',from:'Houston',     to:'Rotterdam'},
    {name:'CAPE HARMONY',   flag:'LR',type:'VLCC',    lat:-32.5,lng:18.40,status:'underway', speed:'13.2',from:'Ras Tanura',  to:'Rotterdam'},
    {name:'CAPE FREEDOM',   flag:'LR',type:'VLCC',    lat:-28.3,lng:33.50,status:'underway', speed:'14.0',from:'Kuwait',      to:'Rotterdam'},
  ];

  function renderTankersLayer() {
    var group = L.layerGroup();
    var colorMap = { underway:'#00e676', anchored:'#ffb300', moored:'#00b0ff' };

    // First render SEED_TANKERS that aren't already in live data
    var liveMmsis = new Set((CrudeRadar.tankers||[]).map(function(t){ return t.mmsi; }));
    SEED_TANKERS.forEach(function(t) {
      var col = colorMap[t.status] || '#8899aa';
      var m = L.circleMarker([t.lat, t.lng], {
        radius: t.status==='underway' ? 5 : 4,
        fillColor: col, color:'#000', weight:1, opacity:0.85, fillOpacity:0.75,
        dashArray: '3,3',  // dashed outline = seed/estimated position
      });
      m.bindTooltip(
        '<div style="background:#111520;border:1px solid '+col+';padding:8px 12px;min-width:160px;font-family:monospace">' +
        '<div style="color:'+col+';font-size:11px;margin-bottom:4px">'+t.name+' <span style="color:#556;font-size:9px">[EST]</span></div>' +
        '<div style="color:#8899aa;font-size:10px">'+t.flag+' '+t.type+'</div>' +
        '<div style="color:#8899aa;font-size:10px">'+t.from+' -> '+t.to+'</div>' +
        '<div style="color:#8899aa;font-size:10px">'+t.status.toUpperCase()+' '+t.speed+' kn</div>' +
        '</div>',
        {direction:'top', opacity:1}
      );
      group.addLayer(m);
    });

    // Then render live AIS tankers on top
    CrudeRadar.tankers.forEach(function(t) {
      var col = colorMap[t.status] || '#8899aa';
      // Use circleMarker -- proven reliable at all zoom levels
      var marker = L.circleMarker([t.lat, t.lng], {
        radius:      t.status === 'underway' ? 5 : 4,
        fillColor:   col,
        color:       '#000',
        weight:      1,
        opacity:     0.9,
        fillOpacity: 0.85,
      });
      var tip =
        '<div style="background:#111520;border:1px solid ' + col + ';padding:10px 14px;min-width:180px;font-family:monospace">' +
          '<div style="color:' + col + ';font-size:11px;letter-spacing:2px;margin-bottom:6px">' + (t.name || 'UNKNOWN') + '</div>' +
          '<div style="color:#8899aa;font-size:10px;margin-top:3px">Type: <b style="color:#e0e8f0">' + t.flag + ' ' + t.type + '</b></div>' +
          '<div style="color:#8899aa;font-size:10px;margin-top:3px">Route: <b style="color:#e0e8f0">' + (t.from||'--') + ' -> ' + (t.to||'--') + '</b></div>' +
          '<div style="color:#8899aa;font-size:10px;margin-top:3px">Speed: <b style="color:#e0e8f0">' + t.speed + ' kn</b></div>' +
          '<div style="color:#8899aa;font-size:10px;margin-top:3px">Status: <b style="color:' + col + '">' + (t.status||'').toUpperCase() + '</b></div>' +
          '<div style="color:#8899aa;font-size:10px;margin-top:3px">ETA: <b style="color:#e0e8f0">' + (t.eta||'--') + '</b></div>' +
          '<div style="color:#8899aa;font-size:10px;margin-top:3px">MMSI: ' + t.mmsi + '</div>' +
        '</div>';
      marker.bindTooltip(tip, { direction:'top', opacity:1, className:'crude-barrel-tooltip' });
      group.addLayer(marker);
    });
    const lanes = [
      [[26,50],[30,32],[33,27],[38,15],[36,5],[38,-9],[51.5,-0.1]],
      [[26,50],[12,44],[-11,37],[-34,18],[51.5,-0.1]],
      [[26,50],[5,73],[1.3,104],[22,114]],
      [[29,-95],[35,-40],[38,-9],[51.5,-0.1]],
    ];
    lanes.forEach(coords => L.polyline(coords, { color:'#00b0ff', weight:1, opacity:0.2, dashArray:'6,8' }).addTo(group));
    group.addTo(state.map);
    state.mapLayers.tankers = group;
  }

  function updateMapLegend(mode) {
    const items = document.getElementById('map-legend-items');
    const title = document.getElementById('map-legend-title');
    if (!items) return;
    if (mode === 'production') {
      if (title) title.textContent = 'PRODUCTION (Mb/d)';
      items.innerHTML =
        '<div class="map-legend-item"><span style="display:inline-block;width:14px;height:14px;border-radius:50%;background:#ff6b00;border:2px solid #fff;vertical-align:middle;margin-right:5px"></span>&gt;10 Mb/d</div>' +
        '<div class="map-legend-item"><span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#ffb300;border:2px solid #fff;vertical-align:middle;margin-right:5px"></span>5-10 Mb/d</div>' +
        '<div class="map-legend-item"><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#4ab0e0;border:2px solid #fff;vertical-align:middle;margin-right:5px"></span>1-5 Mb/d</div>' +
        '<div class="map-legend-item" style="font-size:8px;color:#3a5060;margin-top:4px">Hover for details</div>';
    } else if (mode === 'tankers') {
      if (title) title.textContent = 'TANKER STATUS';
      items.innerHTML = `
        <div class="map-legend-item"><div class="map-legend-dot" style="background:#00e676;box-shadow:0 0 5px #00e676"></div>Underway</div>
        <div class="map-legend-item"><div class="map-legend-dot" style="background:#ffb300"></div>Anchored</div>
        <div class="map-legend-item"><div class="map-legend-dot" style="background:#00b0ff"></div>Moored</div>`;
    } else {
      if (title) title.textContent = 'CONSUMPTION (Mb/d)';
      items.innerHTML = `
        <div class="map-legend-item"><div class="map-legend-dot" style="background:#ff1744"></div>>15 Mb/d</div>
        <div class="map-legend-item"><div class="map-legend-dot" style="background:#ff6b00"></div>5-15 Mb/d</div>
        <div class="map-legend-item"><div class="map-legend-dot" style="background:#ffb300"></div>1-5 Mb/d</div>`;
    }
  }

  // ============================================================
  // NAVIGATION
  // ============================================================
  // PIPELINE MAP (lazy-init, runs once on first tab visit)
  // ============================================================
  function initPipelinePage() {
    if (state.pipelineMap) {
      setTimeout(() => state.pipelineMap.invalidateSize(), 100);
      return;
    }

    // ── Capacity slider ──────────────────────────────────────────
    const capSlider = document.getElementById('pl-capacity-slider');
    const capVal    = document.getElementById('pl-cap-val');
    function updateSliderGradient() {
      const pct = (capSlider.value / capSlider.max) * 100;
      capSlider.style.background = 'linear-gradient(90deg, #ff6b00 ' + pct + '%, #131926 ' + pct + '%)';
      capVal.textContent = capSlider.value + ' kbd';
    }
    capSlider.addEventListener('input', updateSliderGradient);
    updateSliderGradient();

    // ── Country data ─────────────────────────────────────────────
    var PL_COUNTRIES = [
      { flag:'\uD83C\uDDFA\uD83C\uDDF8', name:'United States', val:18635 },
      { flag:'\uD83C\uDDE8\uD83C\uDDF3', name:'China',         val:17800 },
      { flag:'\uD83C\uDDF7\uD83C\uDDFA', name:'Russia',        val: 6200 },
      { flag:'\uD83C\uDDEE\uD83C\uDDF3', name:'India',         val: 5461 },
      { flag:'\uD83C\uDDEF\uD83C\uDDF5', name:'Japan',         val: 3332 },
      { flag:'\uD83C\uDDF0\uD83C\uDDF7', name:'South Korea',   val: 3215 },
      { flag:'\uD83C\uDDF8\uD83C\uDDE6', name:'Saudi Arabia',  val: 3100 },
      { flag:'\uD83C\uDDE9\uD83C\uDDEA', name:'Germany',       val: 2120 },
      { flag:'\uD83C\uDDE7\uD83C\uDDF7', name:'Brazil',        val: 1970 },
      { flag:'\uD83C\uDDE8\uD83C\uDDE6', name:'Canada',        val: 1900 },
      { flag:'\uD83C\uDDEE\uD83C\uDDF9', name:'Italy',         val: 1920 },
      { flag:'\uD83C\uDDEE\uD83C\uDDF7', name:'Iran',          val: 1850 },
      { flag:'\uD83C\uDDF3\uD83C\uDDF1', name:'Netherlands',   val: 1610 },
      { flag:'\uD83C\uDDF0\uD83C\uDDFC', name:'Kuwait',        val:  936 },
      { flag:'\uD83C\uDDE6\uD83C\uDDEA', name:'UAE',           val:  922 },
    ];
    var PL_COUNTRY_BOUNDS = {
      'United States': [[24,-125],[49,-66]],
      'China':         [[18,73],[53,135]],
      'Russia':        [[41,27],[77,170]],
      'India':         [[8,68],[37,97]],
      'Japan':         [[30,130],[45,145]],
      'South Korea':   [[34,126],[38,130]],
      'Saudi Arabia':  [[16,36],[32,56]],
      'Germany':       [[47,5],[55,15]],
      'Italy':         [[37,6],[47,18]],
      'Brazil':        [[-33,-74],[5,-34]],
      'Iran':          [[25,44],[40,63]],
      'Netherlands':   [[50,3],[53,7]],
      'Canada':        [[42,-141],[83,-52]],
      'Kuwait':        [[28,46],[30,48]],
      'UAE':           [[22,51],[26,56]],
    };
    var PL_MAX_VAL = 18635;
    var listEl = document.getElementById('pl-country-list');
    PL_COUNTRIES.forEach(function(c, i) {
      var pct = (c.val / PL_MAX_VAL * 100).toFixed(1);
      var valStr = c.val.toLocaleString();
      var row = document.createElement('div');
      row.className = 'pl-country-row';
      row.innerHTML = '<span class="pl-country-rank">'+(i+1)+'</span>'
        +'<span class="pl-country-flag">'+c.flag+'</span>'
        +'<div class="pl-country-row-inner">'
          +'<div style="display:flex;align-items:center;gap:6px">'
            +'<span class="pl-country-name">'+c.name+'</span>'
            +'<span class="pl-country-val">'+valStr+'</span>'
          +'</div>'
          +'<div class="pl-bar-wrap"><div class="pl-bar-fill" style="width:'+pct+'%"></div></div>'
        +'</div>';
      row.addEventListener('click', (function(name) {
        return function() {
          var bounds = PL_COUNTRY_BOUNDS[name];
          if (bounds) state.pipelineMap.fitBounds(bounds, { padding: [20, 20] });
        };
      })(c.name));
      listEl.appendChild(row);
    });

    // ── Leaflet map init ──────────────────────────────────────────
    state.pipelineMap = L.map('pipeline-map', {
      center: [25, 40], zoom: 3, zoomControl: false,
      attributionControl: true, minZoom: 2, maxZoom: 14,
    });
    L.control.zoom({ position: 'topright' }).addTo(state.pipelineMap);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
      subdomains: 'abcd', maxZoom: 19,
    }).addTo(state.pipelineMap);

    // ── Layer groups ─────────────────────────────────────────────
    var plLayers = {
      crude:    L.layerGroup().addTo(state.pipelineMap),
      gas:      L.layerGroup().addTo(state.pipelineMap),
      product:  L.layerGroup().addTo(state.pipelineMap),
      refinery: L.layerGroup().addTo(state.pipelineMap),
      lng:      L.layerGroup().addTo(state.pipelineMap),
      offshore: L.layerGroup().addTo(state.pipelineMap),
    };

    // ── Details panel ─────────────────────────────────────────────
    function showDetails(html) {
      document.getElementById('pl-details-content').innerHTML = html;
    }
    function buildDetailHTML(rows, source) {
      var html = '<div class="pl-details-grid">';
      rows.forEach(function(r) {
        if (r[2] === 'status') {
          html += '<div class="pl-detail-row"><span class="pl-detail-key">'+r[0]+'</span><span class="pl-status-badge"><span class="pl-status-dot"></span>'+r[1]+'</span></div>';
        } else {
          html += '<div class="pl-detail-row"><span class="pl-detail-key">'+r[0]+'</span><span class="pl-detail-val'+(r[2]?' '+r[2]:'')+'">'+ r[1]+'</span></div>';
        }
      });
      html += '</div>';
      if (source) html += '<div class="pl-source-line">SOURCE: '+source+'</div>';
      return html;
    }

    // ── Popup HTML helpers ────────────────────────────────────────
    function pipelinePopupHTML(name, type, color) {
      return '<div class="pl-popup-inner"><div class="pl-popup-name" style="color:'+color+'">'+name+'</div>'
        +'<div class="pl-popup-row"><span class="pl-popup-key">TYPE</span><span class="pl-popup-val">'+type+'</span></div>'
        +'<div class="pl-popup-row"><span class="pl-popup-key">SOURCE</span><span class="pl-popup-val">OGIM v2.5.1</span></div></div>';
    }
    function refineryPopupHTML(r) {
      var sc = r[6]==='ACTIVE'?'#00e676':'#ffb300';
      return '<div class="pl-popup-inner"><div class="pl-popup-name">'+r[2]+'</div>'
        +'<div class="pl-popup-row"><span class="pl-popup-key">COUNTRY</span><span class="pl-popup-val">'+r[3]+'</span></div>'
        +'<div class="pl-popup-row"><span class="pl-popup-key">OPERATOR</span><span class="pl-popup-val">'+r[4]+'</span></div>'
        +'<div class="pl-popup-row"><span class="pl-popup-key">CAPACITY</span><span class="pl-popup-val yellow">'+r[5]+' kbd</span></div>'
        +'<div class="pl-popup-row"><span class="pl-popup-key">STATUS</span><span class="pl-popup-val" style="color:'+sc+'">&bull; '+r[6]+'</span></div>'
        +'<div class="pl-popup-row"><span class="pl-popup-key">COORDS</span><span class="pl-popup-val">'+r[0].toFixed(2)+'&deg;N, '+r[1].toFixed(2)+'&deg;E</span></div></div>';
    }
    function lngPopupHTML(t) {
      return '<div class="pl-popup-inner"><div class="pl-popup-name" style="color:#00b0ff">'+t[2]+'</div>'
        +'<div class="pl-popup-row"><span class="pl-popup-key">COUNTRY</span><span class="pl-popup-val">'+t[3]+'</span></div>'
        +'<div class="pl-popup-row"><span class="pl-popup-key">CAPACITY</span><span class="pl-popup-val blue">'+t[4]+' MTPA</span></div>'
        +'<div class="pl-popup-row"><span class="pl-popup-key">TYPE</span><span class="pl-popup-val">LNG Export Terminal</span></div></div>';
    }
    function platformPopupHTML(p) {
      return '<div class="pl-popup-inner"><div class="pl-popup-name" style="color:#00e676">'+p[2]+'</div>'
        +'<div class="pl-popup-row"><span class="pl-popup-key">COUNTRY</span><span class="pl-popup-val">'+p[3]+'</span></div>'
        +'<div class="pl-popup-row"><span class="pl-popup-key">OPERATOR</span><span class="pl-popup-val">'+p[4]+'</span></div>'
        +'<div class="pl-popup-row"><span class="pl-popup-key">TYPE</span><span class="pl-popup-val">'+p[5]+'</span></div></div>';
    }

    // ── Pipeline helper ───────────────────────────────────────────
    function addPipeline(coords, name, type, opts, group) {
      var pl = L.polyline(coords, Object.assign({}, opts, { interactive: true }));
      var nw = opts.weight;
      var hw = Math.round(nw * 1.6 + 0.5);
      pl.on('mouseover', function() {
        this.setStyle({ weight: hw, opacity: 1 });
        if (this._path) this._path.style.filter = 'drop-shadow(0 0 4px '+opts.color+')';
      });
      pl.on('mouseout', function() {
        this.setStyle({ weight: nw, opacity: opts.opacity });
        if (this._path) this._path.style.filter = '';
      });
      pl.on('click', function(e) {
        L.popup({ maxWidth: 300 }).setLatLng(e.latlng)
          .setContent(pipelinePopupHTML(name, type, opts.color))
          .openOn(state.pipelineMap);
        showDetails(buildDetailHTML([['PIPELINE',name],['TYPE',type],['STATUS','ACTIVE','status'],['SOURCE','OGIM v2.5.1']]));
      });
      pl.addTo(group);
      return pl;
    }

    // ── CRUDE OIL PIPELINES ───────────────────────────────────────
    var CRUDE_OPTS = { color:'#ff6b00', weight:2.5, opacity:0.85 };
    [
      { name:'Druzhba Pipeline',            coords:[[[55.5,37.5],[53,28],[52,21],[51,14]],[[52,21],[47.5,19]]] },
      { name:'BTC Pipeline',                coords:[[[40.4,49.9],[41.7,44.8],[39.9,41.3],[36.8,35.5]]] },
      { name:'Trans-Alaska Pipeline',       coords:[[[70.3,-148.7],[64.8,-147.7],[61.1,-146.4]]] },
      { name:'ESPO Pipeline',               coords:[[[56,98],[54,124],[42.8,132.9]],[[54,124],[46.6,125]]] },
      { name:'Keystone Pipeline',           coords:[[[52.7,-111.3],[50.4,-104.6],[40,-97],[35.9,-96.8]]] },
      { name:'Iraq-Turkey (Kirkuk-Ceyhan)', coords:[[[35.5,44.4],[36.3,43.1],[36.8,35.5]]] },
      { name:'CPC Pipeline',                coords:[[[47.5,53.6],[47.1,51.9],[44.7,37.8]]] },
      { name:'Trans-Arabian (Tapline)',      coords:[[[25.9,49.7],[24.5,44.5],[24.1,38.1]]] },
      { name:'Colombia Ca\u00f1o Lim\u00f3n', coords:[[[6.9,-71.8],[10.5,-75.5]]] },
      { name:'Niger Delta Trunk',            coords:[[[5.5,6],[5.1,7.2],[4.4,7.2]]] },
      { name:'SUMED Pipeline',               coords:[[[30,32.5],[31,30]]] },
    ].forEach(function(p) { p.coords.forEach(function(seg) { addPipeline(seg, p.name, 'Crude Oil Pipeline', CRUDE_OPTS, plLayers.crude); }); });

    // ── GAS PIPELINES ─────────────────────────────────────────────
    var GAS_OPTS = { color:'#00b0ff', weight:2, opacity:0.8, dashArray:'6,3' };
    [
      { name:'Nord Stream',          coords:[[[60.7,28.7],[57,16],[54.6,11.7]]] },
      { name:'TurkStream',           coords:[[[41.5,28.5],[41.2,29]]] },
      { name:'TANAP/TAP',            coords:[[[40.5,46.5],[41.5,43],[41,36],[41.1,26.5],[40.5,18]]] },
      { name:'Iran-Turkey Gas',      coords:[[[38,44.5],[38.5,43.5],[39.9,32.9]]] },
      { name:'TAPI Pipeline',        coords:[[[37.9,58.4],[36,62],[30,66],[23,72]]] },
      { name:'Medgaz',               coords:[[[36.8,2.5],[37,-0.8]]] },
      { name:'Maghreb-Europe',       coords:[[[36.8,3],[33.9,-5.6],[36.1,-5.9]]] },
      { name:'Eastern Australia Gas',coords:[[[22,149],[33.8,151.2]]] },
      { name:'Yamal-Europe',         coords:[[[67,74],[59,30],[54,18],[52,15]]] },
    ].forEach(function(p) { p.coords.forEach(function(seg) { addPipeline(seg, p.name, 'Gas Pipeline', GAS_OPTS, plLayers.gas); }); });

    // ── PRODUCT PIPELINES ─────────────────────────────────────────
    var PROD_OPTS = { color:'#ffb300', weight:1.5, opacity:0.75, dashArray:'3,3' };
    [
      { name:'Colonial Pipeline USA', coords:[[[29.7,-95],[32,-84],[35,-80],[38,-77]]] },
      { name:'Buckeye Pipeline',      coords:[[[41.5,-87],[41.5,-80],[40.5,-75]]] },
      { name:'Midland-Seadrift TX',   coords:[[[31.8,-102],[28.1,-97]]] },
      { name:'Rotterdam-Rhine',       coords:[[[51.9,4.5],[51.7,5.5],[51.2,7]]] },
      { name:'Singapore-Malaysia',    coords:[[[1.3,103.8],[3.1,101.7]]] },
    ].forEach(function(p) { p.coords.forEach(function(seg) { addPipeline(seg, p.name, 'Product Pipeline', PROD_OPTS, plLayers.product); }); });

    // ── REFINERIES ────────────────────────────────────────────────
    [
      [22.38,70.05,'Jamnagar Refinery','India','Reliance Industries',1240,'ACTIVE'],
      [35.54,129.27,'Ulsan Refinery','South Korea','SK Energy',667,'ACTIVE'],
      [29.90,-93.93,'Port Arthur Refinery','USA','Saudi Aramco/Shell',635,'ACTIVE'],
      [10.6,-62.0,'Paraguana Refinery','Venezuela','PDVSA',600,'ACTIVE'],
      [26.67,50.17,'Ras Tanura Refinery','Saudi Arabia','Saudi Aramco',550,'ACTIVE'],
      [29.73,-94.97,'Baytown Refinery','USA','ExxonMobil',561,'ACTIVE'],
      [23.93,51.85,'Ruwais Refinery','UAE','ADNOC',817,'ACTIVE'],
      [30.44,-91.19,'Baton Rouge Refinery','USA','ExxonMobil',503,'ACTIVE'],
      [54.98,73.37,'Omsk Refinery','Russia','Gazprom Neft',476,'ACTIVE'],
      [51.89,4.37,'Pernis Refinery','Netherlands','Shell',404,'ACTIVE'],
      [30.0,122.0,'Zhoushan Refinery','China','Zhejiang Petrochem',400,'ACTIVE'],
      [38.87,121.5,'Dalian Refinery','China','PetroChina',410,'ACTIVE'],
      [30.35,48.30,'Abadan Refinery','Iran','NIORDC',400,'ACTIVE'],
      [29.72,-95.90,'Garyville Refinery','USA','Marathon',522,'ACTIVE'],
      [29.40,-94.89,'Galveston Bay Refinery','USA','Marathon',459,'ACTIVE'],
      [51.23,4.40,'Antwerp Refinery','Belgium','TotalEnergies',310,'ACTIVE'],
      [50.89,-1.33,'Fawley Refinery','UK','ExxonMobil',320,'ACTIVE'],
      [3.85,113.07,'Bintulu Refinery','Malaysia','Petronas',100,'ACTIVE'],
      [23.35,38.33,'Yanbu Refinery','Saudi Arabia','Saudi Aramco',400,'ACTIVE'],
      [34.85,127.70,'Yeosu Refinery','South Korea','GS Caltex',261,'ACTIVE'],
      [29.72,-97.94,'Corpus Christi Refinery','USA','Valero',300,'ACTIVE'],
      [54.55,39.72,'Ryazan Refinery','Russia','Rosneft',340,'ACTIVE'],
      [29.4,47.9,'Mina Abdulla Refinery','Kuwait','KNPC',270,'ACTIVE'],
      [29.5,48.0,'Mina Al-Ahmadi','Kuwait','KNPC',466,'ACTIVE'],
      [26.0,50.5,'Sitra Refinery','Bahrain','BAPCO',267,'ACTIVE'],
      [36.6,51.4,'Tehran Refinery','Iran','NIORDC',250,'ACTIVE'],
      [25.3,51.5,'Ras Laffan','Qatar','QatarEnergy',302,'ACTIVE'],
      [1.26,103.75,'Jurong Island Refinery','Singapore','ExxonMobil',592,'ACTIVE'],
      [35.67,139.77,'Chiba Refinery','Japan','Idemitsu',220,'ACTIVE'],
      [37.48,126.62,'Incheon Refinery','South Korea','SK Energy',270,'ACTIVE'],
    ].forEach(function(r) {
      var cap = r[5];
      var radius = Math.min(18, Math.max(5, Math.sqrt(cap / 5000) * 2.5 * 3.5));
      var cm = L.circleMarker([r[0],r[1]], { radius:radius, fillColor:'#ff1744', color:'#ff6b00', weight:1.2, opacity:0.9, fillOpacity:0.65, interactive:true });
      cm.on('click', function() {
        this.bindPopup(refineryPopupHTML(r), { maxWidth:280 }).openPopup();
        showDetails(buildDetailHTML([['FACILITY',r[2]],['CATEGORY','Crude Oil Refinery'],['COUNTRY',r[3]],['OPERATOR',r[4]],['CAPACITY',r[5].toLocaleString()+',000 bbl/day'],['STATUS',r[6],'status'],['COORDINATES',r[0].toFixed(2)+'\u00b0N, '+r[1].toFixed(2)+'\u00b0E']],'OGIM v2.5.1 / EIA'));
      });
      cm.addTo(plLayers.refinery);
    });

    // ── LNG TERMINALS ─────────────────────────────────────────────
    [
      [25.9,51.5,'Ras Laffan LNG','Qatar',77],
      [-23.8,151.2,'Gladstone LNG','Australia',15.6],
      [3.2,113.0,'Bintulu LNG','Malaysia',29.3],
      [4.4,7.2,'Bonny Island LNG','Nigeria',22],
      [29.7,-93.9,'Sabine Pass LNG','USA',30],
      [10.2,-61.7,'Atlantic LNG','Trinidad',14.8],
      [35.6,139.9,'Tokyo Bay LNG','Japan',11],
      [37.5,126.6,'Incheon LNG','South Korea',8.4],
      [41.4,2.2,'Barcelona LNG','Spain',9.5],
      [43.4,4.9,'Fos-sur-Mer LNG','France',8.5],
      [-31.9,115.9,'Woodside LNG','Australia',16.9],
      [22.5,114.1,'Dapeng LNG','China',6.7],
    ].forEach(function(t) {
      var icon = L.divIcon({
        className: '',
        html: '<div style="width:10px;height:10px;background:#00b0ff;transform:rotate(45deg);border:1px solid rgba(255,255,255,0.35);box-shadow:0 0 8px rgba(0,176,255,0.7);margin:4px"></div>',
        iconSize: [18,18], iconAnchor: [9,9], popupAnchor: [0,-9],
      });
      var m = L.marker([t[0],t[1]], { icon:icon, interactive:true });
      m.on('click', function() {
        this.bindPopup(lngPopupHTML(t), { maxWidth:260 }).openPopup();
        showDetails(buildDetailHTML([['TERMINAL',t[2]],['CATEGORY','LNG Export Terminal'],['COUNTRY',t[3]],['CAPACITY',t[4]+' MTPA'],['STATUS','ACTIVE','status']],'OGIM v2.5.1'));
      });
      m.addTo(plLayers.lng);
    });

    // ── OFFSHORE PLATFORMS ────────────────────────────────────────
    [
      [29.2,-90.0,'Thunder Horse','USA','BP','FPSO'],
      [57.5,1.7,'Forties Alpha','UK','Apache','Fixed Platform'],
      [58.0,2.0,'Brent Charlie','UK','Shell','Fixed Platform'],
      [51.5,3.0,'P-36','Netherlands','Total','Semi-sub'],
      [26.0,53.0,'Salman Field','Iran','IOOC','Fixed Platform'],
      [25.5,50.5,'Bahrain Field','Bahrain','BAPCO','Fixed Platform'],
      [4.0,7.5,'Bonga FPSO','Nigeria','Shell','FPSO'],
      [3.0,8.5,'Erha FPSO','Nigeria','ExxonMobil','FPSO'],
      [-22.5,-39.5,'Buzios FPSO','Brazil','Petrobras','FPSO'],
      [-23.0,-40.0,'Lula FPSO','Brazil','Petrobras','FPSO'],
      [20.5,60.5,'Block 8 Oman','Oman','OQ','Fixed Platform'],
      [12.0,53.5,'Masila Block','Yemen','PetroMasila','Fixed Platform'],
      [1.0,104.5,'Natuna D-Alpha','Indonesia','ExxonMobil','Semi-sub'],
      [-5.0,11.5,'Girassol FPSO','Angola','TotalEnergies','FPSO'],
      [-9.0,12.0,'Dalia FPSO','Angola','TotalEnergies','FPSO'],
      [65.0,57.0,'Prirazlomnoye','Russia','Gazprom','Fixed Platform'],
      [69.5,57.5,'Novoportovskoye','Russia','Gazprom','Gravity Platform'],
      [56.5,-61.0,'Hibernia','Canada','ExxonMobil','GBS'],
      [46.5,-48.5,'Terra Nova FPSO','Canada','Suncor','FPSO'],
      [10.5,-63.0,'Dragon Field','Venezuela','Shell','Semi-sub'],
    ].forEach(function(p) {
      var cm = L.circleMarker([p[0],p[1]], { radius:4, fillColor:'#00e676', color:'#00e676', weight:1, opacity:0.8, fillOpacity:0.7, interactive:true });
      cm.on('click', function() {
        this.bindPopup(platformPopupHTML(p), { maxWidth:250 }).openPopup();
        showDetails(buildDetailHTML([['PLATFORM',p[2]],['CATEGORY','Offshore Platform'],['COUNTRY',p[3]],['OPERATOR',p[4]],['TYPE',p[5]],['STATUS','ACTIVE','status']],'OGIM v2.5.1'));
      });
      cm.addTo(plLayers.offshore);
    });

    // ── MAP LABELS ────────────────────────────────────────────────
    [[25,50,'PERSIAN GULF'],[15,42,'RED SEA'],[43,28,'BLACK SEA'],
     [36,18,'MEDITERRANEAN'],[27,-90,'GULF OF MEXICO'],[62,-3,'NORTH SEA'],
     [-5,-25,'SOUTH ATLANTIC'],[5,2,'GULF OF GUINEA']
    ].forEach(function(lbl) {
      var icon = L.divIcon({ className:'', html:'<div class="pl-map-label">'+lbl[2]+'</div>', iconSize:[120,16], iconAnchor:[60,8] });
      L.marker([lbl[0],lbl[1]], { icon:icon, interactive:false, zIndexOffset:-1000 }).addTo(state.pipelineMap);
    });

    // ── LAYER TOGGLES ─────────────────────────────────────────────
    document.querySelectorAll('#page-pipeline .pl-layer-cb').forEach(function(cb) {
      cb.addEventListener('change', function() {
        var key = this.dataset.layer;
        if (this.checked) state.pipelineMap.addLayer(plLayers[key]);
        else              state.pipelineMap.removeLayer(plLayers[key]);
        var statEl = document.getElementById('pl-stat-refineries');
        if (statEl) statEl.textContent = document.getElementById('pl-cb-refinery').checked ? '30' : '\u2014';
      });
    });

    // ── ENTRANCE ANIMATION ────────────────────────────────────────
    document.querySelectorAll('#page-pipeline .pl-panel').forEach(function(el, i) {
      el.style.opacity = '0';
      el.style.transform = 'translateX(-8px)';
      el.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      setTimeout(function() { el.style.opacity = '1'; el.style.transform = 'translateX(0)'; }, 80 + i * 60);
    });

    setTimeout(function() { state.pipelineMap.invalidateSize(); }, 150);
  }

  // ============================================================
  function setupNavigation() {
    document.querySelectorAll('[data-page]').forEach(link => {
      link.addEventListener('click', e => { e.preventDefault(); navigateTo(link.dataset.page); });
    });
  }

  function navigateTo(page) {
    state.page = page;
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-' + page)?.classList.add('active');
    document.querySelectorAll('[data-page]').forEach(l => l.classList.toggle('active', l.dataset.page === page));
    if (page === 'charts')       { initChartsPage(); initEIACharts(); }
    if (page === 'charts-extra') { initEIAExtra(); }
    if (page === 'stocks')        { initStocks(); }
    if (page === 'stats')  initStatsPage();
    if (page === 'country') initCountryPage();
    if (page === 'news')    initNewsFilters();
    if (page === 'pipeline') initPipelinePage();
    if (page === 'dashboard' && state.map) setTimeout(() => state.map.invalidateSize(), 100);
    // When user opens the Tankers page, refresh data and re-render table immediately
    if (page === 'tankers') {
      // Re-render with current in-memory data right away
      if (CrudeRadar.tankers.length > 0) {
        renderTankersTable(CrudeRadar.tankers);
        updateTankerStats(CrudeRadar.tankers, CrudeRadar.tankers.filter(function(t){ return !t.stale; }).length);
      }
      // Then fetch fresh from blob
      CrudeAPI.fetchCachedTankers().then(function(t) {
        if (t && t.length > 0) applyLiveTankers(t);
      });
    }
  }

  function initEIACharts() {
    if (state.eiaChartsInitialized) return;
    state.eiaChartsInitialized = true;
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        if (typeof window.initEIAChartsPage === 'function') window.initEIAChartsPage();
      });
    });
  }

  function initStocks() {
    if (state.stocksInitialized) {
      if (typeof window.initStocksPage === 'function') window.initStocksPage();
      return;
    }
    state.stocksInitialized = true;
    // expose reload hook for refresh button
    window._stocksReload = function () {
      state.stocksInitialized = false;
      window.initStocksPage && window.initStocksPage();
    };
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        if (typeof window.initStocksPage === 'function') window.initStocksPage();
      });
    });
  }

  function initEIAExtra() {
    if (state.eiaExtraInitialized) return;
    state.eiaExtraInitialized = true;
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        if (typeof window.initEIAExtraPage === 'function') {
          window.initEIAExtraPage();
        }
      });
    });
  }


  function initNewsFilters() {
    const allNews = () => [...state.telegramNews, ...state.liveNews];

    const wireGroup = (groupId) => {
      const btns = document.querySelectorAll('#' + groupId + ' .nws-fbtn');
      if (!btns.length || btns[0]._nwsWired) return;
      btns.forEach(btn => {
        btn._nwsWired = true;
        btn.addEventListener('click', () => {
          btns.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          updateNewsPage(allNews());
        });
      });
    };

    wireGroup('nws-region-btns');
    wireGroup('nws-topic-btns');
    wireGroup('nws-sort-btns');

    const search = document.getElementById('nws-search');
    if (search && !search._nwsWired) {
      search._nwsWired = true;
      let debounce;
      search.addEventListener('input', () => {
        clearTimeout(debounce);
        debounce = setTimeout(() => updateNewsPage(allNews()), 250);
      });
    }
  }

  // ============================================================
  // AUTH
  // ============================================================
  function setupAuth() {
    document.getElementById('login-btn')?.addEventListener('click',  () => openModal('login'));
    document.getElementById('signup-btn')?.addEventListener('click', () => openModal('signup'));
    document.getElementById('modal-overlay')?.addEventListener('click', e => { if (e.target.id === 'modal-overlay') closeModal(); });
    document.getElementById('modal-close-btn')?.addEventListener('click', closeModal);
    document.getElementById('do-login')?.addEventListener('click',  doLogin);
    document.getElementById('do-signup')?.addEventListener('click', doSignup);
    document.getElementById('switch-to-signup')?.addEventListener('click', () => openModal('signup'));
    document.getElementById('switch-to-login')?.addEventListener('click',  () => openModal('login'));
    document.getElementById('chat-login-link')?.addEventListener('click',  () => openModal('login'));
  }

  function openModal(type) {
    const overlay = document.getElementById('modal-overlay');
    if (!overlay) return;
    document.getElementById('form-login').style.display  = type === 'login'  ? 'block' : 'none';
    document.getElementById('form-signup').style.display = type === 'signup' ? 'block' : 'none';
    overlay.classList.add('open');
  }
  function closeModal() { document.getElementById('modal-overlay')?.classList.remove('open'); }

  function doLogin() {
    const email = document.getElementById('login-email')?.value;
    const pass  = document.getElementById('login-pass')?.value;
    if (!email || !pass) { alert('Fill in all fields'); return; }
    loginUser(email.split('@')[0]);
  }
  function doSignup() {
    const name  = document.getElementById('signup-name')?.value;
    const email = document.getElementById('signup-email')?.value;
    const pass  = document.getElementById('signup-pass')?.value;
    if (!name || !email || !pass) { alert('Fill in all fields'); return; }
    loginUser(name);
  }
  function loginUser(username) {
    state.user = { name: username };
    document.getElementById('user-area').style.display    = 'none';
    document.getElementById('user-profile').style.display = 'flex';
    document.getElementById('user-avatar').textContent     = username.slice(0, 2).toUpperCase();
    document.getElementById('username-display').textContent = username;
    closeModal();
    document.getElementById('chat-login-notice').style.display = 'none';
    document.getElementById('chat-input-area').style.display   = 'flex';
  }

  // ============================================================
  // CHAT
  // ============================================================
  function setupChat() {
    const toggle = document.getElementById('chat-toggle');
    const panel  = document.getElementById('chat-panel');
    toggle?.addEventListener('click', () => {
      state.chatOpen = !state.chatOpen;
      panel?.classList.toggle('open', state.chatOpen);
      toggle.textContent = state.chatOpen ? '?' : '?';
      if (state.chatOpen) renderChatMessages();
    });
    document.getElementById('chat-close')?.addEventListener('click', () => {
      state.chatOpen = false; panel?.classList.remove('open'); toggle.textContent = '?';
    });
    document.getElementById('chat-send')?.addEventListener('click', sendChat);
    document.getElementById('chat-input')?.addEventListener('keydown', e => { if (e.key === 'Enter') sendChat(); });
    setInterval(() => {
      if (!state.chatOpen) return;
      const pool = [
        { user:'OilTrader_KW',  text:'Brent holding $81 key support. Bulls in control.' },
        { user:'AnalystPro',    text:'EIA draw was bullish. Expecting follow-through.'   },
        { user:'TraderMENA',    text:'Saudi OSP unchanged. Demand holding in Asia.'      },
        { user:'PetroDesk',     text:'VLCC rates up. Red Sea rerouting adding ton-miles.'},
      ];
      const m = pool[Math.floor(Math.random() * pool.length)];
      state.chatMessages.push({ ...m, time: new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'}), me:false });
      if (state.chatMessages.length > 60) state.chatMessages.shift();
      renderChatMessages();
    }, 14000);
  }

  function sendChat() {
    if (!state.user) return;
    const input = document.getElementById('chat-input');
    const text  = input?.value?.trim();
    if (!text) return;
    state.chatMessages.push({ user:state.user.name, text, time:new Date().toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'}), me:true });
    input.value = '';
    renderChatMessages();
  }

  function renderChatMessages() {
    const container = document.getElementById('chat-messages');
    if (!container) return;
    container.innerHTML = state.chatMessages.map(m =>
      `<div class="chat-msg ${m.me ? 'me' : 'other'}">
        <div class="msg-user">${m.user}</div>${escapeHtml(m.text)}
        <div class="msg-time">${m.time}</div>
      </div>`
    ).join('');
    container.scrollTop = container.scrollHeight;
  }

  // ============================================================
  // CHARTS PAGE
  // ============================================================

  // Called by applyLivePrices whenever prices update -- keeps headers live
  function updateChartHeaders(parsedPrices) {
    const map = [
      { priceKey:'wti',     id:'wti'     },
      { priceKey:'brent',   id:'brent'   },
      { priceKey:'dubai',   id:'dubai'   },
      { priceKey:'natgas',  id:'natgas'  },
      { priceKey:'rbob',    id:'rbob'    },
      { priceKey:'heatoil', id:'heatoil' },
    ];
    map.forEach(({ priceKey, id }) => {
      const data     = parsedPrices?.[priceKey];
      const priceEl  = document.getElementById(`chart-${id}-price`);
      const chgEl    = document.getElementById(`chart-${id}-chg`);
      if (!priceEl || !chgEl || !data?.price) return;
      priceEl.textContent = '$' + data.price.toFixed(2);
      if (data.changePct !== null && data.changePct !== undefined) {
        const up   = data.changePct >= 0;
        const sign = up ? '\u25B2 +' : '\u25BC ';
        chgEl.textContent  = `${sign}${data.changePct.toFixed(2)}%`;
        chgEl.style.color  = up ? 'var(--accent-green)' : 'var(--accent-red)';
      }
    });
  }

  function initChartsPage() {
    if (state.chartsInitialized) return;

    // Update headers with whatever prices we have right now
    updateChartHeaders(state._lastParsedPrices);

    const hasData = Object.values(CrudeRadar.priceHistory).some(h => h?.length > 0);
    if (!hasData) {
      console.info('[charts] No history data yet -- waiting for live data');
      state.chartsInitialized = false; // allow retry
      return;
    }

    state.chartsInitialized = true;

    const cfgs = [
      { id:'chart-wti',     label:'WTI Crude',     data:CrudeRadar.priceHistory.wti,     color:'#ff6b00' },
      { id:'chart-brent',   label:'Brent Crude',   data:CrudeRadar.priceHistory.brent,   color:'#ffb300' },
      { id:'chart-dubai',   label:'Dubai Crude',   data:CrudeRadar.priceHistory.dubai,   color:'#00b0ff' },
      { id:'chart-natgas',  label:'Natural Gas',   data:CrudeRadar.priceHistory.natgas,  color:'#00e5ff' },
      { id:'chart-rbob',    label:'RBOB Gasoline', data:CrudeRadar.priceHistory.rbob,    color:'#00e676' },
      { id:'chart-heatoil', label:'Heating Oil',   data:CrudeRadar.priceHistory.heatoil, color:'#ff1744' },
    ];

    cfgs.forEach(cfg => {
      const canvas = document.getElementById(cfg.id);
      if (!canvas || !cfg.data?.length) return;
      // Destroy existing chart if any
      const existing = Chart.getChart(canvas);
      if (existing) existing.destroy();

      const ctx  = canvas.getContext('2d');
      const grad = ctx.createLinearGradient(0, 0, 0, 200);
      grad.addColorStop(0, cfg.color + '40');
      grad.addColorStop(1, cfg.color + '00');
      new Chart(ctx, {
        type: 'line',
        data: {
          labels: CrudeRadar.chartLabels,
          datasets: [{ label:cfg.label, data:cfg.data, borderColor:cfg.color, backgroundColor:grad, borderWidth:1.5, pointRadius:0, pointHoverRadius:4, tension:0.3, fill:true }],
        },
        options: {
          responsive:true, maintainAspectRatio:false,
          plugins: {
            legend: { display:false },
            tooltip: { backgroundColor:'#0e1117', borderColor:cfg.color, borderWidth:1, titleColor:cfg.color, bodyColor:'#e0e8f0', titleFont:{family:'Share Tech Mono',size:11}, bodyFont:{family:'Share Tech Mono',size:13} },
          },
          scales: {
            x: { grid:{color:'rgba(30,45,69,0.4)'}, ticks:{color:'#4a6078',font:{family:'Share Tech Mono',size:9},maxTicksLimit:6}, border:{color:'rgba(30,45,69,0.6)'} },
            y: { grid:{color:'rgba(30,45,69,0.4)'}, ticks:{color:'#4a6078',font:{family:'Share Tech Mono',size:10}}, border:{color:'rgba(30,45,69,0.6)'} },
          },
          interaction: { mode:'index', intersect:false },
        },
      });
    });

    console.log('[charts] Rendered', cfgs.filter(c => CrudeRadar.priceHistory[c.id.replace('chart-','')]?.length).length, 'charts');
  }

  // ============================================================
  // STATS PAGE
  // ============================================================
  function initStatsPage() {
    if (state.statsInitialized) return;
    state.statsInitialized = true;
    // rAF ensures canvas is visible + has size before Chart.js measures it
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (typeof window.initEIStatsPage === 'function') window.initEIStatsPage();
      });
    });
  }

  function initCountryPage() {
    if (state.countryInitialized) return;
    state.countryInitialized = true;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (typeof window.initEICountryPage === 'function') window.initEICountryPage();
      });
    });
  }

  // ============================================================
  // TELEGRAM FEED
  // ============================================================
  function initTelegramFeed() {
    fetchTelegramFeed();
    setInterval(fetchTelegramFeed, 60 * 1000);
  }

  async function fetchTelegramFeed() {
    const messages = await CrudeAPI.fetchTelegramMessages(20);
    if (!messages?.length) {
      setStatusBadge('api-status-telegram', 'demo', 'TELEGRAM ? SETUP');
      return;
    }
    renderTelegramFeed(messages);
    setStatusBadge('api-status-telegram', 'live', 'TELEGRAM LIVE');
    // Write critical Telegram items to shared store then rebuild ticker
    _tickerTelegram = messages.filter(m => m.critical).slice(0, 5)
      .map(m => ({ headline: m.headline || '', source: 'Telegram', pubDate: '', critical: true }));
    rebuildTicker();   // always rebuilds from _tickerTelegram + _tickerRSS
  }

  function renderTelegramFeed(messages) {
    const notice  = document.getElementById('tg-setup-notice');
    const list    = document.getElementById('tg-messages-list');
    const countEl = document.getElementById('tg-msg-count');
    if (!list) return;
    if (notice) notice.style.display = 'none';
    list.style.display = 'block';
    if (countEl) countEl.textContent = `${messages.length} messages`;
    list.innerHTML = messages.slice(0, 8).map(m => `
      <div class="tg-item" ${m.url ? `onclick="window.open('${m.url}','_blank')"` : ''}>
        <div class="tg-item-header">
          <span class="tg-channel">${m.chatName || m.source || 'Telegram'}</span>
          <span class="tg-tag${m.critical ? ' critical' : ''}">${m.tag}</span>
          ${m.critical ? '<span class="tg-tag critical">? BREAKING</span>' : ''}
          <span class="tg-time">${m.time}</span>
        </div>
        <div class="tg-text">${escapeHtml(m.headline)}</div>
        ${m.url ? `<div style="font-family:var(--font-mono);font-size:9px;color:#00b0ff;margin-top:3px">View on Telegram ?</div>` : ''}
      </div>`).join('');
    // Merge Telegram into news feed sidebar
    state.telegramNews = messages.map(m => ({
      source: `? ${m.chatName || 'Telegram'}`, tag: m.tag,
      headline: m.headline, url: m.url, time: m.time, critical: m.critical,
    }));
    const combined = [...state.telegramNews, ...state.liveNews].slice(0, 12);
    renderNewsPanel(combined);
  }

  // ============================================================
  // UTILS
  // ============================================================
  function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

})(); // end IIFE
