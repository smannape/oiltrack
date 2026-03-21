// fetch-stocks.mjs
// Fetches oil company stock prices from Yahoo Finance v8 API (same source as yfinance)
// Writes to blob: store='crude-radar', key='stocks'
// Runs every 15 minutes via scheduled-refresh
//
// Tickers:
//   SHEL  BP    XOM   CVX   2222.SR  OXY  HES  COP
//   HAL   SLB   BKR   NOV   SAPMY   FTI  PBR  WFRD

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

// Yahoo Finance v8 quote endpoint (same as yfinance uses internally)
async function fetchQuote(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1mo`;
  const r = await fetch(url, {
    signal: AbortSignal.timeout(12000),
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; CrudeRadarBot/1.0)',
      'Accept': 'application/json',
    },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// Yahoo Finance v7 quote summary for fundamentals (market cap, P/E, dividend yield)
async function fetchQuoteSummary(symbol) {
  const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}&fields=regularMarketPrice,regularMarketChange,regularMarketChangePercent,regularMarketPreviousClose,regularMarketVolume,fiftyTwoWeekLow,fiftyTwoWeekHigh,marketCap,trailingPE,dividendYield,currency,shortName,longName,regularMarketOpen,regularMarketDayHigh,regularMarketDayLow`;
  const r = await fetch(url, {
    signal: AbortSignal.timeout(12000),
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; CrudeRadarBot/1.0)',
      'Accept': 'application/json',
    },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

// Parse quote summary response
function parseQuote(data, ticker) {
  const result = data?.quoteResponse?.result?.[0];
  if (!result) return null;

  const price   = result.regularMarketPrice;
  const prev    = result.regularMarketPreviousClose;
  const change  = result.regularMarketChange;
  const changePct = result.regularMarketChangePercent;
  const vol     = result.regularMarketVolume;
  const hi52    = result.fiftyTwoWeekHigh;
  const lo52    = result.fiftyTwoWeekLow;
  const mcap    = result.marketCap;
  const pe      = result.trailingPE;
  const divYld  = result.dividendYield;
  const open    = result.regularMarketOpen;
  const dayHi   = result.regularMarketDayHigh;
  const dayLo   = result.regularMarketDayLow;
  const cur     = result.currency || ticker.currency;

  return {
    symbol:      ticker.symbol,
    name:        ticker.name,
    category:    ticker.category,
    exchange:    ticker.exchange,
    currency:    cur,
    price:       price       != null ? parseFloat(price.toFixed(2))     : null,
    change:      change      != null ? parseFloat(change.toFixed(2))    : null,
    changePct:   changePct   != null ? parseFloat(changePct.toFixed(2)) : null,
    prevClose:   prev        != null ? parseFloat(prev.toFixed(2))      : null,
    open:        open        != null ? parseFloat(open.toFixed(2))      : null,
    dayHigh:     dayHi       != null ? parseFloat(dayHi.toFixed(2))     : null,
    dayLow:      dayLo       != null ? parseFloat(dayLo.toFixed(2))     : null,
    volume:      vol         != null ? Math.round(vol)                  : null,
    week52High:  hi52        != null ? parseFloat(hi52.toFixed(2))      : null,
    week52Low:   lo52        != null ? parseFloat(lo52.toFixed(2))      : null,
    marketCap:   mcap        != null ? Math.round(mcap)                 : null,
    pe:          pe          != null ? parseFloat(pe.toFixed(1))        : null,
    divYield:    divYld      != null ? parseFloat((divYld * 100).toFixed(2)) : null,
  };
}

// Parse 30-day sparkline from v8 chart endpoint
function parseSparkline(data) {
  try {
    const closes = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || [];
    // Downsample to 30 points max, remove nulls
    const valid = closes.filter(v => v != null);
    const step  = Math.max(1, Math.floor(valid.length / 30));
    const points = [];
    for (let i = 0; i < valid.length; i += step) points.push(parseFloat(valid[i].toFixed(2)));
    return points.slice(-30);
  } catch {
    return [];
  }
}

// ── MAIN ──────────────────────────────────────────────────────
export default async function handler(req, context) {
  const t0     = Date.now();
  const errors = [];
  const stocks = [];

  // Batch requests in groups of 4 to avoid rate limiting
  const batchSize = 4;
  for (let i = 0; i < TICKERS.length; i += batchSize) {
    const batch = TICKERS.slice(i, i + batchSize);
    await Promise.all(batch.map(async ticker => {
      try {
        // Fetch quote summary and sparkline in parallel
        const [summaryData, chartData] = await Promise.all([
          fetchQuoteSummary(ticker.symbol),
          fetchQuote(ticker.symbol),
        ]);
        const quote = parseQuote(summaryData, ticker);
        if (quote) {
          quote.sparkline = parseSparkline(chartData);
          stocks.push(quote);
        } else {
          errors.push(ticker.symbol + ': no quote data');
        }
      } catch (e) {
        errors.push(ticker.symbol + ': ' + e.message);
        // Push placeholder so UI can show "N/A" rather than disappear
        stocks.push({
          symbol: ticker.symbol, name: ticker.name,
          category: ticker.category, exchange: ticker.exchange,
          currency: ticker.currency,
          price: null, change: null, changePct: null,
          volume: null, marketCap: null, sparkline: [],
          error: e.message,
        });
      }
    }));
    // Small delay between batches to respect rate limits
    if (i + batchSize < TICKERS.length) {
      await new Promise(r => setTimeout(r, 300));
    }
  }

  // Sort to match original order
  const order = TICKERS.map(t => t.symbol);
  stocks.sort((a, b) => order.indexOf(a.symbol) - order.indexOf(b.symbol));

  // Summary stats
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
    console.log('[fetch-stocks] OK ' + (Date.now()-t0) + 'ms stocks:' + stocks.length + ' errors:' + errors.length);
    if (errors.length) console.error('[fetch-stocks]', errors);
  } catch (e) {
    console.error('[fetch-stocks] blob error:', e.message);
    errors.push('blobWrite: ' + e.message);
  }

  return new Response(JSON.stringify({ ok: true, stocks: stocks.length, errors, durationMs: Date.now()-t0 }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
}
