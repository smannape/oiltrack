// ============================================================
// netlify/functions/fetch-eia-data.mjs
// Background function — fetches all 4 EIA chart datasets
// and writes them to Netlify Blob store: 'crude-radar' key 'eia-charts'
//
// Triggered by:
//   - scheduled-refresh.mjs (hourly)
//   - POST /api/eia-refresh (manual)
//
// EIA v2 endpoints used:
//   1. Crude inventory MoM  — petroleum/sum/snd/epco/sae/nus/mbbl (weekly)
//   2. Crude imports        — crude-oil-imports/data (monthly by country)
//   3. Natural gas          — natural-gas prod/cons/stor/reserves (monthly/weekly)
//   4. OECD stocks          — steo/data (monthly COSWPRS)
// ============================================================

import { getStore } from '@netlify/blobs';

const EIA_KEY = process.env.EIA_API_KEY || '';
const BASE    = 'https://api.eia.gov/v2';

function eia(path) {
  const sep = path.includes('?') ? '&' : '?';
  return `${BASE}/${path}${sep}api_key=${EIA_KEY}`;
}

async function fetchJSON(url) {
  const r = await fetch(url, { headers: { 'Accept': 'application/json' } });
  if (!r.ok) throw new Error(`EIA HTTP ${r.status} for ${url}`);
  return r.json();
}

// ── 1. US CRUDE STOCKS (weekly, ~2 years) ────────────────────
async function fetchCrudeStocks() {
  const url = eia('petroleum/sum/snd/epco/sae/nus/mbbl/data/?frequency=weekly&data[0]=value&sort[0][column]=period&sort[0][direction]=desc&length=104');
  const j = await fetchJSON(url);
  const rows = (j.response?.data || []).map(d => ({
    period: d.period,
    value:  parseFloat(d.value),
    unit:   d['unit-name'] || 'MBBL',
  })).filter(d => !isNaN(d.value)).reverse();
  return rows;
}

// ── 2. CRUDE IMPORTS BY COUNTRY (monthly, latest 13 months) ─
async function fetchCrudeImports() {
  const url = eia('crude-oil-imports/data/?frequency=monthly&data[0]=quantity&sort[0][column]=period&sort[0][direction]=desc&length=300&facets[destinationType][]=USA');
  const j = await fetchJSON(url);
  const rows = j.response?.data || [];

  // Group by period then by country
  const byPeriod = {};
  for (const r of rows) {
    const p = r.period;
    const country = r['originName'] || r['origin-name'] || r.originname || 'Unknown';
    const qty = parseFloat(r.quantity) || 0;
    if (!byPeriod[p]) byPeriod[p] = {};
    byPeriod[p][country] = (byPeriod[p][country] || 0) + qty;
  }

  // Get latest 13 months
  const periods = Object.keys(byPeriod).sort().slice(-13);

  // Aggregate top countries across all periods
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
      value: Math.round((byPeriod[p]?.[country] || 0) / 1000), // kbbl -> Mbbl approx
    })),
  }));

  return { periods, series };
}

// ── 3. NATURAL GAS ────────────────────────────────────────────
async function fetchNaturalGas() {
  const [prodJ, consJ, storJ] = await Promise.all([
    // Dry gas production monthly (Bcf)
    fetchJSON(eia('natural-gas/prod/sum/epg0/fpd/nus/bcf/data/?frequency=monthly&data[0]=value&sort[0][column]=period&sort[0][direction]=desc&length=24')),
    // Total consumption monthly (Bcf)
    fetchJSON(eia('natural-gas/cons/sum/vgt/mmcfd/nus/data/?frequency=monthly&data[0]=value&sort[0][column]=period&sort[0][direction]=desc&length=24')),
    // Weekly storage working gas (Bcf)
    fetchJSON(eia('natural-gas/stor/wkly/epg0/wgs/nus/bcf/data/?frequency=weekly&data[0]=value&sort[0][column]=period&sort[0][direction]=desc&length=260')),
  ]);

  const prod = (prodJ.response?.data || [])
    .map(d => ({ period: d.period, value: parseFloat(d.value) }))
    .filter(d => !isNaN(d.value)).reverse();

  const cons = (consJ.response?.data || [])
    .map(d => ({ period: d.period, value: parseFloat(d.value) }))
    .filter(d => !isNaN(d.value)).reverse();

  const stor = (storJ.response?.data || [])
    .map(d => ({ period: d.period, value: parseFloat(d.value) }))
    .filter(d => !isNaN(d.value)).reverse();

  // Compute 5yr avg for storage (same week-of-year)
  const storWithAvg = stor.slice(-52).map(d => {
    const weekNum = d.period.slice(5); // MM-DD portion
    const sameWeeks = stor.filter(s =>
      s.period.slice(5) === weekNum && s.period < d.period
    ).slice(-5);
    const avg5yr = sameWeeks.length
      ? Math.round(sameWeeks.reduce((s, x) => s + x.value, 0) / sameWeeks.length)
      : null;
    return { ...d, avg5yr };
  });

  // Latest values
  const latestProd = prod[prod.length - 1]?.value || null;
  const latestCons = cons[cons.length - 1]?.value || null;
  const latestStor = stor[stor.length - 1]?.value || null;
  const prevStor   = stor[stor.length - 2]?.value || null;
  const storWoW    = latestStor && prevStor ? latestStor - prevStor : null;

  return {
    prod: prod.slice(-24),
    cons: cons.slice(-24),
    stor: storWithAvg,
    latest: {
      prod: latestProd,
      cons: latestCons,
      stor: latestStor,
      storWoW,
      prodPeriod: prod[prod.length - 1]?.period,
      storPeriod: stor[stor.length - 1]?.period,
    },
  };
}

// ── 4. OECD STOCKS (STEO monthly) ────────────────────────────
async function fetchOECDStocks() {
  // COSWPRS = OECD commercial petroleum stocks, end of period (million barrels)
  const url = eia('steo/data/?frequency=monthly&data[0]=value&facets[seriesId][]=COSWPRS&sort[0][column]=period&sort[0][direction]=desc&length=60');
  const j = await fetchJSON(url);
  const rows = (j.response?.data || [])
    .map(d => ({ period: d.period, value: parseFloat(d.value) }))
    .filter(d => !isNaN(d.value))
    .reverse();

  // MoM change
  const withMoM = rows.map((d, i) => ({
    ...d,
    mom: i > 0 ? parseFloat((d.value - rows[i - 1].value).toFixed(1)) : null,
  }));

  // 5yr average for same month
  const withAvg = withMoM.map(d => {
    const month = d.period.slice(5); // MM
    const sameMonths = withMoM.filter(s =>
      s.period.slice(5) === month && s.period < d.period
    ).slice(-5);
    const avg5yr = sameMonths.length
      ? parseFloat((sameMonths.reduce((s, x) => s + x.value, 0) / sameMonths.length).toFixed(1))
      : null;
    return { ...d, avg5yr, overhang: avg5yr != null ? parseFloat((d.value - avg5yr).toFixed(1)) : null };
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

// ── MAIN ──────────────────────────────────────────────────────
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

  // Compute inventory MoM from weekly series
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

  // Latest inventory widget data
  const latestInv = crudeStocks[crudeStocks.length - 1] || {};
  const prevInv   = crudeStocks[crudeStocks.length - 2] || {};
  const yoyInv    = crudeStocks.length >= 52
    ? crudeStocks[crudeStocks.length - 52]
    : null;

  const payload = {
    fetchedAt:    new Date().toISOString(),
    durationMs:   Date.now() - startTime,
    errors,
    // Landing page widget
    inventory: {
      latest:    latestInv.value || null,
      period:    latestInv.period || null,
      wow:       latestInv.value && prevInv.value
                   ? parseFloat((latestInv.value - prevInv.value).toFixed(1))
                   : null,
      yoy:       latestInv.value && yoyInv?.value
                   ? parseFloat((latestInv.value - yoyInv.value).toFixed(1))
                   : null,
    },
    // Chart 1
    crudeStocks,
    invMoM,
    // Chart 2
    crudeImports,
    // Chart 3
    naturalGas,
    // Chart 4
    oecdStocks,
  };

  try {
    const store = getStore('crude-radar');
    await store.set('eia-charts', JSON.stringify(payload));
    console.log(`[fetch-eia-data] OK in ${Date.now() - startTime}ms, errors: ${errors.length}`);
  } catch (e) {
    console.error('[fetch-eia-data] Blob write error:', e.message);
    errors.push(`blobWrite: ${e.message}`);
  }

  return new Response(JSON.stringify({ ok: true, errors, durationMs: Date.now() - startTime }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
}
