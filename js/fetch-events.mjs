// fetch-events.mjs
// Computes and scrapes upcoming oil market events.
// Writes to blob: store='crude-radar', key='events'
//
// Sources:
//   EIA WPSR next release   -- scraped from eia.gov/petroleum/supply/weekly/
//   EIA STEO next release   -- scraped from eia.gov/outlooks/steo/
//   EIA Nat Gas Storage     -- always Thursday, computed
//   OPEC meetings           -- known confirmed dates + rule-based
//   NYMEX WTI expiry        -- deterministic CME formula
//   IEA OMR                 -- approx 15th of month, scraped when possible

import { getStore } from '@netlify/blobs';

// ── Date helpers ──────────────────────────────────────────────
function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function isWeekend(d) { return d.getDay() === 0 || d.getDay() === 6; }

function nextWeekday(d) {
  const r = new Date(d);
  while (isWeekend(r)) r.setDate(r.getDate() + 1);
  return r;
}

function prevWeekday(d) {
  const r = new Date(d);
  r.setDate(r.getDate() - 1);
  while (isWeekend(r)) r.setDate(r.getDate() - 1);
  return r;
}

function ymd(d) {
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0');
}

function shortDate(d) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun',
                  'Jul','Aug','Sep','Oct','Nov','Dec'];
  return months[d.getMonth()] + ' ' + d.getDate();
}

// ── Scrape helper ─────────────────────────────────────────────
async function scrapeText(url) {
  try {
    const r = await fetch(url, {
      signal: AbortSignal.timeout(12000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CrudeRadarBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });
    if (!r.ok) return null;
    return await r.text();
  } catch {
    return null;
  }
}

// Extract a date from text near a keyword
function extractDate(text, keyword) {
  const idx = text?.indexOf(keyword);
  if (idx === undefined || idx < 0) return null;
  const near = text.substring(idx, idx + 200);
  // Match patterns like: Mar. 18, 2026 | March 18, 2026 | 18 March 2026
  const patterns = [
    /(\w{3,9}\.?\s+\d{1,2},\s+20\d{2})/,
    /(\d{1,2}\s+\w{3,9}\s+20\d{2})/,
    /(\d{4}-\d{2}-\d{2})/,
  ];
  for (const re of patterns) {
    const m = near.match(re);
    if (m) {
      const d = new Date(m[1].replace('.', ''));
      if (!isNaN(d.getTime())) return d;
    }
  }
  return null;
}

// ── 1. EIA Weekly Petroleum Status Report (WPSR) ─────────────
// Always released Wednesday 10:30 AM ET. Next date scraped from EIA.
async function getWPSRNextDate() {
  const html = await scrapeText('https://www.eia.gov/petroleum/supply/weekly/');
  if (html) {
    const d = extractDate(html, 'Next Release Date');
    if (d) return d;
  }
  // Fallback: find next Wednesday
  const now = new Date();
  const next = new Date(now);
  next.setHours(0, 0, 0, 0);
  while (next.getDay() !== 3) next.setDate(next.getDate() + 1); // 3 = Wednesday
  if (next <= now) next.setDate(next.getDate() + 7);
  return next;
}

// ── 2. EIA Weekly Natural Gas Storage Report (WNGSR) ─────────
// Always released Thursday 10:30 AM ET. Find next Thursday.
function getNatGasNextDate() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(0, 0, 0, 0);
  while (next.getDay() !== 4) next.setDate(next.getDate() + 1); // 4 = Thursday
  if (next <= now) next.setDate(next.getDate() + 7);
  return next;
}

// ── 3. EIA STEO (Short-Term Energy Outlook) ──────────────────
// Released first Tuesday after first Thursday of each month, ~10 AM ET
async function getSTEONextDate() {
  const html = await scrapeText('https://www.eia.gov/outlooks/steo/');
  if (html) {
    const d = extractDate(html, 'Next Release Date');
    if (d && d > new Date()) return d;
    // Also try April format
    const d2 = extractDate(html, 'next release');
    if (d2 && d2 > new Date()) return d2;
  }
  // Fallback: compute rule
  const now = new Date();
  for (let offset = 0; offset <= 2; offset++) {
    const month = now.getMonth() + offset;
    const year  = now.getFullYear() + Math.floor(month / 12);
    const mo    = month % 12;
    // Find first Thursday of month
    const d = new Date(year, mo, 1);
    while (d.getDay() !== 4) d.setDate(d.getDate() + 1);
    // Next Tuesday after that Thursday
    const tuesday = new Date(d);
    tuesday.setDate(tuesday.getDate() + ((7 - tuesday.getDay() + 2) % 7 || 7));
    if (tuesday > now) return tuesday;
  }
  return null;
}

// ── 4. IEA Oil Market Report ──────────────────────────────────
// Published ~15th of each month. Attempt to scrape, else compute.
async function getIEANextDate() {
  // Scrape IEA OMR schedule page
  const html = await scrapeText('https://www.iea.org/data-and-statistics/data-product/oil-market-report-omr');
  if (html) {
    // Look for upcoming dates in the schedule list
    const futureRe = /(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+20\d{2})/gi;
    const now = new Date();
    const matches = [...html.matchAll(futureRe)];
    for (const m of matches) {
      const d = new Date(m[1]);
      if (!isNaN(d.getTime()) && d > now) return d;
    }
  }
  // Fallback: 15th of next month (or current month if not yet past 15th)
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), 15);
  if (d <= now) d.setMonth(d.getMonth() + 1);
  return d;
}

// ── 5. OPEC meetings ─────────────────────────────────────────
// Known confirmed 2026 dates + rule-based monthly 8-country meetings
function getOPECEvents() {
  const now = new Date();

  // Confirmed official dates (from opec.org announcements)
  const confirmed = [
    { date: new Date('2026-06-07'), label: 'OPEC+ Ministerial Meeting (41st)', type: 'OPEC', priority: 'high' },
  ];

  // Monthly 8-country steering group meetings (approx first Sunday of month)
  // Generate next 6 months
  const monthly = [];
  for (let i = 0; i < 8; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    // Find first Sunday of month
    while (d.getDay() !== 0) d.setDate(d.getDate() + 1);
    if (d > now && !confirmed.some(c => Math.abs(c.date - d) < 7 * 86400000)) {
      monthly.push({
        date: d,
        label: 'OPEC+ 8-Country Review Meeting',
        type: 'OPEC',
        priority: 'normal',
      });
    }
  }

  // JMMC (every 2 months, approx)
  const jmmc = [];
  const jmmcMonths = [2, 4, 6, 8, 10, 12]; // Feb, Apr, Jun, Aug, Oct, Dec
  const curYear = now.getFullYear();
  for (const m of jmmcMonths) {
    const d = new Date(curYear, m - 1, 2);
    if (d > now) {
      jmmc.push({
        date: d,
        label: 'OPEC+ JMMC Meeting',
        type: 'OPEC',
        priority: 'normal',
      });
      break; // just next one
    }
  }

  return [...confirmed, ...monthly.slice(0, 2), ...jmmc]
    .filter(e => e.date > now)
    .sort((a, b) => a.date - b.date);
}

// ── 6. NYMEX WTI Futures Contract Expiry ─────────────────────
// Rule: Last trading day = 3rd business day before the 25th of month
// preceding the delivery month. So for "May 2026 contract" (CLK6),
// LTD = 3 business days before April 25 = ~April 21 (varies for weekends)
function getNYMEXExpiries(count) {
  const now   = new Date();
  const months = ['Jan','Feb','Mar','Apr','May','Jun',
                  'Jul','Aug','Sep','Oct','Nov','Dec'];
  const result = [];

  for (let offset = 0; offset < 12 && result.length < count; offset++) {
    const delivMonth = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const prevMonth  = new Date(delivMonth.getFullYear(), delivMonth.getMonth() - 1, 25);

    // Go back 3 business days from the 25th
    let ltd = new Date(prevMonth);
    if (isWeekend(ltd)) ltd = prevWeekday(ltd);
    for (let i = 0; i < 3; i++) ltd = prevWeekday(ltd);

    if (ltd > now) {
      const deliv = months[delivMonth.getMonth()] + ' ' + delivMonth.getFullYear();
      result.push({
        date: ltd,
        label: `NYMEX WTI ${deliv} Contract Expiry`,
        type: 'FUTURES',
        priority: 'normal',
      });
    }
  }
  return result;
}

// ── 7. ICE Brent Futures Expiry ───────────────────────────────
// Rule: Last trading day = last business day of 2nd month before delivery
function getBrentExpiries(count) {
  const now = new Date();
  const months = ['Jan','Feb','Mar','Apr','May','Jun',
                  'Jul','Aug','Sep','Oct','Nov','Dec'];
  const result = [];
  for (let offset = 0; offset < 12 && result.length < count; offset++) {
    const delivMonth = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    // Last business day of 2 months before delivery
    const twoMonthsBefore = new Date(delivMonth.getFullYear(), delivMonth.getMonth() - 2 + 1, 0); // last day of month
    let ltd = new Date(twoMonthsBefore);
    while (isWeekend(ltd)) ltd = prevWeekday(ltd);
    if (ltd > now) {
      const deliv = months[delivMonth.getMonth()] + ' ' + delivMonth.getFullYear();
      result.push({
        date: ltd,
        label: `ICE Brent ${deliv} Contract Expiry`,
        type: 'FUTURES',
        priority: 'normal',
      });
    }
  }
  return result;
}

// ── MAIN ──────────────────────────────────────────────────────
export default async function handler(req, context) {
  const t0 = Date.now();
  const errors = [];

  const [wpsr, steo, iea, natgas] = await Promise.all([
    getWPSRNextDate().catch(e => { errors.push('wpsr: ' + e.message); return null; }),
    getSTEONextDate().catch(e => { errors.push('steo: ' + e.message); return null; }),
    getIEANextDate().catch(e  => { errors.push('iea: '  + e.message); return null; }),
    Promise.resolve(getNatGasNextDate()),
  ]);

  const opecEvents  = getOPECEvents();
  const nymex       = getNYMEXExpiries(3);
  const brent       = getBrentExpiries(2);

  // Build unified events list
  const events = [];

  if (wpsr) events.push({
    date: ymd(wpsr), displayDate: shortDate(wpsr),
    label: 'EIA Weekly Petroleum Status Report',
    source: 'EIA', type: 'REPORT', priority: 'high',
    url: 'https://www.eia.gov/petroleum/supply/weekly/',
    note: 'US crude inventory, production & refinery data. Weds 10:30 AM ET',
  });

  if (natgas) events.push({
    date: ymd(natgas), displayDate: shortDate(natgas),
    label: 'EIA Natural Gas Storage Report',
    source: 'EIA', type: 'REPORT', priority: 'high',
    url: 'https://ir.eia.gov/ngs/ngs.html',
    note: 'Weekly US natural gas working storage. Thurs 10:30 AM ET',
  });

  if (steo) events.push({
    date: ymd(steo), displayDate: shortDate(steo),
    label: 'EIA Short-Term Energy Outlook (STEO)',
    source: 'EIA', type: 'REPORT', priority: 'high',
    url: 'https://www.eia.gov/outlooks/steo/',
    note: 'Price forecasts, supply & demand balances for next 18 months',
  });

  if (iea) events.push({
    date: ymd(iea), displayDate: shortDate(iea),
    label: 'IEA Oil Market Report',
    source: 'IEA', type: 'REPORT', priority: 'high',
    url: 'https://www.iea.org/topics/oil-market-report',
    note: 'Monthly global oil supply, demand & inventory outlook. 10 AM Paris',
  });

  for (const e of opecEvents) {
    events.push({
      date: ymd(e.date), displayDate: shortDate(e.date),
      label: e.label,
      source: 'OPEC', type: 'MEETING', priority: e.priority,
      url: 'https://www.opec.org',
      note: 'Production policy & quota decisions',
    });
  }

  for (const e of nymex) {
    events.push({
      date: ymd(e.date), displayDate: shortDate(e.date),
      label: e.label,
      source: 'CME/NYMEX', type: 'FUTURES', priority: 'normal',
      url: 'https://www.cmegroup.com/markets/energy/crude-oil/light-sweet-crude.html',
      note: 'Last trading day for WTI front-month contract',
    });
  }

  for (const e of brent) {
    events.push({
      date: ymd(e.date), displayDate: shortDate(e.date),
      label: e.label,
      source: 'ICE', type: 'FUTURES', priority: 'normal',
      url: 'https://www.ice.com/products/219/Brent-Crude-Futures',
      note: 'Last trading day for ICE Brent front-month',
    });
  }

  // Sort by date, remove past, keep next 12
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const upcoming = events
    .filter(e => new Date(e.date) >= today)
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 12);

  const payload = {
    fetchedAt:  new Date().toISOString(),
    durationMs: Date.now() - t0,
    errors,
    events:     upcoming,
  };

  try {
    const store = getStore('crude-radar');
    await store.set('events', JSON.stringify(payload));
    console.log('[fetch-events] OK ' + (Date.now()-t0) + 'ms events:' + upcoming.length + ' errors:' + errors.length);
    if (errors.length) console.error('[fetch-events]', errors);
  } catch (e) {
    errors.push('blobWrite: ' + e.message);
    console.error('[fetch-events] blob error:', e.message);
  }

  return new Response(JSON.stringify({ ok: true, events: upcoming.length, errors, durationMs: Date.now()-t0 }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
}
