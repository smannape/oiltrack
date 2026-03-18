// ============================================================
// netlify/functions/fetch-eia-data.mjs
// Background function -- fetches all EIA chart datasets
// Writes to Netlify Blob: store='crude-radar', key='eia-charts'
//
// EIA v2 correct paths (verified live against api.eia.gov):
//   Crude stocks  -- petroleum/stoc/wstk/data/  EPC0 NUS SAE (MBBL weekly)
//   Crude imports -- crude-oil-imports/data/               (monthly by country)
//   Gas prod      -- natural-gas/prod/sum/data/  EPG0 NUS FPD (MMcf monthly)
//   Gas cons      -- natural-gas/cons/sum/data/  EPG0 NUS VGT (MMcf monthly)
//   Gas storage   -- natural-gas/stor/wkly/data/ EPG0 R48 SWO (Bcf weekly)
//   OECD stocks   -- steo/data/ COSWPRS                    (Mbbl monthly)
// ============================================================

import { getStore } from '@netlify/blobs';

const EIA_KEY = process.env.EIA_API_KEY || '';
const BASE    = 'https://api.eia.gov/v2';

function eia(path, params) {
  const qstring = Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
  return `${BASE}/${path}?${qstring}&api_key=${EIA_KEY}`;
}

async function fetchJSON(url) {
  const r = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error(`EIA HTTP ${r.status} for ${url.split('?')[0]}`);
  return r.json();
}

// ?? 1. US CRUDE STOCKS (weekly, 2 years) ?????????????????????
// Product=EPC0 (crude oil), duoarea=NUS (US total), process=SAE (ending stocks excl SPR)
async function fetchCrudeStocks() {
  const url = eia('petroleum/stoc/wstk/data/', {
    frequency: 'weekly',
    'data[0]': 'value',
    'facets[product][]': 'EPC0',
    'facets[duoarea][]': 'NUS',
    'facets[process][]': 'SAE',
    'sort[0][column]': 'period',
    'sort[0][direction]': 'desc',
    length: '104',
  });
  const j = await fetchJSON(url);
  return (j.response?.data || [])
    .map(d => ({ period: d.period, value: parseFloat(d.value), unit: 'MBBL' }))
    .filter(d => !isNaN(d.value))
    .reverse();
}

// ?? 2. CRUDE IMPORTS BY COUNTRY (monthly, latest 13 months) ??
async function fetchCrudeImports() {
  const url = eia('crude-oil-imports/data/', {
    frequency: 'monthly',
    'data[0]': 'quantity',
    'sort[0][column]': 'period',
    'sort[0][direction]': 'desc',
    length: '500',
  });
  const j = await fetchJSON(url);
  const rows = j.response?.data || [];

  const byPeriod = {};
  for (const r of rows) {
    const p = r.period;
    const country = r.originName || r['originName'] || r['origin-name'] || 'Unknown';
    const qty = parseFloat(r.quantity) || 0;
    if (!byPeriod[p]) byPeriod[p] = {};
    byPeriod[p][country] = (byPeriod[p][country] || 0) + qty;
  }

  const periods = Object.keys(byPeriod).sort().slice(-13);
  const countryTotals = {};
  for (const p of periods) {
    for (const [c, v] of Object.entries(byPeriod[p])) {
      countryTotals[c] = (countryTotals[c] || 0) + v;
    }
  }
  const topCountries = Object.entries(countryTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([c]) => c);

  const series = topCountries.map(country => ({
    country,
    data: periods.map(p => ({
      period: p,
      value: Math.round((byPeriod[p]?.[country] || 0) / 1000),
    })),
  }));

  return { periods, series };
}

// ?? 3. NATURAL GAS ????????????????????????????????????????????
async function fetchNaturalGas() {
  const [prodJ, consJ, storJ] = await Promise.all([
    // Dry gas production (MMcf) -- process=FPD, duoarea=NUS
    fetchJSON(eia('natural-gas/prod/sum/data/', {
      frequency: 'monthly',
      'data[0]': 'value',
      'facets[duoarea][]': 'NUS',
      'facets[process][]': 'FPD',
      'sort[0][column]': 'period',
      'sort[0][direction]': 'desc',
      length: '36',
    })),
    // Total delivered to consumers (MMcf) -- process=VGT, duoarea=NUS
    fetchJSON(eia('natural-gas/cons/sum/data/', {
      frequency: 'monthly',
      'data[0]': 'value',
      'facets[duoarea][]': 'NUS',
      'facets[process][]': 'VGT',
      'sort[0][column]': 'period',
      'sort[0][direction]': 'desc',
      length: '36',
    })),
    // Working gas in storage (Bcf) -- duoarea=R48 (Lower 48), process=SWO
    fetchJSON(eia('natural-gas/stor/wkly/data/', {
      frequency: 'weekly',
      'data[0]': 'value',
      'facets[duoarea][]': 'R48',
      'facets[process][]': 'SWO',
      'sort[0][column]': 'period',
      'sort[0][direction]': 'desc',
      length: '260',
    })),
  ]);

  // Convert MMcf to Bcf for display
  const prod = (prodJ.response?.data || [])
    .map(d => ({ period: d.period, value: d.value ? parseFloat((parseFloat(d.value) / 1000).toFixed(1)) : null }))
    .filter(d => d.value !== null)
    .reverse();

  const cons = (consJ.response?.data || [])
    .map(d => ({ period: d.period, value: d.value ? parseFloat((parseFloat(d.value) / 1000).toFixed(1)) : null }))
    .filter(d => d.value !== null)
    .reverse();

  const stor = (storJ.response?.data || [])
    .map(d => ({ period: d.period, value: parseFloat(d.value) }))
    .filter(d => !isNaN(d.value))
    .reverse();

  // 5yr average for storage (same week-of-year)
  const storWithAvg = stor.slice(-52).map(d => {
    const weekKey = d.period.slice(5);
    const sameWeeks = stor.filter(s => s.period.slice(5) === weekKey && s.period < d.period).slice(-5);
    const avg5yr = sameWeeks.length
      ? Math.round(sameWeeks.reduce((s, x) => s + x.value, 0) / sameWeeks.length)
      : null;
    return { ...d, avg5yr };
  });

  const latestProd = prod[prod.length - 1]?.value;
  const latestCons = cons[cons.length - 1]?.value;
  const latestStor = stor[stor.length - 1]?.value;
  const prevStor   = stor[stor.length - 2]?.value;

  return {
    prod: prod.slice(-24),
    cons: cons.slice(-24),
    stor: storWithAvg,
    latest: {
      prod: latestProd,
      cons: latestCons,
      stor: latestStor,
      storWoW: latestStor && prevStor ? parseFloat((latestStor - prevStor).toFixed(1)) : null,
      prodPeriod: prod[prod.length - 1]?.period,
      storPeriod: stor[stor.length - 1]?.period,
    },
  };
}

// ?? 4. OECD STOCKS (STEO monthly) ????????????????????????????
// COSWPRS = OECD commercial petroleum stocks end of period (Mbbl)
async function fetchOECDStocks() {
  const url = eia('steo/data/', {
    frequency: 'monthly',
    'data[0]': 'value',
    'facets[seriesId][]': 'COSWPRS',
    'sort[0][column]': 'period',
    'sort[0][direction]': 'desc',
    length: '60',
  });
  const j = await fetchJSON(url);
  const rows = (j.response?.data || [])
    .map(d => ({ period: d.period, value: parseFloat(d.value) }))
    .filter(d => !isNaN(d.value))
    .reverse();

  const withMoM = rows.map((d, i) => ({
    ...d,
    mom: i > 0 ? parseFloat((d.value - rows[i - 1].value).toFixed(1)) : null,
  }));

  const withAvg = withMoM.map(d => {
    const month = d.period.slice(5);
    const sameMonths = withMoM
      .filter(s => s.period.slice(5) === month && s.period < d.period)
      .slice(-5);
    const avg5yr = sameMonths.length
      ? parseFloat((sameMonths.reduce((s, x) => s + x.value, 0) / sameMonths.length).toFixed(1))
      : null;
    return {
      ...d,
      avg5yr,
      overhang: avg5yr != null ? parseFloat((d.value - avg5yr).toFixed(1)) : null,
    };
  });

  const latest = withAvg[withAvg.length - 1] || {};
  return {
    series: withAvg.slice(-24),
    latest: {
      value:    latest.value,
      mom:      latest.mom,
      avg5yr:   latest.avg5yr,
      overhang: latest.overhang,
      period:   latest.period,
    },
  };
}

// ?? MAIN ??????????????????????????????????????????????????????
export default async function handler(req, context) {
  if (!EIA_KEY) {
    return new Response(JSON.stringify({ error: 'EIA_API_KEY not set' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  const startTime = Date.now();
  const errors = [];
  let crudeStocks = [], crudeImports = {}, naturalGas = {}, oecdStocks = {};

  try { crudeStocks  = await fetchCrudeStocks();  } catch (e) { errors.push(`crudeStocks: ${e.message}`);  }
  try { crudeImports = await fetchCrudeImports(); } catch (e) { errors.push(`crudeImports: ${e.message}`); }
  try { naturalGas   = await fetchNaturalGas();   } catch (e) { errors.push(`naturalGas: ${e.message}`);   }
  try { oecdStocks   = await fetchOECDStocks();   } catch (e) { errors.push(`oecdStocks: ${e.message}`);   }

  // Compute inventory MoM from weekly stocks
  const invMoM = [];
  if (crudeStocks.length > 4) {
    const monthly = {};
    for (const d of crudeStocks) {
      const ym = d.period.slice(0, 7);
      if (!monthly[ym] || d.period > monthly[ym].period) monthly[ym] = d;
    }
    const months = Object.keys(monthly).sort().slice(-14);
    for (let i = 1; i < months.length; i++) {
      const cur = monthly[months[i]];
      const prv = monthly[months[i - 1]];
      invMoM.push({
        period: months[i],
        value:  cur.value,
        mom:    parseFloat((cur.value - prv.value).toFixed(1)),
      });
    }
  }

  // Latest inventory widget values
  const latestInv = crudeStocks[crudeStocks.length - 1] || {};
  const prevInv   = crudeStocks[crudeStocks.length - 2] || {};
  const yoyInv    = crudeStocks.length >= 52 ? crudeStocks[crudeStocks.length - 52] : null;

  const payload = {
    fetchedAt:   new Date().toISOString(),
    durationMs:  Date.now() - startTime,
    errors,
    inventory: {
      latest: latestInv.value || null,
      period: latestInv.period || null,
      wow:    (latestInv.value && prevInv.value)
                ? parseFloat((latestInv.value - prevInv.value).toFixed(1)) : null,
      yoy:    (latestInv.value && yoyInv?.value)
                ? parseFloat((latestInv.value - yoyInv.value).toFixed(1)) : null,
    },
    crudeStocks,
    invMoM,
    crudeImports,
    naturalGas,
    oecdStocks,
  };

  try {
    const store = getStore('crude-radar');
    await store.set('eia-charts', JSON.stringify(payload));
    console.log(`[fetch-eia-data] OK in ${Date.now() - startTime}ms, errors: ${errors.length}`);
    if (errors.length) console.error('[fetch-eia-data] errors:', errors);
  } catch (e) {
    console.error('[fetch-eia-data] Blob write error:', e.message);
    errors.push(`blobWrite: ${e.message}`);
  }

  return new Response(JSON.stringify({ ok: true, errors, durationMs: Date.now() - startTime }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
}
