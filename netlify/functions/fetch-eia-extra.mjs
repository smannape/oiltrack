// fetch-eia-extra.mjs
// Background function -- fetches 6 new EIA chart datasets
// Writes to Netlify Blob: store='crude-radar', key='eia-extra'
//
// Verified series (live tested March 2026):
//   Crude production STEO  steo COPRPUS         (Mbbl/d monthly)
//   Refinery utilization   petroleum/pnp/wiup WPULEUS3 (% weekly)
//   Refinery net input     petroleum/pnp/wiup WCRRIUS2 (kbd weekly)
//   WTI price forecast     steo WTIPUUS         ($/bbl monthly)
//   Brent price forecast   steo BREPUUS         ($/bbl monthly)
//   Crude exports weekly   petroleum/move/wkly WCREXUS2 (kbd)
//   Crude imports weekly   petroleum/move/wkly WCRIMUS2 (kbd)
//   Electricity gen mix    electricity/electric-power-operational-data (GWh monthly)

import { getStore } from '@netlify/blobs';

const EIA_KEY = process.env.EIA_API_KEY || '';
const BASE    = 'https://api.eia.gov/v2';

function eiaUrl(path, params) {
  const q = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return `${BASE}/${path}?${q}&api_key=${EIA_KEY}`;
}

async function get(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(25000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${url.split('?')[0]}`);
  return r.json();
}

// ── 1. US Crude Production + Forecast (STEO monthly) ─────────
// COPRPUS = US crude oil and lease condensate production (Mbbl/d)
async function fetchCrudeProduction() {
  const j = await get(eiaUrl('steo/data/', {
    frequency: 'monthly',
    'data[0]': 'value',
    'facets[seriesId][]': 'COPRPUS',
    'sort[0][column]': 'period',
    'sort[0][direction]': 'desc',
    length: '48',
  }));
  const today = new Date().toISOString().slice(0, 7);
  const rows = (j.response?.data || [])
    .map(d => ({ period: d.period, value: parseFloat(parseFloat(d.value).toFixed(2)), forecast: d.period > today }))
    .filter(d => !isNaN(d.value))
    .reverse();

  const hist = rows.filter(d => !d.forecast);
  const fcst = rows.filter(d => d.forecast);
  const latest = hist[hist.length - 1] || {};
  const prev   = hist[hist.length - 2] || {};

  return {
    history: hist.slice(-24),
    forecast: fcst.slice(0, 18),
    latest: {
      value: latest.value,
      mom: latest.value && prev.value ? parseFloat((latest.value - prev.value).toFixed(2)) : null,
      period: latest.period,
    },
  };
}

// ── 2. Refinery Utilization (weekly %) ───────────────────────
// WPULEUS3 = US Percent Utilization of Refinery Operable Capacity
// WCRRIUS2 = US Refiner Net Input of Crude Oil (MBBL/D)
async function fetchRefineryUtil() {
  const [pctJ, inputJ] = await Promise.all([
    get(eiaUrl('petroleum/pnp/wiup/data/', {
      frequency: 'weekly', 'data[0]': 'value',
      'facets[series][]': 'WPULEUS3',
      'sort[0][column]': 'period', 'sort[0][direction]': 'desc', length: '130',
    })),
    get(eiaUrl('petroleum/pnp/wiup/data/', {
      frequency: 'weekly', 'data[0]': 'value',
      'facets[series][]': 'WCRRIUS2',
      'sort[0][column]': 'period', 'sort[0][direction]': 'desc', length: '130',
    })),
  ]);

  const pct = (pctJ.response?.data || [])
    .map(d => ({ period: d.period, value: parseFloat(parseFloat(d.value).toFixed(1)) }))
    .filter(d => !isNaN(d.value)).reverse();

  const input = (inputJ.response?.data || [])
    .map(d => ({ period: d.period, value: parseFloat(d.value) }))
    .filter(d => !isNaN(d.value)).reverse();

  // 5-year average for utilization %
  const pctWithAvg = pct.map(d => {
    const mmdd = d.period.slice(5);
    const yr   = parseInt(d.period.slice(0, 4));
    const prior = pct.filter(s => {
      const sYr = parseInt(s.period.slice(0, 4));
      return sYr >= yr - 6 && sYr <= yr - 1 &&
        Math.abs(new Date(s.period) - new Date(`${yr - 1}-${mmdd}`)) / 86400000 <= 7;
    }).slice(0, 5);
    const avg5yr = prior.length >= 3
      ? parseFloat((prior.reduce((s, x) => s + x.value, 0) / prior.length).toFixed(1))
      : null;
    return { ...d, avg5yr };
  });

  const latestPct   = pct[pct.length - 1] || {};
  const prevPct     = pct[pct.length - 2] || {};
  const latestInput = input[input.length - 1] || {};

  return {
    pct: pctWithAvg.slice(-52),
    input: input.slice(-52),
    latest: {
      pct:      latestPct.value,
      pctWoW:   latestPct.value && prevPct.value ? parseFloat((latestPct.value - prevPct.value).toFixed(1)) : null,
      input:    latestInput.value,
      period:   latestPct.period,
    },
  };
}

// ── 3. WTI & Brent Price Forecast (STEO monthly) ─────────────
async function fetchPriceForecast() {
  const today = new Date().toISOString().slice(0, 7);

  const [wtiJ, brtJ] = await Promise.all([
    get(eiaUrl('steo/data/', {
      frequency: 'monthly', 'data[0]': 'value',
      'facets[seriesId][]': 'WTIPUUS',
      'sort[0][column]': 'period', 'sort[0][direction]': 'desc', length: '48',
    })),
    get(eiaUrl('steo/data/', {
      frequency: 'monthly', 'data[0]': 'value',
      'facets[seriesId][]': 'BREPUUS',
      'sort[0][column]': 'period', 'sort[0][direction]': 'desc', length: '48',
    })),
  ]);

  const toSeries = j => (j.response?.data || [])
    .map(d => ({ period: d.period, value: parseFloat(parseFloat(d.value).toFixed(2)), forecast: d.period > today }))
    .filter(d => !isNaN(d.value)).reverse();

  const wti = toSeries(wtiJ);
  const brt = toSeries(brtJ);

  const wtiHist = wti.filter(d => !d.forecast).slice(-24);
  const brtHist = brt.filter(d => !d.forecast).slice(-24);
  const wtiFcst = wti.filter(d => d.forecast).slice(0, 18);
  const brtFcst = brt.filter(d => d.forecast).slice(0, 18);

  const latestWTI = wtiHist[wtiHist.length - 1] || {};
  const latestBRT = brtHist[brtHist.length - 1] || {};
  const fcstWTI   = wtiFcst.length ? wtiFcst.reduce((s, d) => s + d.value, 0) / wtiFcst.length : null;
  const fcstBRT   = brtFcst.length ? brtFcst.reduce((s, d) => s + d.value, 0) / brtFcst.length : null;

  return {
    wtiHistory: wtiHist,
    brtHistory: brtHist,
    wtiForecast: wtiFcst,
    brtForecast: brtFcst,
    latest: {
      wti: latestWTI.value,
      brt: latestBRT.value,
      spread: latestWTI.value && latestBRT.value
        ? parseFloat((latestBRT.value - latestWTI.value).toFixed(2)) : null,
      wtiAvgFcst: fcstWTI ? parseFloat(fcstWTI.toFixed(2)) : null,
      brtAvgFcst: fcstBRT ? parseFloat(fcstBRT.toFixed(2)) : null,
      period: latestWTI.period,
    },
  };
}

// ── 4. Crude Trade Balance (weekly exports & imports) ─────────
// WCREXUS2 = US Crude Exports (kbd)
// WCRIMUS2 = US Crude Imports (kbd)
async function fetchTradeBalance() {
  const [expJ, impJ] = await Promise.all([
    get(eiaUrl('petroleum/move/wkly/data/', {
      frequency: 'weekly', 'data[0]': 'value',
      'facets[series][]': 'WCREXUS2',
      'sort[0][column]': 'period', 'sort[0][direction]': 'desc', length: '104',
    })),
    get(eiaUrl('petroleum/move/wkly/data/', {
      frequency: 'weekly', 'data[0]': 'value',
      'facets[series][]': 'WCRIMUS2',
      'sort[0][column]': 'period', 'sort[0][direction]': 'desc', length: '104',
    })),
  ]);

  const exports_ = (expJ.response?.data || [])
    .map(d => ({ period: d.period, value: parseFloat(d.value) }))
    .filter(d => !isNaN(d.value)).reverse();

  const imports_ = (impJ.response?.data || [])
    .map(d => ({ period: d.period, value: parseFloat(d.value) }))
    .filter(d => !isNaN(d.value)).reverse();

  // Build combined series with balance
  const combined = exports_.map(e => {
    const imp = imports_.find(i => i.period === e.period);
    const balance = imp ? parseFloat((e.value - imp.value).toFixed(0)) : null;
    return { period: e.period, exports: e.value, imports: imp?.value || null, balance };
  }).filter(d => d.imports !== null);

  const latest = combined[combined.length - 1] || {};

  return {
    series: combined.slice(-52),
    latest: {
      exports: latest.exports,
      imports: latest.imports,
      balance: latest.balance,
      period:  latest.period,
    },
  };
}

// ── 5. Electricity Generation Mix (monthly GWh by fuel) ───────
// fuel types: ALL, COW(coal), NG(gas), NUC(nuclear), AOR(all renewables)
//             SUN(utility solar), WND(wind), WAT(hydro)
// sector 99 = all sectors combined
async function fetchElectricityMix() {
  const fuels = ['COW', 'NG', 'NUC', 'AOR', 'SUN', 'WND', 'WAT', 'ALL'];
  const params = {
    frequency: 'monthly', 'data[0]': 'generation',
    'facets[location][]': 'US', 'facets[sectorid][]': '99',
    'sort[0][column]': 'period', 'sort[0][direction]': 'desc', length: '500',
  };
  fuels.forEach((f, i) => { params[`facets[fueltypeid][${i}]`] = f; });

  const j = await get(eiaUrl('electricity/electric-power-operational-data/data/', params));
  const rows = j.response?.data || [];

  // Group by period, then by fuel
  const byPeriod = {};
  for (const r of rows) {
    const p    = r.period;
    const fuel = r.fueltypeid;
    const v    = parseFloat(r.generation);
    if (!byPeriod[p]) byPeriod[p] = {};
    byPeriod[p][fuel] = (byPeriod[p][fuel] || 0) + v;
  }

  const periods = Object.keys(byPeriod).sort().slice(-24);
  const series  = {
    coal:  periods.map(p => ({ period: p, value: Math.round((byPeriod[p]?.COW || 0) / 1000) })),
    gas:   periods.map(p => ({ period: p, value: Math.round((byPeriod[p]?.NG  || 0) / 1000) })),
    nuclear: periods.map(p => ({ period: p, value: Math.round((byPeriod[p]?.NUC || 0) / 1000) })),
    renewables: periods.map(p => ({ period: p, value: Math.round((byPeriod[p]?.AOR || 0) / 1000) })),
    wind:  periods.map(p => ({ period: p, value: Math.round((byPeriod[p]?.WND || 0) / 1000) })),
    solar: periods.map(p => ({ period: p, value: Math.round((byPeriod[p]?.SUN || 0) / 1000) })),
    hydro: periods.map(p => ({ period: p, value: Math.round((byPeriod[p]?.WAT || 0) / 1000) })),
    total: periods.map(p => ({ period: p, value: Math.round((byPeriod[p]?.ALL || 0) / 1000) })),
  };

  // Latest month breakdown (% share)
  const latest = periods[periods.length - 1] || '';
  const latestData = byPeriod[latest] || {};
  const tot = latestData.ALL || 1;
  const pct = f => parseFloat(((latestData[f] || 0) / tot * 100).toFixed(1));

  return {
    periods,
    series,
    latest: {
      period: latest,
      total:  Math.round(tot / 1000),
      gasShare:        pct('NG'),
      coalShare:       pct('COW'),
      nuclearShare:    pct('NUC'),
      renewablesShare: pct('AOR'),
      windShare:       pct('WND'),
      solarShare:      pct('SUN'),
      hydroShare:      pct('WAT'),
    },
  };
}

// ── MAIN ──────────────────────────────────────────────────────
export default async function handler(req, context) {
  if (!EIA_KEY) {
    return new Response(JSON.stringify({ error: 'EIA_API_KEY not set' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  const t0     = Date.now();
  const errors = [];
  let crudeProduction = {}, refineryUtil = {}, priceForecast = {},
      tradeBalance = {}, electricityMix = {};

  try { crudeProduction = await fetchCrudeProduction(); } catch (e) { errors.push('crudeProduction: ' + e.message); }
  try { refineryUtil    = await fetchRefineryUtil();    } catch (e) { errors.push('refineryUtil: '    + e.message); }
  try { priceForecast   = await fetchPriceForecast();   } catch (e) { errors.push('priceForecast: '   + e.message); }
  try { tradeBalance    = await fetchTradeBalance();    } catch (e) { errors.push('tradeBalance: '    + e.message); }
  try { electricityMix  = await fetchElectricityMix();  } catch (e) { errors.push('electricityMix: '  + e.message); }

  const payload = {
    fetchedAt: new Date().toISOString(),
    durationMs: Date.now() - t0,
    errors,
    crudeProduction,
    refineryUtil,
    priceForecast,
    tradeBalance,
    electricityMix,
  };

  try {
    const store = getStore('crude-radar');
    await store.set('eia-extra', JSON.stringify(payload));
    console.log('[fetch-eia-extra] OK ' + (Date.now() - t0) + 'ms errors:' + errors.length);
    if (errors.length) console.error('[fetch-eia-extra]', errors);
  } catch (e) {
    console.error('[fetch-eia-extra] blob error:', e.message);
    errors.push('blobWrite: ' + e.message);
  }

  return new Response(JSON.stringify({ ok: true, errors, durationMs: Date.now() - t0 }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
}
