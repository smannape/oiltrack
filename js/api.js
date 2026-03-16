// ============================================================
// CRUDE RADAR — js/api.js
//
// Reads from Netlify Blob endpoints served by get-oil-data.mjs.
// All functions return null on error — app.js falls back gracefully.
//
// Endpoints (netlify.toml redirects):
//   /api/oil-prices   → prices blob
//   /api/oil-news     → news blob
//   /api/oil-eia      → EIA blob
//   /api/oil-tankers  → tankers blob
//   /api/oil-meta     → meta/status blob
//   POST /api/oil-refresh → triggers background refresh
//   /api/oil-telegram → Telegram messages
// ============================================================

window.CrudeAPI = (function () {
  'use strict';

  // ── FETCH HELPER ───────────────────────────────────────────
  async function getBlob(path, timeoutMs = 8000) {
    try {
      const res = await fetch(path, { signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data?.status === 'error' || data?.status === 'initializing') return null;
      return data;
    } catch (e) {
      console.info(`[CrudeAPI] ${path} unavailable:`, e.message);
      return null;
    }
  }

  // ── BLOB FETCHERS ──────────────────────────────────────────

  async function fetchCachedPrices()  { return getBlob('/api/oil-prices');  }
  async function fetchCachedNews()    { return getBlob('/api/oil-news');    }
  async function fetchCachedEIA()     { return getBlob('/api/oil-eia');     }
  async function fetchMeta()          { return getBlob('/api/oil-meta');    }

  async function fetchCachedTankers() {
    const data = await getBlob('/api/oil-tankers');
    return data?.tankers?.length ? data.tankers : null;
  }

  async function triggerRefresh() {
    try {
      const res = await fetch('/api/oil-refresh', { method: 'POST' });
      return await res.json();
    } catch (e) { return { error: e.message }; }
  }

  // ── FX RATES (ExchangeRate-API — free, no key) ─────────────
  async function fetchFX() {
    try {
      const res = await fetch('https://open.er-api.com/v6/latest/USD', {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data?.rates || null;
    } catch (e) {
      console.info('[CrudeAPI] FX rates unavailable:', e.message);
      return null;
    }
  }

  // ── PARSERS ────────────────────────────────────────────────

  /**
   * parsePriceCache
   *
   * Converts prices blob into the flat shape applyLivePrices() expects.
   *
   * Blob shape (written by background function):
   *   { fetchedAt, prices: {
   *       wti:      { id, name, unit, exchange, flag, latest:{price,timestamp}, history:[{period,value}], change, changePct },
   *       brent:    { ... },
   *       dubai:    { ... },
   *       crude_ng: { ... },
   *       hho:      { ... },
   *       rbob:     { ... },
   *   }}
   *
   * Output:
   *   { wti, brent, dubai, natgas, rbob, heatoil }
   *   each: { price, change, changePct, history:[{period,value}], source, name }
   *   or null if no price for that contract.
   */
  function parsePriceCache(blob) {
    const p = blob?.prices;
    if (!p) return null;

    function extract(id) {
      const entry = p[id];
      if (!entry) return null;
      // OilPriceAPI stores price as entry.latest.price
      // EIA fallback stores price as entry.latest.value
      const price = parseFloat(entry.latest?.price ?? entry.latest?.value ?? 0);
      if (!price || isNaN(price) || price <= 0) return null;
      const history = (entry.history || [])
        .map(h => ({ period: h.period || '', value: parseFloat(h.value ?? h.price ?? 0) }))
        .filter(h => h.value > 0 && h.period);
      return {
        price,
        change:    entry.change    ?? null,
        changePct: entry.changePct ?? null,
        history,
        source:    entry.exchange  || 'OilPriceAPI',
        name:      entry.name      || id,
      };
    }

    const result = {
      wti:     extract('wti'),
      brent:   extract('brent'),
      dubai:   extract('dubai'),
      natgas:  extract('crude_ng'),  // contract id is crude_ng, mapped to natgas key
      rbob:    extract('rbob'),
      heatoil: extract('hho'),       // contract id is hho, mapped to heatoil key
    };

    return Object.values(result).some(v => v !== null) ? result : null;
  }

  /**
   * parseEIACache
   *
   * Converts EIA blob into the flat shape applyEIACache() expects.
   */
  function parseEIACache(blob) {
    const e = blob?.eia;
    if (!e) return null;
    return {
      stocksLatest:         e.us_crude_stocks?.latest?.value    || null,
      stocksChange:         e.us_crude_stocks?.latest?.change   || null,
      stocksPeriod:         e.us_crude_stocks?.latest?.period   || null,
      wtiMonthly:           e.wti_spot_monthly?.series           || null,
      wtiLatest:            e.wti_spot_monthly?.latest           || null,
      brentMonthly:         e.brent_spot_monthly?.series         || null,
      brentLatest:          e.brent_spot_monthly?.latest         || null,
      usProductionLatest:   e.us_field_production?.latest        || null,
      opecProductionLatest: e.opec_production?.latest            || null,
      cacheAgeSeconds:      blob.cacheAgeSeconds                 || null,
      fetchedAt:            blob.fetchedAt                       || null,
    };
  }

  /**
   * parseNewsCache
   *
   * Converts news blob into an array of normalised news items.
   */
  function parseNewsCache(blob) {
    if (!blob?.news?.length) return [];
    return blob.news
      .map(n => ({
        source:      n.source      || 'News',
        tag:         n.tag         || 'NEWS',
        headline:    n.headline    || '',
        url:         n.url         || '',
        time:        n.time        || '',
        pubDate:     n.pubDate     || '',
        critical:    Boolean(n.critical),
        description: n.description || '',
      }))
      .filter(n => n.headline.length > 5);
  }

  // ── TELEGRAM ──────────────────────────────────────────────

  async function fetchTelegramMessages(limit = 20) {
    const data = await getBlob('/api/oil-telegram');
    return data?.messages?.length ? data.messages.slice(0, limit) : null;
  }

  async function registerTelegramWebhook() {
    try {
      const res = await fetch('/api/telegram-register', { method: 'POST' });
      return await res.json();
    } catch (e) { return { error: e.message }; }
  }

  // ── PUBLIC ─────────────────────────────────────────────────
  return {
    fetchCachedPrices,
    fetchCachedNews,
    fetchCachedEIA,
    fetchCachedTankers,
    fetchMeta,
    triggerRefresh,
    fetchFX,
    parsePriceCache,
    parseEIACache,
    parseNewsCache,
    fetchTelegramMessages,
    registerTelegramWebhook,
  };

})();
