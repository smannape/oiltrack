// fetch-eia-data.mjs
// EIA API v2 -- all series IDs verified live against api.eia.gov
//
// Series confirmed working:
//   Crude stocks weekly : petroleum/stoc/wstk  EPC0/NUS/SAE  (MBBL)
//   Crude imports total : petroleum/move/wkly  series=WCRIMUS2 (MBBD)
//   Crude imports ctry  : crude-oil-imports/data  (monthly, grouped by originName)
//   Gas production      : natural-gas/prod/sum  EPG0/NUS/FPD  (MMcf -> Bcf)
//   Gas consumption     : natural-gas/cons/sum  EPG0/NUS/VGT  (MMcf -> Bcf)
//   Gas storage weekly  : natural-gas/stor/wkly  EPG0/R48/SWO (Bcf)
//   US crude inv STEO   : steo  seriesId=COSXPUS  (Mbbl monthly, excl SPR)
//   US SPR STEO         : steo  seriesId=COSQPUS  (Mbbl monthly)

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
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${url.split('?')[0]}`);
  return r.json();
}

// ── 1. US CRUDE STOCKS weekly (MBBL) ─────────────────────────
// petroleum/stoc/wstk -- product=EPC0, duoarea=NUS, process=SAE
async function fetchCrudeStocks() {
  const j = await get(eiaUrl('petroleum/stoc/wstk/data/', {
    frequency: 'weekly',
    'data[0]': 'value',
    'facets[product][]': 'EPC0',
    'facets[duoarea][]': 'NUS',
    'facets[process][]': 'SAE',
    'sort[0][column]': 'period',
    'sort[0][direction]': 'desc',
    length: '130',
  }));
  return (j.response?.data || [])
    .map(d => ({ period: d.period, value: parseFloat(d.value) }))
    .filter(d => !isNaN(d.value))
    .reverse();
}

// ── 2a. CRUDE IMPORTS total weekly (kbd) ─────────────────────
// series=WCRIMUS2 -- US Imports of Crude Oil (Thousand Barrels per Day)
async function fetchCrudeImportsWeekly() {
  const j = await get(eiaUrl('petroleum/move/wkly/data/', {
    frequency: 'weekly',
    'data[0]': 'value',
    'facets[series][]': 'WCRIMUS2',
    'sort[0][column]': 'period',
    'sort[0][direction]': 'desc',
    length: '52',
  }));
  return (j.response?.data || [])
    .map(d => ({ period: d.period, value: parseFloat(d.value) }))
    .filter(d => !isNaN(d.value))
    .reverse();
}

// ── 2b. CRUDE IMPORTS by country (monthly, latest available) ──
// crude-oil-imports/data -- returns all rows for latest period
async function fetchCrudeImportsByCountry() {
  const j = await get(eiaUrl('crude-oil-imports/data/', {
    frequency: 'monthly',
    'data[0]': 'quantity',
    'sort[0][column]': 'period',
    'sort[0][direction]': 'desc',
    length: '2000',
  }));
  const rows = j.response?.data || [];

  // Group by period, then by country
  const byPeriod = {};
  for (const r of rows) {
    const p = r.period;
    const country = r.originName || r['origin-name'] || 'Unknown';
    const qty = parseFloat(r.quantity) || 0;
    if (!byPeriod[p]) byPeriod[p] = {};
    byPeriod[p][country] = (byPeriod[p][country] || 0) + qty;
  }

  // Use all available periods (may be just 1-2 months due to API lag)
  const periods = Object.keys(byPeriod).sort();
  if (!periods.length) return { periods: [], series: [] };

  // Top countries by total volume
  const totals = {};
  for (const p of periods) {
    for (const [c, v] of Object.entries(byPeriod[p])) {
      totals[c] = (totals[c] || 0) + v;
    }
  }
  const top = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([c]) => c);

  const series = top.map(country => ({
    country,
    data: periods.map(p => ({
      period: p,
      value: Math.round((byPeriod[p]?.[country] || 0) / 1000), // thousands bbl -> Mbbl approx
    })),
  }));

  return { periods, series };
}

// ── 3. NATURAL GAS prod / cons / storage ─────────────────────
async function fetchNaturalGas() {
  const [prodJ, consJ, storJ] = await Promise.all([
    // Dry natural gas production (MMcf) -- EPG0/NUS/FPD
    get(eiaUrl('natural-gas/prod/sum/data/', {
      frequency: 'monthly', 'data[0]': 'value',
      'facets[duoarea][]': 'NUS', 'facets[process][]': 'FPD',
      'sort[0][column]': 'period', 'sort[0][direction]': 'desc', length: '36',
    })),
    // Total delivered to consumers (MMcf) -- EPG0/NUS/VGT
    get(eiaUrl('natural-gas/cons/sum/data/', {
      frequency: 'monthly', 'data[0]': 'value',
      'facets[duoarea][]': 'NUS', 'facets[process][]': 'VGT',
      'sort[0][column]': 'period', 'sort[0][direction]': 'desc', length: '36',
    })),
    // Working gas in storage (Bcf) -- EPG0/R48/SWO (Lower 48 states)
    get(eiaUrl('natural-gas/stor/wkly/data/', {
      frequency: 'weekly', 'data[0]': 'value',
      'facets[duoarea][]': 'R48', 'facets[process][]': 'SWO',
      'sort[0][column]': 'period', 'sort[0][direction]': 'desc', length: '312',
    })),
  ]);

  const prod = (prodJ.response?.data || [])
    .map(d => ({ period: d.period, value: d.value ? parseFloat((parseFloat(d.value) / 1000).toFixed(1)) : null }))
    .filter(d => d.value !== null).reverse();

  const cons = (consJ.response?.data || [])
    .map(d => ({ period: d.period, value: d.value ? parseFloat((parseFloat(d.value) / 1000).toFixed(1)) : null }))
    .filter(d => d.value !== null).reverse();

  // Storage: all rows descending for 5yr avg calculation
  const storAll = (storJ.response?.data || [])
    .map(d => ({ period: d.period, value: parseFloat(d.value) }))
    .filter(d => !isNaN(d.value)).reverse();

  // Compute 5yr avg: for each week, find same calendar week in prior 5 years
  const storWithAvg = storAll.map((d, i) => {
    // Match same month-day (MM-DD) in earlier years
    const mmdd = d.period.slice(5);
    const yr   = parseInt(d.period.slice(0, 4));
    const prior = storAll.filter(s => {
      const sYr   = parseInt(s.period.slice(0, 4));
      const sMmdd = s.period.slice(5);
      return sYr >= yr - 6 && sYr <= yr - 1 && Math.abs(
        (new Date(s.period) - new Date(yr - 1 + '-' + mmdd)) / 86400000
      ) <= 7;
    }).slice(0, 5);
    const avg5yr = prior.length >= 3
      ? Math.round(prior.reduce((s, x) => s + x.value, 0) / prior.length)
      : null;
    return { ...d, avg5yr };
  });

  const latest = storWithAvg[storWithAvg.length - 1] || {};
  const prev   = storWithAvg[storWithAvg.length - 2] || {};

  return {
    prod: prod.slice(-24),
    cons: cons.slice(-24),
    stor: storWithAvg.slice(-52),
    latest: {
      prod:       prod[prod.length - 1]?.value ?? null,
      cons:       cons[cons.length - 1]?.value ?? null,
      stor:       latest.value ?? null,
      storWoW:    (latest.value && prev.value)
                    ? parseFloat((latest.value - prev.value).toFixed(1)) : null,
      prodPeriod: prod[prod.length - 1]?.period,
      storPeriod: latest.period,
    },
  };
}

// ── 4. US CRUDE INVENTORY STEO (monthly Mbbl, excl SPR) ──────
// COSXPUS = US crude oil inventory excl SPR (million barrels, EOP)
// COSQPUS = Strategic Petroleum Reserve (million barrels, EOP)
async function fetchUSInventorySTEO() {
  const [comJ, sprJ] = await Promise.all([
    get(eiaUrl('steo/data/', {
      frequency: 'monthly', 'data[0]': 'value',
      'facets[seriesId][]': 'COSXPUS',
      'sort[0][column]': 'period', 'sort[0][direction]': 'desc', length: '60',
    })),
    get(eiaUrl('steo/data/', {
      frequency: 'monthly', 'data[0]': 'value',
      'facets[seriesId][]': 'COSQPUS',
      'sort[0][column]': 'period', 'sort[0][direction]': 'desc', length: '60',
    })),
  ]);

  const toSeries = j => (j.response?.data || [])
    .map(d => ({ period: d.period, value: parseFloat(parseFloat(d.value).toFixed(1)) }))
    .filter(d => !isNaN(d.value)).reverse();

  const com = toSeries(comJ);
  const spr = toSeries(sprJ);

  // Add MoM and 5yr average
  const withMeta = com.map((d, i) => {
    const mom = i > 0 ? parseFloat((d.value - com[i-1].value).toFixed(1)) : null;
    const month = d.period.slice(5);
    const yr = parseInt(d.period.slice(0, 4));
    const sameMonths = com.filter(s =>
      s.period.slice(5) === month && parseInt(s.period.slice(0, 4)) < yr
    ).slice(-5);
    const avg5yr = sameMonths.length >= 3
      ? parseFloat((sameMonths.reduce((s, x) => s + x.value, 0) / sameMonths.length).toFixed(1))
      : null;
    const sprRow = spr.find(s => s.period === d.period);
    return {
      ...d,
      spr: sprRow?.value ?? null,
      mom,
      avg5yr,
      overhang: avg5yr != null ? parseFloat((d.value - avg5yr).toFixed(1)) : null,
    };
  });

  // Only use actual historical data (not forecasts -- STEO goes into future)
  const today = new Date().toISOString().slice(0, 7);
  const historical = withMeta.filter(d => d.period <= today);
  const latest = historical[historical.length - 1] || {};

  return {
    series:  historical.slice(-24),
    latest: {
      value:    latest.value,
      spr:      latest.spr,
      total:    latest.value && latest.spr ? parseFloat((latest.value + latest.spr).toFixed(1)) : null,
      mom:      latest.mom,
      avg5yr:   latest.avg5yr,
      overhang: latest.overhang,
      period:   latest.period,
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

  const t0 = Date.now();
  const errors = [];
  let crudeStocks = [], importsWeekly = [], crudeImports = {},
      naturalGas = {}, usInventory = {};

  try { crudeStocks    = await fetchCrudeStocks();          } catch (e) { errors.push('crudeStocks: '   + e.message); }
  try { importsWeekly  = await fetchCrudeImportsWeekly();   } catch (e) { errors.push('importsWkly: '  + e.message); }
  try { crudeImports   = await fetchCrudeImportsByCountry(); } catch (e) { errors.push('importsCtry: '  + e.message); }
  try { naturalGas     = await fetchNaturalGas();           } catch (e) { errors.push('naturalGas: '   + e.message); }
  try { usInventory    = await fetchUSInventorySTEO();      } catch (e) { errors.push('usInventory: '  + e.message); }

  // Inventory MoM from weekly stocks
  const invMoM = [];
  if (crudeStocks.length > 4) {
    const monthly = {};
    for (const d of crudeStocks) {
      const ym = d.period.slice(0, 7);
      if (!monthly[ym] || d.period > monthly[ym].period) monthly[ym] = d;
    }
    const months = Object.keys(monthly).sort().slice(-14);
    for (let i = 1; i < months.length; i++) {
      const cur = monthly[months[i]], prv = monthly[months[i-1]];
      invMoM.push({
        period: months[i], value: cur.value,
        mom: parseFloat((cur.value - prv.value).toFixed(1)),
      });
    }
  }

  // Dashboard widget: use latest weekly crude stocks
  const latestW = crudeStocks[crudeStocks.length - 1] || {};
  const prevW   = crudeStocks[crudeStocks.length - 2] || {};
  const yoyW    = crudeStocks.length >= 52 ? crudeStocks[crudeStocks.length - 52] : null;

  const payload = {
    fetchedAt:  new Date().toISOString(),
    durationMs: Date.now() - t0,
    errors,
    inventory: {
      latest: latestW.value ?? null,
      period: latestW.period ?? null,
      wow:    (latestW.value && prevW.value)
                ? parseFloat((latestW.value - prevW.value).toFixed(1)) : null,
      yoy:    (latestW.value && yoyW?.value)
                ? parseFloat((latestW.value - yoyW.value).toFixed(1)) : null,
    },
    crudeStocks,
    invMoM,
    importsWeekly,
    crudeImports,
    naturalGas,
    // Chart 4: renamed from oecdStocks to usInventory
    oecdStocks: usInventory,
  };

  try {
    const store = getStore('crude-radar');
    await store.set('eia-charts', JSON.stringify(payload));
    console.log('[fetch-eia-data] OK ' + (Date.now()-t0) + 'ms errors:' + errors.length);
    if (errors.length) console.error('[fetch-eia-data]', errors);
  } catch (e) {
    errors.push('blobWrite: ' + e.message);
    console.error('[fetch-eia-data] blob error:', e.message);
  }

  return new Response(JSON.stringify({ ok: true, errors, durationMs: Date.now()-t0 }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
}
