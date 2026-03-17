// ============================================================
// CRUDE RADAR — js/app.js
// Single clean IIFE. No code outside the closure.
// ============================================================

(function () {
  'use strict';

  // ── STATE ──────────────────────────────────────────────────
  const state = {
    page:              'dashboard',
    user:              null,
    chatOpen:          false,
    mapMode:           'production',
    map:               null,
    mapLayers:         { tankers: null, production: null, consumption: null },
    contracts:         JSON.parse(JSON.stringify(CrudeRadar.contracts)),
    liveDataActive:    false,   // true once real prices arrive → stops simulation
    chartsInitialized: false,
    statsInitialized:  false,
    liveNews:          [],
    telegramNews:      [],
    fxRates:           null,
    chatMessages: [
      { user: 'OilTrader_KW',  text: 'Anyone watching Brent this morning? Big move incoming.',   time: '09:12', me: false },
      { user: 'MarketWatch88', text: 'OPEC+ holding firm. Saudis want $85+ before any unwind.', time: '09:15', me: false },
      { user: 'System',        text: 'Market open.',                                             time: '09:30', me: false },
    ],
  };

  // ── BOOT ───────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    buildTicker();
    startClock();
    renderPriceGrid();
    renderNewsPanel([]);
    renderTankersTable(CrudeRadar.tankers);
    renderProductionTable();
    setupNavigation();
    setupAuth();
    setupChat();
    initLeafletMap();
    startSimulatedPriceUpdates();
    fetchLiveData();
    setTimeout(initTelegramFeed, 3000);
  });

  // ════════════════════════════════════════════════════════════
  // LIVE DATA — reads from Netlify Blob endpoints
  // ════════════════════════════════════════════════════════════
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

    // ── Prices ──────────────────────────────────────────────
    const parsedPrices = CrudeAPI.parsePriceCache(
      pricesResult.status === 'fulfilled' ? pricesResult.value : null
    );
    if (parsedPrices) {
      applyLivePrices(parsedPrices);
      setStatusBadge('api-status-prices', 'live', 'PRICES LIVE');
    } else {
      console.warn('[CrudeRadar] No live prices. Check OILPRICE_API_KEY + run /api/oil-refresh');
      setStatusBadge('api-status-prices', 'demo', 'PRICES DEMO');
    }

    // ── News ────────────────────────────────────────────────
    const parsedNews = CrudeAPI.parseNewsCache(
      newsResult.status === 'fulfilled' ? newsResult.value : null
    );
    if (parsedNews.length > 0) {
      state.liveNews = parsedNews;
      renderNewsPanel(parsedNews);
      updateNewsPage(parsedNews);
      updateTickerFromNews(parsedNews);
      setStatusBadge('api-status-news', 'live', 'NEWS LIVE');
    } else {
      console.warn('[CrudeRadar] No live news. Check RSS feeds + GNEWS_API_KEY');
      renderNewsPanel([]);
      setStatusBadge('api-status-news', 'demo', 'NEWS DEMO');
    }

    // ── EIA ─────────────────────────────────────────────────
    const parsedEIA = CrudeAPI.parseEIACache(
      eiaResult.status === 'fulfilled' ? eiaResult.value : null
    );
    if (parsedEIA) {
      applyEIACache(parsedEIA);
      setStatusBadge('api-status-eia', 'live', 'EIA LIVE');
    } else {
      setStatusBadge('api-status-eia', 'demo', 'EIA DEMO');
    }

    // ── Tankers ─────────────────────────────────────────────
    if (tankersResult.status === 'fulfilled' && Array.isArray(tankersResult.value)) {
      CrudeRadar.tankers = tankersResult.value;
      renderTankersTable(tankersResult.value);
      if (state.mapMode === 'tankers') renderMapMode('tankers');
      setStatusBadge('api-status-tankers', 'live', 'AIS LIVE');
    } else {
      setStatusBadge('api-status-tankers', 'demo', 'AIS DEMO');
    }

    // ── FX ──────────────────────────────────────────────────
    if (fxResult.status === 'fulfilled' && fxResult.value) {
      state.fxRates = fxResult.value;
      updateFXDisplay();
    }

    // Re-fetch every 5 minutes (matches Blob CDN TTL)
    setTimeout(fetchLiveData, 5 * 60 * 1000);
  }

  // ── APPLY LIVE PRICES ────────────────────────────────────
  // parsedPrices shape: { wti, brent, dubai, natgas, rbob, heatoil }
  // each: { price, change, changePct, history:[{period,value}] }
  function applyLivePrices(parsedPrices) {
    if (!parsedPrices) return;

    // Map contract IDs to the keys in parsedPrices
    const idToKey = {
      wti:      'wti',
      brent:    'brent',
      dubai:    'dubai',
      crude_ng: 'natgas',
      hho:      'heatoil',
      rbob:     'rbob',
      // Derived contracts
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
      state.liveDataActive = true;   // stop simulation overwriting real prices
      renderPriceGrid();
      console.log(`[CrudeRadar] Applied live prices to ${updated} tiles`);
    }

    // Update chart history arrays with live 30-day data
    const histMap = {
      wti:     parsedPrices.wti?.history,
      brent:   parsedPrices.brent?.history,
      dubai:   parsedPrices.dubai?.history,
      natgas:  parsedPrices.natgas?.history,
      rbob:    parsedPrices.rbob?.history,
      heatoil: parsedPrices.heatoil?.history,
    };

    let chartDataChanged = false;
    for (const [key, history] of Object.entries(histMap)) {
      if (!history?.length) continue;
      CrudeRadar.priceHistory[key] = history.map(h => h.value);
      if (key === 'wti') {
        CrudeRadar.chartLabels = history.map(h => {
          const d = new Date(h.period);
          return isNaN(d) ? h.period : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        });
      }
      chartDataChanged = true;
    }

    // Re-draw charts with live data if they were already rendered
    if (chartDataChanged && state.chartsInitialized) {
      state.chartsInitialized = false;
      try {
        // Destroy all existing Chart.js instances to avoid "canvas already in use"
        Object.values(Chart.instances || {}).forEach(chart => {
          try { chart.destroy(); } catch (_) {}
        });
      } catch (_) {}
      initChartsPage();
    }
  }

  // ── APPLY EIA CACHE ─────────────────────────────────────
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
          ${chg < 0 ? '▼' : '▲'} ${Math.abs(chg / 1000).toFixed(2)}M bbl week-over-week
        </div>
        <div style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim);margin-top:2px">
          EIA · ${eiaData.stocksPeriod || ''}
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

    // If OilPriceAPI is not active, use EIA monthly WTI/Brent for price tiles
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

    // Update chart history from EIA monthly if OilPriceAPI history is empty
    if (eiaData.wtiMonthly?.length && !CrudeRadar.priceHistory.wti?.length) {
      const s = eiaData.wtiMonthly.slice(0, 30).reverse();
      CrudeRadar.priceHistory.wti    = s.map(d => d.value);
      CrudeRadar.chartLabels         = s.map(d => d.period);
    }
    if (eiaData.brentMonthly?.length && !CrudeRadar.priceHistory.brent?.length) {
      CrudeRadar.priceHistory.brent  = eiaData.brentMonthly.slice(0, 30).reverse().map(d => d.value);
    }
  }

  // ── STATUS BADGE ─────────────────────────────────────────
  function setStatusBadge(id, type, label) {
    const el = document.getElementById(id);
    if (!el) return;
    const color = type === 'live' ? 'var(--accent-green)' : 'var(--accent-amber)';
    el.innerHTML = `<span style="color:${color};font-family:var(--font-mono);font-size:9px;letter-spacing:1px">● ${label}</span>`;
  }

  // ── FX DISPLAY ───────────────────────────────────────────
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

  // ════════════════════════════════════════════════════════════
  // TICKER
  // ════════════════════════════════════════════════════════════
  function buildTicker() {
    const msgs    = CrudeRadar.tickerMessages;
    const doubled = [...msgs, ...msgs];
    const track   = document.getElementById('ticker-track');
    if (track) track.innerHTML = doubled.map(m =>
      `<span class="ticker-item${m.critical ? ' critical' : ''}"><span class="dot">•</span> ${m.text}</span>`
    ).join('');
  }

  function updateTickerFromNews(articles) {
    const critical = articles.filter(a => a.critical).slice(0, 6);
    if (!critical.length) return;
    const combined = [
      ...critical.map(a => ({ text: a.headline.slice(0, 90), critical: true })),
      ...CrudeRadar.tickerMessages.filter(m => !m.critical),
    ];
    const doubled = [...combined, ...combined];
    const track   = document.getElementById('ticker-track');
    if (track) track.innerHTML = doubled.map(m =>
      `<span class="ticker-item${m.critical ? ' critical' : ''}"><span class="dot">•</span> ${m.text}</span>`
    ).join('');
  }

  // ════════════════════════════════════════════════════════════
  // CLOCK
  // ════════════════════════════════════════════════════════════
  function startClock() {
    const el = document.getElementById('live-clock');
    if (!el) return;
    const update = () => { el.textContent = new Date().toUTCString().slice(17, 25) + ' UTC'; };
    update();
    setInterval(update, 1000);
  }

  // ════════════════════════════════════════════════════════════
  // PRICE GRID
  // ════════════════════════════════════════════════════════════
  function renderPriceGrid() {
    const grid = document.getElementById('price-grid');
    if (!grid) return;
    grid.innerHTML = state.contracts.map(c => {
      // Use live change from API when available
      const chg = (c._liveChange !== undefined && c._liveChange !== null)
        ? c._liveChange
        : (c.price - c.prev);
      const pct = (c._liveChangePct !== undefined && c._liveChangePct !== null)
        ? Math.abs(c._liveChangePct).toFixed(2)
        : Math.abs((chg / (c.prev || c.price || 1)) * 100).toFixed(2);
      const dir   = chg > 0 ? 'up' : chg < 0 ? 'down' : 'neutral';
      const arrow = chg > 0 ? '▲' : chg < 0 ? '▼' : '—';
      const priceStr = c.price > 0 ? '$' + c.price.toFixed(2) : '—';
      const chgStr   = c.price > 0 ? `${arrow} ${Math.abs(chg).toFixed(2)} (${pct}%)` : 'Loading...';
      return `<div class="price-card ${dir}" id="pc-${c.id}">
        <div class="label">${c.flag} ${c.label}</div>
        <div class="name">${c.name}</div>
        <div class="price">${priceStr}</div>
        <div class="change">${chgStr}</div>
        <div class="exchange">${c.exchange} · ${c.unit}</div>
      </div>`;
    }).join('');
  }

  // ── SIMULATED UPDATES (demo only — stops when live data loads)
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
        const arrow = chg > 0 ? '▲' : chg < 0 ? '▼' : '—';
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

  // ════════════════════════════════════════════════════════════
  // NEWS
  // ════════════════════════════════════════════════════════════
  function renderNewsPanel(newsItems) {
    const el = document.getElementById('news-feed');
    if (!el) return;
    if (!newsItems || newsItems.length === 0) {
      el.innerHTML = `<div style="padding:14px 12px;font-family:var(--font-mono);font-size:11px;color:var(--text-dim);text-align:center">
        <div style="margin-bottom:4px">⏳ Loading live news...</div>
        <div style="font-size:9px;color:var(--text-dim)">Fetched hourly from OPEC · IEA · OilPrice · Rigzone · Platts</div>
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

  function updateNewsPage(articles) {
    const el = document.getElementById('news-full-list');
    if (!el) return;
    el.innerHTML = articles.map(n => `
      <div style="padding:14px 0;border-bottom:1px solid rgba(30,45,69,0.4);cursor:pointer"
           onclick="window.open('${n.url || '#'}','_blank')">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px">
          <span class="news-source" style="margin:0">${n.source}</span>
          <span class="news-tag${n.critical ? ' critical' : ''}">${n.tag}</span>
          ${n.critical ? '<span class="news-tag critical">BREAKING</span>' : ''}
          <span class="news-time" style="margin:0;margin-left:auto">${n.time}</span>
        </div>
        <div style="font-family:var(--font-ui);font-size:14px;font-weight:500;color:var(--text-primary);line-height:1.5">
          ${escapeHtml(n.headline)}
        </div>
        ${n.url ? `<div style="font-family:var(--font-mono);font-size:10px;color:var(--accent-blue);margin-top:4px">Read full article ↗</div>` : ''}
      </div>`
    ).join('');
  }

  // ════════════════════════════════════════════════════════════
  // TANKERS TABLE
  // ════════════════════════════════════════════════════════════
  function renderTankersTable(tankers) {
    const tbody = document.getElementById('tankers-tbody');
    if (!tbody) return;
    tbody.innerHTML = (tankers || []).map(t =>
      `<tr>
        <td><span class="tanker-status-dot ${t.status}"></span>${t.name}</td>
        <td>${t.flag} ${t.type}</td>
        <td>${t.from}</td>
        <td>${t.to}</td>
        <td style="font-family:var(--font-mono);font-size:11px">${parseFloat(t.lat).toFixed(2)}°, ${parseFloat(t.lng).toFixed(2)}°</td>
        <td>${t.speed} kn</td>
        <td><span class="tag">${t.status.toUpperCase()}</span></td>
        <td style="font-family:var(--font-mono)">${t.eta}</td>
      </tr>`
    ).join('');
  }

  // ════════════════════════════════════════════════════════════
  // PRODUCTION TABLE
  // ════════════════════════════════════════════════════════════
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

  // ════════════════════════════════════════════════════════════
  // LEAFLET MAP
  // ════════════════════════════════════════════════════════════
  const COUNTRY_LATLNG = {
    US:[38.9,-97.5], RU:[62,95],    SA:[24,45],    CA:[57,-97],   IQ:[33,44],
    CN:[35.5,103],   AE:[23.4,53.8],IR:[32.4,53.7],BR:[-10,-55], KW:[29.3,47.5],
    MX:[24,-102],    NG:[9.1,8.7],  KZ:[48,68],    NO:[65,16],    LY:[27,17],
  };

  function initLeafletMap() {
    const container = document.getElementById('leaflet-map');
    if (!container || typeof L === 'undefined') return;
    state.map = L.map('leaflet-map', { center:[20,10], zoom:2, minZoom:1, maxZoom:8 });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '© <a href="https://openstreetmap.org/copyright" style="color:#ff6b00">OpenStreetMap</a> contributors, © <a href="https://carto.com/attributions" style="color:#ff6b00">CARTO</a>',
      subdomains: 'abcd', maxZoom: 19,
    }).addTo(state.map);
    setTimeout(() => {
      const attr = document.querySelector('.leaflet-control-attribution');
      if (attr) Object.assign(attr.style, { background:'rgba(10,12,15,0.85)',color:'#4a6078',fontSize:'9px',border:'1px solid #1e2d45' });
    }, 500);
    renderMapMode('production');
    document.querySelectorAll('.map-btn').forEach(btn => {
      btn.addEventListener('click', () => {
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
    Object.values(state.mapLayers).forEach(l => { if (l) state.map.removeLayer(l); });
    state.mapLayers = { tankers: null, production: null, consumption: null };
    if (mode === 'production')  renderProductionLayer();
    else if (mode === 'consumption') renderConsumptionLayer();
    else if (mode === 'tankers') renderTankersLayer();
  }

  function makePopup(borderColor, title, lines) {
    return `<div style="background:#111520;border:1px solid ${borderColor};padding:10px 14px;min-width:180px;font-family:'Share Tech Mono',monospace">
      <div style="color:${borderColor};font-size:11px;letter-spacing:2px;margin-bottom:6px">${title}</div>
      ${lines.map(l => `<div style="color:#8899aa;font-size:10px;margin-top:3px">${l}</div>`).join('')}
    </div>`;
  }

  function renderProductionLayer() {
    const group = L.layerGroup();
    CrudeRadar.production.forEach(p => {
      const ll = COUNTRY_LATLNG[p.code];
      if (!ll) return;
      const r = Math.max(10, Math.min(44, p.production * 3.4));
      const color = p.production >= 10 ? '#ff6b00' : p.production >= 5 ? '#ffb300' : '#00b0ff';
      const circle = L.circleMarker(ll, { radius:r, fillColor:color, color, weight:1.5, opacity:0.85, fillOpacity:0.3 });
      circle.bindPopup(makePopup('#ff6b00', p.country.toUpperCase(), [
        `Production: <span style="color:#fff">${p.production} Mb/d</span>`,
        `Consumption: <span style="color:#fff">${p.consumption} Mb/d</span>`,
        `Company: <span style="color:#ff6b00">${p.company}</span>`,
      ]), { className:'crude-popup', closeButton:false });
      group.addLayer(circle);
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

  function renderTankersLayer() {
    const group = L.layerGroup();
    const colorMap = { underway:'#00e676', anchored:'#ffb300', moored:'#00b0ff' };
    CrudeRadar.tankers.forEach(t => {
      const col = colorMap[t.status] || '#8899aa';
      const icon = L.divIcon({
        html: `<div style="width:12px;height:12px;border-radius:50%;background:${col};border:1.5px solid rgba(0,0,0,0.5);box-shadow:0 0 8px ${col}55"></div>`,
        iconSize:[12,12], iconAnchor:[6,6], className:'',
      });
      const marker = L.marker([t.lat, t.lng], { icon });
      marker.bindPopup(makePopup(col, t.name, [
        `Type: <span style="color:#e0e8f0">${t.flag} ${t.type}</span>`,
        `Route: <span style="color:#e0e8f0">${t.from} → ${t.to}</span>`,
        `Speed: <span style="color:#e0e8f0">${t.speed} knots</span>`,
        `Status: <span style="color:${col}">${t.status.toUpperCase()}</span>`,
        `ETA: <span style="color:#e0e8f0">${t.eta}</span>`,
        `MMSI: ${t.mmsi}`,
      ]), { className:'crude-popup', closeButton:false });
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
      items.innerHTML = `
        <div class="map-legend-item"><div class="map-legend-dot" style="background:#ff6b00"></div>>10 Mb/d</div>
        <div class="map-legend-item"><div class="map-legend-dot" style="background:#ffb300"></div>5–10 Mb/d</div>
        <div class="map-legend-item"><div class="map-legend-dot" style="background:#00b0ff"></div>1–5 Mb/d</div>`;
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
        <div class="map-legend-item"><div class="map-legend-dot" style="background:#ff6b00"></div>5–15 Mb/d</div>
        <div class="map-legend-item"><div class="map-legend-dot" style="background:#ffb300"></div>1–5 Mb/d</div>`;
    }
  }

  // ════════════════════════════════════════════════════════════
  // NAVIGATION
  // ════════════════════════════════════════════════════════════
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
    if (page === 'charts') initChartsPage();
    if (page === 'stats')  initStatsPage();
    if (page === 'dashboard' && state.map) setTimeout(() => state.map.invalidateSize(), 100);
  }

  // ════════════════════════════════════════════════════════════
  // AUTH
  // ════════════════════════════════════════════════════════════
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

  // ════════════════════════════════════════════════════════════
  // CHAT
  // ════════════════════════════════════════════════════════════
  function setupChat() {
    const toggle = document.getElementById('chat-toggle');
    const panel  = document.getElementById('chat-panel');
    toggle?.addEventListener('click', () => {
      state.chatOpen = !state.chatOpen;
      panel?.classList.toggle('open', state.chatOpen);
      toggle.textContent = state.chatOpen ? '✕' : '💬';
      if (state.chatOpen) renderChatMessages();
    });
    document.getElementById('chat-close')?.addEventListener('click', () => {
      state.chatOpen = false; panel?.classList.remove('open'); toggle.textContent = '💬';
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

  // ════════════════════════════════════════════════════════════
  // CHARTS PAGE
  // ════════════════════════════════════════════════════════════
  function initChartsPage() {
    if (state.chartsInitialized) return;
    state.chartsInitialized = true;

    // If chart data is still empty (no live data yet), show placeholder
    const hasData = Object.values(CrudeRadar.priceHistory).some(h => h?.length > 0);
    if (!hasData) {
      console.info('[charts] No history data yet — charts will render when live data loads');
      return;
    }

    const cfgs = [
      { id:'chart-wti',     label:'WTI Crude',    data:CrudeRadar.priceHistory.wti,     color:'#ff6b00' },
      { id:'chart-brent',   label:'Brent Crude',  data:CrudeRadar.priceHistory.brent,   color:'#ffb300' },
      { id:'chart-dubai',   label:'Dubai Crude',  data:CrudeRadar.priceHistory.dubai,   color:'#00b0ff' },
      { id:'chart-natgas',  label:'Natural Gas',  data:CrudeRadar.priceHistory.natgas,  color:'#00e5ff' },
      { id:'chart-rbob',    label:'RBOB Gasoline',data:CrudeRadar.priceHistory.rbob,    color:'#00e676' },
      { id:'chart-heatoil', label:'Heating Oil',  data:CrudeRadar.priceHistory.heatoil, color:'#ff1744' },
    ];

    cfgs.forEach(cfg => {
      const canvas = document.getElementById(cfg.id);
      if (!canvas || !cfg.data?.length) return;
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
            y: { grid:{color:'rgba(30,45,69,0.4)'}, ticks:{color:'#4a6078',font:{family:'Share Tech Mono',size:10}},                border:{color:'rgba(30,45,69,0.6)'} },
          },
          interaction: { mode:'index', intersect:false },
        },
      });
    });
  }

  // ════════════════════════════════════════════════════════════
  // STATS PAGE
  // ════════════════════════════════════════════════════════════
  function initStatsPage() {
    if (state.statsInitialized) return;
    state.statsInitialized = true;
    const barOpts = {
      responsive:true, maintainAspectRatio:false,
      plugins: { legend:{ labels:{color:'#8899aa',font:{family:'Share Tech Mono',size:10},padding:12,boxWidth:12} }, tooltip:{backgroundColor:'#0e1117',borderColor:'#1e2d45',borderWidth:1,titleColor:'#ff6b00',bodyColor:'#e0e8f0',titleFont:{family:'Share Tech Mono',size:11},bodyFont:{family:'Share Tech Mono',size:12}} },
      scales: { x:{grid:{color:'rgba(30,45,69,0.4)'},ticks:{color:'#4a6078',font:{family:'Share Tech Mono',size:10}},border:{color:'rgba(30,45,69,0.6)'}}, y:{grid:{color:'rgba(30,45,69,0.4)'},ticks:{color:'#4a6078',font:{family:'Share Tech Mono',size:10}},border:{color:'rgba(30,45,69,0.6)'}} },
    };
    const pvs = document.getElementById('chart-prod-vs-cons');
    if (pvs) {
      const d = CrudeRadar.statsData.productionVsConsumption;
      new Chart(pvs.getContext('2d'), { type:'bar', data:{ labels:d.years, datasets:[{label:'Production (Mb/d)',data:d.production,backgroundColor:'rgba(255,107,0,0.7)',borderColor:'#ff6b00',borderWidth:1},{label:'Consumption (Mb/d)',data:d.consumption,backgroundColor:'rgba(0,176,255,0.5)',borderColor:'#00b0ff',borderWidth:1}] }, options:barOpts });
    }
    const opec = document.getElementById('chart-opec-share');
    if (opec) {
      const d = CrudeRadar.statsData.opecVsNonOpec;
      const colors = ['#ff6b00','#ffb300','#ff1744','#00e676','#00b0ff','#9c27b0','#00e5ff','#ff9800','#4caf50','#2196f3','#f44336','#8bc34a','#03a9f4','#cddc39','#607d8b'];
      new Chart(opec.getContext('2d'), { type:'doughnut', data:{ labels:d.labels, datasets:[{data:d.data,backgroundColor:colors,borderColor:'#0a0c0f',borderWidth:2}] }, options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:true,position:'right',labels:{color:'#8899aa',font:{family:'Share Tech Mono',size:10},padding:8,boxWidth:10}}, tooltip:{backgroundColor:'#0e1117',borderColor:'#1e2d45',borderWidth:1,titleColor:'#ff6b00',bodyColor:'#e0e8f0',titleFont:{family:'Share Tech Mono',size:11},bodyFont:{family:'Share Tech Mono',size:12},callbacks:{label:ctx=>' '+ctx.label+': '+ctx.raw+' Mb/d'}} } } });
    }
    const cons = document.getElementById('chart-consumption');
    if (cons) {
      new Chart(cons.getContext('2d'), { type:'bar', data:{ labels:CrudeRadar.consumption.map(c=>c.country), datasets:[{label:'Consumption Mb/d',data:CrudeRadar.consumption.map(c=>c.consumption),backgroundColor:CrudeRadar.consumption.map((_,i)=>i===0?'rgba(255,23,68,0.7)':i===1?'rgba(255,107,0,0.7)':'rgba(0,176,255,0.5)'),borderWidth:1}] }, options:{...barOpts,indexAxis:'y'} });
    }
  }

  // ════════════════════════════════════════════════════════════
  // TELEGRAM FEED
  // ════════════════════════════════════════════════════════════
  function initTelegramFeed() {
    fetchTelegramFeed();
    setInterval(fetchTelegramFeed, 60 * 1000);
  }

  async function fetchTelegramFeed() {
    const messages = await CrudeAPI.fetchTelegramMessages(20);
    if (!messages?.length) {
      setStatusBadge('api-status-telegram', 'demo', 'TELEGRAM ⚙ SETUP');
      return;
    }
    renderTelegramFeed(messages);
    setStatusBadge('api-status-telegram', 'live', 'TELEGRAM LIVE');
    // Inject critical Telegram items into the news ticker
    const critical = messages.filter(m => m.critical).slice(0, 3);
    if (critical.length) updateTickerFromNews(critical.map(m => ({ headline: m.headline, critical: true })));
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
          ${m.critical ? '<span class="tg-tag critical">⚡ BREAKING</span>' : ''}
          <span class="tg-time">${m.time}</span>
        </div>
        <div class="tg-text">${escapeHtml(m.headline)}</div>
        ${m.url ? `<div style="font-family:var(--font-mono);font-size:9px;color:#00b0ff;margin-top:3px">View on Telegram ↗</div>` : ''}
      </div>`).join('');
    // Merge Telegram into news feed sidebar
    state.telegramNews = messages.map(m => ({
      source: `📡 ${m.chatName || 'Telegram'}`, tag: m.tag,
      headline: m.headline, url: m.url, time: m.time, critical: m.critical,
    }));
    const combined = [...state.telegramNews, ...state.liveNews].slice(0, 12);
    renderNewsPanel(combined);
  }

  // ════════════════════════════════════════════════════════════
  // UTILS
  // ════════════════════════════════════════════════════════════
  function escapeHtml(text) {
    if (!text) return '';
    return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

})(); // end IIFE
