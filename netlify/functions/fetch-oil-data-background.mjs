// ============================================================
// netlify/functions/fetch-oil-data-background.mjs
//
// BACKGROUND FUNCTION (Netlify Pro) — up to 15 min execution.
// Triggered every hour by scheduled-refresh.mjs.
// Also callable manually: POST /api/oil-refresh
//
// Fetches:
//   1. OilPriceAPI  — live spot prices + 30-day history
//   2. EIA Open Data — 11 series (stocks, production, OPEC)
//   3. RSS feeds    — OPEC, IEA, OilPrice.com, Rigzone, Platts, NGI
//   4. GNews API    — oil/energy news (if key set)
//   5. Datalastic   — AIS tanker positions (if key set)
//
// Writes Netlify Blobs in store 'crude-radar':
//   'prices'  — { fetchedAt, prices: { wti:{...}, brent:{...}, ... } }
//   'news'    — { fetchedAt, news: [...] }
//   'eia'     — { fetchedAt, eia: { us_crude_stocks:{...}, ... } }
//   'tankers' — { fetchedAt, tankers: [...] }
//   'meta'    — { fetchedAt, duration_ms, counts, errors }
// ============================================================

import { getStore } from '@netlify/blobs';

// ── ENV VARS ──────────────────────────────────────────────────
const OILPRICE_KEY   = process.env.OILPRICE_API_KEY   || '';
const EIA_KEY        = process.env.EIA_API_KEY         || '';
const GNEWS_KEY      = process.env.GNEWS_API_KEY       || '';
const DATALASTIC_KEY = process.env.DATALASTIC_API_KEY  || '';

// ── OILPRICE API CONTRACTS ────────────────────────────────────
const PRICE_CONTRACTS = [
  { code: 'WTI_USD',           id: 'wti',      name: 'WTI Crude',     unit: 'USD/bbl',   exchange: 'NYMEX', flag: '🇺🇸' },
  { code: 'BRENT_CRUDE_USD',   id: 'brent',    name: 'Brent Crude',   unit: 'USD/bbl',   exchange: 'ICE',   flag: '🌊'  },
  { code: 'DUBAI_CRUDE_USD',   id: 'dubai',    name: 'Dubai Crude',   unit: 'USD/bbl',   exchange: 'DME',   flag: '🇦🇪' },
  { code: 'NATURAL_GAS_USD',   id: 'crude_ng', name: 'Natural Gas',   unit: 'USD/MMBtu', exchange: 'NYMEX', flag: '⚡'  },
  { code: 'HEATING_OIL_USD',   id: 'hho',      name: 'Heating Oil',   unit: 'USD/gal',   exchange: 'NYMEX', flag: '🔥'  },
  { code: 'GASOLINE_RBOB_USD', id: 'rbob',     name: 'RBOB Gasoline', unit: 'USD/gal',   exchange: 'NYMEX', flag: '⛽'  },
];

// ── EIA SERIES ────────────────────────────────────────────────
const EIA_SERIES = [
  { id: 'PET.WCRSTUS1.W',         key: 'us_crude_stocks',     freq: 'weekly',  length: 104 },
  { id: 'PET.WGTSTUS1.W',         key: 'us_gasoline_stocks',  freq: 'weekly',  length: 52  },
  { id: 'PET.WDISTUS1.W',         key: 'us_distillate',       freq: 'weekly',  length: 52  },
  { id: 'PET.WCRRIUS2.W',         key: 'us_crude_imports_w',  freq: 'weekly',  length: 52  },
  { id: 'PET.MCRFPUS2.M',         key: 'us_field_production', freq: 'monthly', length: 60  },
  { id: 'PET.PAPR_OPEC_M.M',      key: 'opec_production',     freq: 'monthly', length: 60  },
  { id: 'PET.PAPR_NON_OPEC_M.M',  key: 'non_opec_production', freq: 'monthly', length: 60  },
  { id: 'PET.RWTC.M',             key: 'wti_spot_monthly',    freq: 'monthly', length: 60  },
  { id: 'PET.RBRTE.M',            key: 'brent_spot_monthly',  freq: 'monthly', length: 60  },
  { id: 'NG.RNGWHHD.D',           key: 'henry_hub_daily',     freq: 'daily',   length: 90  },
];

// ── RSS FEEDS ─────────────────────────────────────────────────
const RSS_FEEDS = [
  { url: 'https://www.opec.org/opec_web/en/press_room/rss.xml',  source: 'OPEC',          tag: 'OPEC'    },
  { url: 'https://www.iea.org/rss/news.xml',                      source: 'IEA',           tag: 'IEA'     },
  { url: 'https://oilprice.com/rss/main',                         source: 'OilPrice.com',  tag: 'MARKET'  },
  { url: 'https://www.rigzone.com/news/rss/rigzone_latest.aspx',  source: 'Rigzone',       tag: 'SUPPLY'  },
  { url: 'https://feeds.feedburner.com/platts/LnJO',             source: 'S&P Platts',    tag: 'PRICE'   },
  { url: 'https://www.naturalgasintel.com/feed/',                 source: 'NGI',           tag: 'LNG'     },
  { url: 'https://www.offshore-technology.com/feed/',             source: 'Offshore Tech', tag: 'SUPPLY'  },
];

// ── TANKERS ───────────────────────────────────────────────────
const TRACKED_TANKERS = [
  { mmsi: '235678901', name: 'GULF STAR I',         type: 'VLCC',    flag: '🇵🇦' },
  { mmsi: '358201445', name: 'OCEAN TITAN',         type: 'Suezmax', flag: '🇬🇷' },
  { mmsi: '477123789', name: 'PACIFIC ARROW',       type: 'Aframax', flag: '🇸🇬' },
  { mmsi: '636091234', name: 'ATLANTIC GLORY',      type: 'VLCC',    flag: '🇱🇷' },
  { mmsi: '311000234', name: 'NORDIC BRAVE',        type: 'Suezmax', flag: '🇧🇸' },
  { mmsi: '563098712', name: 'PIONEER SPIRIT',      type: 'VLCC',    flag: '🇸🇬' },
  { mmsi: '229883000', name: 'HELLESPONT ACHILLES', type: 'ULCC',    flag: '🇬🇷' },
  { mmsi: '441178900', name: 'KOREA PIONEER',       type: 'Aframax', flag: '🇰🇷' },
];

// ══════════════════════════════════════════════════════════════
// HTTP HELPERS
// ══════════════════════════════════════════════════════════════
// REPLACE WITH:
async function fetchJSON(url, timeoutMs = 30000, headers = {}, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'Accept': 'application/json', ...headers },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn(`[fetchJSON] attempt ${attempt}/${retries}: ${url.slice(0, 90)} → ${e.message}`);
      if (attempt < retries) {
        // Wait before retry: 2s, 4s, 8s
        await new Promise(r => setTimeout(r, 2000 * attempt));
      }
    }
  }
  return null;
}

async function fetchText(url, timeoutMs = 15000) {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CrudeRadarBot/1.0)',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (e) {
    console.warn(`[fetchText] ${url.slice(0, 90)} → ${e.message}`);
    return null;
  }
}

// ══════════════════════════════════════════════════════════════
// OILPRICE API
// ══════════════════════════════════════════════════════════════
async function fetchOilPriceLatest(contract) {
  const url = `https://api.oilpriceapi.com/v1/prices/latest?by_code=${contract.code}`;
  const raw = await fetchJSON(url, 30000, { 'Authorization': `Token ${OILPRICE_KEY}` });
  if (raw?.status !== 'success' || !raw?.data?.price) return null;
  return { price: parseFloat(raw.data.price), timestamp: raw.data.created_at };
}

async function fetchOilPriceHistory(contract) {
  const url = `https://api.oilpriceapi.com/v1/prices/past_week?by_code=${contract.code}`;
  const raw = await fetchJSON(url, 30000, { 'Authorization': `Token ${OILPRICE_KEY}` });
  if (raw?.status !== 'success' || !raw?.data?.prices?.length) return [];
  return raw.data.prices
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    .map(p => ({ period: p.created_at.slice(0, 10), value: parseFloat(p.price) }));
}

// ══════════════════════════════════════════════════════════════
// EIA
// ══════════════════════════════════════════════════════════════
async function fetchEIASeries(s) {
  if (!EIA_KEY) return null;
  const url = `https://api.eia.gov/v2/seriesid/${s.id}?api_key=${EIA_KEY}&length=${s.length}&sort[0][column]=period&sort[0][direction]=desc`;
  const raw = await fetchJSON(url, 25000);
  if (!raw?.response?.data?.length) return null;
  const data = raw.response.data.map(d => ({ period: d.period, value: parseFloat(d.value) }));
  const latest = data[0];
  const prev   = data[1];
  return {
    latest: {
      ...latest,
      change:    prev ? parseFloat((latest.value - prev.value).toFixed(3)) : null,
      changePct: prev ? parseFloat(((latest.value - prev.value) / prev.value * 100).toFixed(2)) : null,
    },
    series: data,
    freq: s.freq,
  };
}

// ══════════════════════════════════════════════════════════════
// RSS — direct fetch + native XML parse (no rss2json.com)
// ══════════════════════════════════════════════════════════════
function extractXMLField(xml, tag) {
  const cdataRe = new RegExp(`<${tag}[^>]*>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\\/${tag}>`, 'i');
  const plainRe = new RegExp(`<${tag}[^>]*>([^<]*(?:<(?!\\/${tag})[^<]*)*)<\\/${tag}>`, 'i');
  const cd = xml.match(cdataRe);
  if (cd) return cd[1].trim();
  const pl = xml.match(plainRe);
  if (pl) return pl[1].replace(/<[^>]*>/g, '').trim();
  return '';
}
function extractXMLAttr(xml, tag, attr) {
  const re = new RegExp(`<${tag}[^>]*\\s${attr}=["']([^"']+)["']`, 'i');
  const m = xml.match(re);
  return m ? m[1].trim() : '';
}
function parseRSSXML(xml, maxItems = 15) {
  const items = [];
  const re = /<(?:item|entry)[^>]*>([\s\S]*?)<\/(?:item|entry)>/gi;
  let m;
  while ((m = re.exec(xml)) !== null && items.length < maxItems) {
    const b = m[1];
    const title   = extractXMLField(b, 'title');
    const link    = extractXMLField(b, 'link') || extractXMLAttr(b, 'link', 'href');
    const pubDate = extractXMLField(b, 'pubDate') || extractXMLField(b, 'published') || extractXMLField(b, 'updated');
    const desc    = extractXMLField(b, 'description') || extractXMLField(b, 'summary');
    if (title) items.push({ title, link, pubDate, description: desc });
  }
  return items;
}

async function fetchRSS(feed, maxItems = 15) {
  const xml = await fetchText(feed.url);
  if (!xml) return [];
  const items = parseRSSXML(xml, maxItems);
  return items
    .map(item => ({
      source:      feed.source,
      tag:         detectTag(item.title, feed.tag),
      headline:    item.title.replace(/<[^>]*>/g, '').trim(),
      url:         item.link || '',
      time:        timeAgo(item.pubDate),
      pubDate:     item.pubDate || new Date().toISOString(),
      critical:    isCritical(item.title),
      description: (item.description || '').replace(/<[^>]*>/g, '').slice(0, 200).trim(),
    }))
    .filter(i => i.headline.length > 10);
}

// ══════════════════════════════════════════════════════════════
// GNEWS
// ══════════════════════════════════════════════════════════════
async function fetchGNews(query, maxItems = 20) {
  if (!GNEWS_KEY) return [];
  const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(query)}&lang=en&max=${maxItems}&apikey=${GNEWS_KEY}&sortby=publishedAt`;
  const raw = await fetchJSON(url, 15000);
  if (!raw?.articles?.length) return [];
  return raw.articles.map(a => ({
    source:      a.source?.name || 'GNews',
    tag:         detectTag(a.title, 'NEWS'),
    headline:    a.title || '',
    url:         a.url   || '',
    time:        timeAgo(a.publishedAt),
    pubDate:     a.publishedAt,
    critical:    isCritical(a.title),
    description: (a.description || '').slice(0, 200),
  }));
}

// ══════════════════════════════════════════════════════════════
// TANKERS (Datalastic AIS)
// ══════════════════════════════════════════════════════════════
async function fetchTankers() {
  if (!DATALASTIC_KEY) return null;
  const mmsiList = TRACKED_TANKERS.map(t => t.mmsi).join(',');
  const url = `https://api.datalastic.com/api/v0/vessel_bulk?api-key=${DATALASTIC_KEY}&mmsi=${mmsiList}`;
  const raw = await fetchJSON(url, 20000);
  if (!raw?.data?.length) return null;
  const statusMap = { 0:'underway',1:'anchored',2:'not under command',3:'restricted',5:'moored',6:'aground' };
  return raw.data.map(v => {
    const meta   = TRACKED_TANKERS.find(t => t.mmsi === String(v.mmsi)) || {};
    const status = statusMap[v.navigational_status ?? v.nav_status] || (parseFloat(v.speed) > 0.5 ? 'underway' : 'anchored');
    return {
      mmsi:        String(v.mmsi),
      name:        v.name    || meta.name || 'UNKNOWN',
      type:        v.type    || meta.type || 'Tanker',
      flag:        meta.flag || '🚢',
      cargo:       'Crude Oil',
      lat:         parseFloat(v.lat || v.latitude  || 0),
      lng:         parseFloat(v.lon || v.longitude || 0),
      speed:       parseFloat(v.speed || 0).toFixed(1),
      course:      v.course || 0,
      status,
      destination: v.destination || '—',
      eta:         v.eta || v.estimated_time_arrival || '—',
      imo:         v.imo || '—',
      updatedAt:   v.timestamp || new Date().toISOString(),
      from:        v.last_port?.name || '—',
      to:          v.destination     || '—',
    };
  });
}

// ══════════════════════════════════════════════════════════════
// UTILS
// ══════════════════════════════════════════════════════════════
function timeAgo(dateStr) {
  try {
    const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (diff < 60)    return `${diff}s ago`;
    if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  } catch { return ''; }
}

function isCritical(text) {
  if (!text) return false;
  const t = text.toLowerCase();
  return ['opec+','opec cut','surge','crash','sanction','attack','war','pipeline shut','explosion',
          'record high','record low','emergency','force majeure','supply disruption'].some(k => t.includes(k));
}

function detectTag(text, fallback = 'NEWS') {
  if (!text) return fallback;
  const t = text.toLowerCase();
  if (t.includes('opec'))                                                                  return 'OPEC';
  if (t.includes('price') || t.includes('brent') || t.includes('wti') || t.includes('barrel')) return 'PRICE';
  if (t.includes('tanker') || t.includes('vlcc') || t.includes('vessel'))                return 'TANKER';
  if (t.includes('lng') || t.includes('natural gas'))                                    return 'LNG';
  if (t.includes('shale') || t.includes('permian'))                                      return 'SHALE';
  if (t.includes('refin'))                                                                return 'REFINERY';
  if (t.includes('pipeline'))                                                             return 'PIPELINE';
  if (t.includes('eia') || t.includes('inventory') || t.includes('stock'))               return 'REPORT';
  if (t.includes('iea') || t.includes('demand') || t.includes('forecast'))               return 'FORECAST';
  return fallback;
}

function dedupeNews(articles) {
  const seen = new Set();
  return articles.filter(a => {
    const key = a.headline.toLowerCase().replace(/\s+/g, ' ').slice(0, 60);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ══════════════════════════════════════════════════════════════
// MAIN HANDLER
// ══════════════════════════════════════════════════════════════
export default async function handler(req, context) {
  const startTime = Date.now();
  const fetchedAt = new Date().toISOString();
  console.log(`[background] ===== START ${fetchedAt} =====`);

  const store  = getStore('crude-radar');
  const errors = [];

  // ── 1. PRICES ────────────────────────────────────────────────
  const prices = {};

  if (!OILPRICE_KEY) {
    console.warn('[prices] OILPRICE_API_KEY not set');
    errors.push('OILPRICE_API_KEY missing');
  } else {
    console.log(`[prices] Fetching ${PRICE_CONTRACTS.length} contracts (latest + 30d history)...`);

   // REPLACE WITH:
    // Sequential fetching — avoids saturating Netlify outbound connections
    for (const c of PRICE_CONTRACTS) {
      if (!prices[c.id]) {
        prices[c.id] = {
          id: c.id, name: c.name, unit: c.unit,
          exchange: c.exchange, flag: c.flag,
          latest: null, history: [], change: null, changePct: null,
        };
      }

      // Fetch latest price
      const latest = await fetchOilPriceLatest(c);
      if (latest) prices[c.id].latest = latest;

      // Small pause between requests to avoid rate limiting
      await new Promise(r => setTimeout(r, 500));

      // Fetch history
      const history = await fetchOilPriceHistory(c);
      if (history?.length) prices[c.id].history = history;

      // Pause between contracts
      await new Promise(r => setTimeout(r, 500));
    }

    // Compute day-over-day change
    for (const p of Object.values(prices)) {
      if (!p.latest?.price || p.history.length < 2) continue;
      const prev = p.history[p.history.length - 2].value;
      const curr = p.latest.price;
      p.change    = parseFloat((curr - prev).toFixed(3));
      p.changePct = parseFloat(((curr - prev) / prev * 100).toFixed(2));
    }

    const live = Object.values(prices).filter(p => p.latest?.price);
    console.log(`[prices] Live: ${live.map(p => `${p.id}=$${p.latest.price}`).join(', ')}`);
  }

  // ── 2. EIA ───────────────────────────────────────────────────
  const eia = {};

  if (!EIA_KEY) {
    console.warn('[eia] EIA_API_KEY not set');
    errors.push('EIA_API_KEY missing');
  } else {
    console.log(`[eia] Fetching ${EIA_SERIES.length} series...`);
    const eiaSettled = await Promise.allSettled(
      EIA_SERIES.map(async s => ({ key: s.key, data: await fetchEIASeries(s) }))
    );
    for (const r of eiaSettled) {
      if (r.status === 'fulfilled' && r.value?.data) eia[r.value.key] = r.value.data;
    }
    console.log(`[eia] Got ${Object.keys(eia).length}/${EIA_SERIES.length} series`);

    // EIA price fallbacks (used when OilPriceAPI key not set)
    if (!prices.wti && eia.wti_spot_monthly?.series?.length) {
      const s = [...eia.wti_spot_monthly.series].reverse();
      prices.wti = { id:'wti', name:'WTI Crude', unit:'USD/bbl', exchange:'EIA/NYMEX', flag:'🇺🇸',
        latest: { price: eia.wti_spot_monthly.latest.value, timestamp: eia.wti_spot_monthly.latest.period },
        history: s.map(d => ({ period: d.period, value: d.value })),
        change: eia.wti_spot_monthly.latest.change, changePct: eia.wti_spot_monthly.latest.changePct };
    }
    if (!prices.brent && eia.brent_spot_monthly?.series?.length) {
      const s = [...eia.brent_spot_monthly.series].reverse();
      prices.brent = { id:'brent', name:'Brent Crude', unit:'USD/bbl', exchange:'EIA/ICE', flag:'🌊',
        latest: { price: eia.brent_spot_monthly.latest.value, timestamp: eia.brent_spot_monthly.latest.period },
        history: s.map(d => ({ period: d.period, value: d.value })),
        change: eia.brent_spot_monthly.latest.change, changePct: eia.brent_spot_monthly.latest.changePct };
    }
    if (!prices.crude_ng && eia.henry_hub_daily?.series?.length) {
      const s = [...eia.henry_hub_daily.series].slice(0, 30).reverse();
      prices.crude_ng = { id:'crude_ng', name:'Natural Gas', unit:'USD/MMBtu', exchange:'EIA/NYMEX', flag:'⚡',
        latest: { price: eia.henry_hub_daily.latest.value, timestamp: eia.henry_hub_daily.latest.period },
        history: s.map(d => ({ period: d.period, value: d.value })),
        change: eia.henry_hub_daily.latest.change, changePct: eia.henry_hub_daily.latest.changePct };
    }
  }

  // ── 3. NEWS ──────────────────────────────────────────────────
  if (!GNEWS_KEY) console.warn('[news] GNEWS_API_KEY not set — RSS only');
  console.log('[news] Fetching...');

  const newsSettled = await Promise.allSettled([
    ...RSS_FEEDS.map(f => fetchRSS(f, 15)),
    ...(GNEWS_KEY ? [fetchGNews('crude oil OPEC barrel price', 20), fetchGNews('oil tanker LNG shipping', 10)] : []),
  ]);

  const allArticles = [];
  for (let i = 0; i < newsSettled.length; i++) {
    const r    = newsSettled[i];
    const name = i < RSS_FEEDS.length ? RSS_FEEDS[i].source : `GNews[${i - RSS_FEEDS.length}]`;
    if (r.status === 'fulfilled' && Array.isArray(r.value)) {
      console.log(`[news] ${name}: ${r.value.length} articles`);
      allArticles.push(...r.value);
    } else {
      console.warn(`[news] ${name}: FAILED — ${r.reason?.message || 'unknown'}`);
    }
  }

  const news = dedupeNews(
    allArticles
      .filter(a => a.pubDate && a.headline?.length > 10)
      .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
  ).slice(0, 50);
  console.log(`[news] Total after dedup: ${news.length}`);

  // ── 4. TANKERS ───────────────────────────────────────────────
  let tankers = null;
  if (DATALASTIC_KEY) {
    console.log('[tankers] Fetching AIS...');
    tankers = await fetchTankers();
    console.log(`[tankers] ${tankers ? tankers.length + ' vessels' : 'FAILED'}`);
  }

  // ── 5. WRITE BLOBS ───────────────────────────────────────────
  const duration_ms = Date.now() - startTime;
  const meta = {
    fetchedAt,
    duration_ms,
    price_contracts_live: Object.values(prices).filter(p => p.latest?.price).map(p => p.id),
    eia_series_fetched:   Object.keys(eia).length,
    news_count:           news.length,
    tankers_live:         tankers ? tankers.length : 0,
    errors,
    next_refresh: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  };

  try {
    await Promise.all([
      store.setJSON('prices',  { fetchedAt, prices }),
      store.setJSON('news',    { fetchedAt, news }),
      store.setJSON('eia',     { fetchedAt, eia }),
      store.setJSON('tankers', { fetchedAt, tankers: tankers || [] }),
      store.setJSON('meta',    meta),
    ]);
    console.log(`[background] ===== DONE in ${duration_ms}ms =====`);
  } catch (e) {
    console.error('[background] Blob write FAILED:', e.message);
    errors.push(`blob: ${e.message}`);
  }

  return new Response(JSON.stringify(meta, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
