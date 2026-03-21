// fetch-stocks.mjs
// Fetches 16 oil company stock quotes from Yahoo Finance.
//
// Auth flow (same as yfinance Python library):
//   1. GET finance.yahoo.com  -> captures Set-Cookie: A3/GUC session cookies
//   2. GET /v1/test/getcrumb  -> returns crumb token (needs cookies from step 1)
//   3. GET /v7/finance/quote  -> quote data (needs crumb + cookies)
//   4. GET /v8/finance/chart  -> 30-day sparkline (needs cookies)
//
// All 16 quotes fetched in one v7 batch call.
// Sparklines fetched via the v8/spark endpoint (4 per batch).

import { getStore } from '@netlify/blobs';

const TICKERS = [
  { symbol: 'SHEL',    name: 'Shell plc',             category: 'Major', exchange: 'NYSE',    currency: 'USD' },
  { symbol: 'BP',      name: 'BP plc',                category: 'Major', exchange: 'NYSE',    currency: 'USD' },
  { symbol: 'XOM',     name: 'ExxonMobil Corp.',       category: 'Major', exchange: 'NYSE',    currency: 'USD' },
  { symbol: 'CVX',     name: 'Chevron Corp.',          category: 'Major', exchange: 'NYSE',    currency: 'USD' },
  { symbol: '2222.SR', name: 'Saudi Aramco',          category: 'Major', exchange: 'Tadawul', currency: 'SAR' },
  { symbol: 'OXY',     name: 'Occidental (Anadarko)', category: 'EP',    exchange: 'NYSE',    currency: 'USD' },
  { symbol: 'HES',     name: 'Hess Corp.',            category: 'EP',    exchange: 'NYSE',    currency: 'USD' },
  { symbol: 'COP',     name: 'ConocoPhillips',        category: 'EP',    exchange: 'NYSE',    currency: 'USD' },
  { symbol: 'HAL',     name: 'Halliburton Co.',       category: 'OFS',   exchange: 'NYSE',    currency: 'USD' },
  { symbol: 'SLB',     name: 'SLB (Schlumberger)',    category: 'OFS',   exchange: 'NYSE',    currency: 'USD' },
  { symbol: 'BKR',     name: 'Baker Hughes Co.',      category: 'OFS',   exchange: 'NASDAQ',  currency: 'USD' },
  { symbol: 'NOV',     name: 'NOV Inc.',              category: 'OFS',   exchange: 'NYSE',    currency: 'USD' },
  { symbol: 'SAPMY',   name: 'Saipem SpA',            category: 'OFS',   exchange: 'OTC',     currency: 'USD' },
  { symbol: 'FTI',     name: 'TechnipFMC plc',        category: 'OFS',   exchange: 'NYSE',    currency: 'USD' },
  { symbol: 'PBR',     name: 'Petrobras',             category: 'Intl',  exchange: 'NYSE',    currency: 'USD' },
  { symbol: 'WFRD',    name: 'Weatherford Intl.',     category: 'OFS',   exchange: 'NASDAQ',  currency: 'USD' },
];

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

// ── Step 1 & 2: Get session cookies + crumb ───────────────────
async function getSession() {
  // Hit the main YF page to establish session cookies
  const homeResp = await fetch('https://finance.yahoo.com/', {
    signal: AbortSignal.timeout(15000),
    redirect: 'follow',
    headers: {
      'User-Agent': UA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
    },
  });

  // Extract Set-Cookie headers to forward to crumb request
  const rawCookies = homeResp.headers.getSetCookie
    ? homeResp.headers.getSetCookie()
    : (homeResp.headers.get('set-cookie') || '').split(/,\s*(?=[a-zA-Z_])/);

  // Build cookie string: take name=value from each Set-Cookie
  const cookieStr = rawCookies
    .map(c => c.split(';')[0].trim())
    .filter(Boolean)
    .join('; ');

  if (!cookieStr) {
    throw new Error('No cookies from finance.yahoo.com - may be blocked');
  }

  // Get crumb using the session cookies
  const crumbResp = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
    signal: AbortSignal.timeout(10000),
    headers: {
      'User-Agent': UA,
      'Cookie': cookieStr,
      'Accept': 'text/plain',
    },
  });

  if (!crumbResp.ok) {
    throw new Error('Crumb fetch failed: HTTP ' + crumbResp.status);
  }

  const crumb = (await crumbResp.text()).trim();
  if (!crumb || crumb.length < 3) {
    throw new Error('Invalid crumb: ' + crumb);
  }

  return { cookieStr, crumb };
}

// ── Step 3: Fetch all quotes in one batch call ────────────────
async function fetchAllQuotes(symbols, cookieStr, crumb) {
  const symStr = symbols.join(',');
  const fields = [
    'symbol','shortName','regularMarketPrice','regularMarketChange',
    'regularMarketChangePercent','regularMarketPreviousClose',
    'regularMarketOpen','regularMarketDayHigh','regularMarketDayLow',
    'regularMarketVolume','fiftyTwoWeekLow','fiftyTwoWeekHigh',
    'marketCap','trailingPE','dividendYield','currency',
  ].join(',');

  const url = 'https://query1.finance.yahoo.com/v7/finance/quote'
    + '?symbols=' + encodeURIComponent(symStr)
    + '&fields=' + encodeURIComponent(fields)
    + '&crumb=' + encodeURIComponent(crumb);

  const r = await fetch(url, {
    signal: AbortSignal.timeout(20000),
    headers: {
      'User-Agent': UA,
      'Cookie': cookieStr,
      'Accept': 'application/json',
    },
  });

  if (!r.ok) throw new Error('Quotes HTTP ' + r.status);
  return r.json();
}

// ── Step 4: Fetch sparklines (v8 spark, batch of 8) ──────────
async function fetchSparklines(symbols, cookieStr) {
  const symStr = symbols.join(',');
  const url = 'https://query1.finance.yahoo.com/v8/finance/spark'
    + '?symbols=' + encodeURIComponent(symStr)
    + '&range=1mo&interval=1d';

  const r = await fetch(url, {
    signal: AbortSignal.timeout(20000),
    headers: {
      'User-Agent': UA,
      'Cookie': cookieStr,
      'Accept': 'application/json',
    },
  });

  if (!r.ok) {
    console.warn('[fetch-stocks] Spark HTTP ' + r.status + ' - sparklines will be empty');
    return {};
  }

  const data = await r.json();
  // Parse sparkline points for each symbol
  const result = {};
  for (const sym of symbols) {
    try {
      const closes = data[sym]?.close || data[sym]?.timestamp || [];
      const valid  = closes.filter(v => v != null);
      const step   = Math.max(1, Math.floor(valid.length / 30));
      const pts    = [];
      for (let i = 0; i < valid.length; i += step) {
        pts.push(parseFloat(valid[i].toFixed(2)));
      }
      result[sym] = pts.slice(-30);
    } catch {
      result[sym] = [];
    }
  }
  return result;
}

// ── Parse quote result ────────────────────────────────────────
function parseQuote(r, ticker) {
  if (!r) return null;
  const n = v => (v != null && !isNaN(v)) ? parseFloat(parseFloat(v).toFixed(2)) : null;
  const ni = v => (v != null && !isNaN(v)) ? Math.round(v) : null;
  return {
    symbol:    ticker.symbol,
    name:      r.shortName || ticker.name,
    category:  ticker.category,
    exchange:  ticker.exchange,
    currency:  r.currency || ticker.currency,
    price:     n(r.regularMarketPrice),
    change:    n(r.regularMarketChange),
    changePct: n(r.regularMarketChangePercent),
    prevClose: n(r.regularMarketPreviousClose),
    open:      n(r.regularMarketOpen),
    dayHigh:   n(r.regularMarketDayHigh),
    dayLow:    n(r.regularMarketDayLow),
    volume:    ni(r.regularMarketVolume),
    week52High: n(r.fiftyTwoWeekHigh),
    week52Low:  n(r.fiftyTwoWeekLow),
    marketCap:  ni(r.marketCap),
    pe:         r.trailingPE != null ? parseFloat(parseFloat(r.trailingPE).toFixed(1)) : null,
    // Yahoo v7 returns dividendYield inconsistently:
    // sometimes as fraction (0.0329) sometimes as percent already (3.29)
    // Normalize: if value > 1 it's already a percent, else multiply by 100
    divYield:   r.dividendYield != null
      ? parseFloat((r.dividendYield > 1 ? r.dividendYield : r.dividendYield * 100).toFixed(2))
      : null,
    sparkline:  [],
  };
}

// ── MAIN ──────────────────────────────────────────────────────
export default async function handler(req, context) {
  const t0     = Date.now();
  const errors = [];

  // Step 1+2: Establish session
  let cookieStr, crumb;
  try {
    ({ cookieStr, crumb } = await getSession());
    console.log('[fetch-stocks] Session OK, crumb length: ' + crumb.length);
  } catch (e) {
    errors.push('session: ' + e.message);
    console.error('[fetch-stocks] Session failed:', e.message);
    return new Response(JSON.stringify({ ok: false, errors }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Step 3: Fetch all quotes in one call
  const allSymbols = TICKERS.map(t => t.symbol);
  let quoteMap = {};
  try {
    const data = await fetchAllQuotes(allSymbols, cookieStr, crumb);
    const results = data?.quoteResponse?.result || [];
    for (const r of results) {
      quoteMap[r.symbol] = r;
    }
    console.log('[fetch-stocks] Quotes received: ' + results.length);
  } catch (e) {
    errors.push('quotes: ' + e.message);
    console.error('[fetch-stocks] Quotes failed:', e.message);
  }

  // Step 4: Fetch sparklines in 2 batches of 8
  let sparkMap = {};
  try {
    const [s1, s2] = await Promise.all([
      fetchSparklines(allSymbols.slice(0, 8),  cookieStr),
      fetchSparklines(allSymbols.slice(8, 16), cookieStr),
    ]);
    sparkMap = { ...s1, ...s2 };
  } catch (e) {
    errors.push('sparklines: ' + e.message);
  }

  // Build final stocks array
  const stocks = TICKERS.map(ticker => {
    const raw   = quoteMap[ticker.symbol];
    const stock = parseQuote(raw, ticker);
    if (stock) {
      stock.sparkline = sparkMap[ticker.symbol] || [];
      return stock;
    }
    // Placeholder if quote missing
    return {
      symbol: ticker.symbol, name: ticker.name,
      category: ticker.category, exchange: ticker.exchange,
      currency: ticker.currency,
      price: null, change: null, changePct: null,
      volume: null, marketCap: null, sparkline: [],
      error: 'No data returned',
    };
  });

  // Summary
  const valid     = stocks.filter(s => s.price != null);
  const up        = valid.filter(s => (s.changePct || 0) > 0).length;
  const down      = valid.filter(s => (s.changePct || 0) < 0).length;
  const flat      = valid.filter(s => (s.changePct || 0) === 0).length;
  const totalMcap = valid.reduce((sum, s) => sum + (s.marketCap || 0), 0);
  const avgChgPct = valid.length
    ? parseFloat((valid.reduce((s, x) => s + (x.changePct || 0), 0) / valid.length).toFixed(2))
    : null;

  const payload = {
    fetchedAt:  new Date().toISOString(),
    durationMs: Date.now() - t0,
    errors,
    summary: { up, down, flat, totalMcap, avgChangePct: avgChgPct, count: valid.length },
    stocks,
  };

  try {
    const store = getStore('crude-radar');
    await store.set('stocks', JSON.stringify(payload));
    console.log('[fetch-stocks] OK ' + (Date.now()-t0) + 'ms live:' + valid.length + '/16 errors:' + errors.length);
    if (errors.length) console.error('[fetch-stocks]', errors);
  } catch (e) {
    console.error('[fetch-stocks] blob error:', e.message);
    errors.push('blobWrite: ' + e.message);
  }

  return new Response(JSON.stringify({ ok: true, live: valid.length, errors, durationMs: Date.now()-t0 }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
}
