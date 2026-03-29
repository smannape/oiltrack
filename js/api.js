// ============================================================
// CRUDE RADAR -- js/api.js  v3
// ============================================================

window.CrudeAPI = (function () {
  'use strict';

  // ── FETCH HELPER ───────────────────────────────────────────
  async function getBlob(path, timeoutMs = 8000) {
    try {
      const res = await fetch(path, { signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) throw new Error('Not JSON -- got HTML page');
      const data = await res.json();
      if (data?.status === 'error' || data?.status === 'initializing') return null;
      return data;
    } catch (e) {
      console.info(`[CrudeAPI] ${path} unavailable:`, e.message);
      return null;
    }
  }

  // ── BLOB FETCHERS ──────────────────────────────────────────

  async function fetchCachedPrices() {
    const data = await getBlob('/api/oil-prices');
    if (data) {
      const keys = Object.keys(data.prices || {});
      console.log(`[CrudeAPI] prices blob: ${keys.length} contracts -- ${keys.join(', ')}`);
      console.log(`[CrudeAPI] WTI from blob: $${data.prices?.wti?.latest?.price}`);
    }
    return data;
  }

  async function fetchCachedNews()    { return getBlob('/api/oil-news');    }
  async function fetchCachedEIA()     { return getBlob('/api/oil-eia');     }
  async function fetchMeta()          { return getBlob('/api/oil-meta');    }

  async function fetchCachedTankers() {
    const data = await getBlob('/api/oil-tankers');
    if (!data?.tankers?.length) return null;
    const ageMs = data.fetchedAt
      ? Date.now() - new Date(data.fetchedAt).getTime()
      : 0;
    const isStale = ageMs > 3 * 60 * 60 * 1000; // 3 hours
    // Attach metadata to array so app.js can check staleness
    const tankers = data.tankers.map(function(t) {
      return Object.assign({}, t, { stale: isStale || t.stale || false });
    });
    tankers._fetchedAt  = data.fetchedAt;
    tankers._blobAgeMs  = ageMs;
    tankers._liveCount  = data.live_count || tankers.length;
    return tankers;
  }

  async function triggerRefresh() {
    try {
      const res = await fetch('/api/oil-refresh', { method: 'POST' });
      return await res.json();
    } catch (e) { return { error: e.message }; }
  }

  // ── FX RATES ───────────────────────────────────────────────
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
   * Blob shape (written by background function):
   *   { fetchedAt, prices: {
   *       wti, brent, dubai, crude_ng, hho, rbob,   <- OilPriceAPI live
   *       opec, urals, wcs, lco, bonny, espo         <- derived server-side
   *   }}
   *
   * Each entry: { latest:{price,timestamp}, history:[{period,value}], change, changePct }
   *
   * Output keys used by applyLivePrices() in app.js:
   *   wti, brent, dubai, natgas, rbob, heatoil, opec, urals, wcs, lco, bonny, espo
   */
  function parsePriceCache(blob) {
    const p = blob?.prices;
    if (!p) return null;

    function extract(id) {
      const entry = p[id];
      if (!entry) return null;
      // OilPriceAPI: latest.price  |  EIA fallback: latest.value
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
      // ── Live from OilPriceAPI ──────────────────────────────
      wti:     extract('wti'),
      brent:   extract('brent'),
      dubai:   extract('dubai'),
      natgas:  extract('crude_ng'),   // blob key crude_ng -> app key natgas
      rbob:    extract('rbob'),
      heatoil: extract('hho'),        // blob key hho -> app key heatoil
      // ── Derived server-side from benchmarks ───────────────
      opec:    extract('opec'),
      urals:   extract('urals'),
      wcs:     extract('wcs'),
      lco:     extract('lco'),
      bonny:   extract('bonny'),
      espo:    extract('espo'),
    };

    const found = Object.entries(result).filter(([,v]) => v !== null).map(([k]) => k);
    console.log(`[CrudeAPI] parsePriceCache: ${found.length} contracts parsed -- ${found.join(', ')}`);

    return found.length > 0 ? result : null;
  }

  /**
   * parseEIACache
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
    try {
      const res = await fetch('/api/oil-telegram', { signal: AbortSignal.timeout(5000) });
      if (!res.ok) return null;
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('application/json')) return null;
      const data = await res.json();
      return data?.messages?.length ? data.messages.slice(0, limit) : null;
    } catch { return null; }
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
