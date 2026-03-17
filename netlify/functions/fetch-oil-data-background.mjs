// ============================================================
// netlify/functions/fetch-oil-data-background.mjs
//
// Netlify Pro Background Function — up to 15 min execution.
// Triggered hourly by scheduled-refresh.mjs.
// Also: POST /api/oil-refresh for manual trigger.
//
// Fetches:
//   1. OilPriceAPI  — live spot prices + 30-day daily history
//   2. EIA Open Data — 8 series (stocks, production, prices)
//   3. RSS feeds    — OilPrice.com, Rigzone, NGI, Offshore Tech
//   4. GNews        — oil/energy news (if GNEWS_API_KEY set)
//   5. Datalastic   — AIS tanker positions (if DATALASTIC_API_KEY set)
//
// Writes Netlify Blobs (store: 'crude-radar'):
//   prices  — all 12 contracts (6 live + 6 derived)
//   news    — merged deduplicated articles
//   eia     — EIA inventory + production series
//   tankers — AIS vessel positions
//   meta    — run stats, timestamps, errors
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
  { id: 'PET.WCRSTUS1.W',   key: 'us_crude_stocks',     freq: 'weekly',  length: 104 },
  { id: 'PET.WGTSTUS1.W',   key: 'us_gasoline_stocks',  freq: 'weekly',  length: 52  },
  { id: 'PET.WDISTUS1.W',   key: 'us_distillate',       freq: 'weekly',  length: 52  },
  { id: 'PET.WCRRIUS2.W',   key: 'us_crude_imports_w',  freq: 'weekly',  length: 52  },
  { id: 'PET.MCRFPUS2.M',   key: 'us_field_production', freq: 'monthly', length: 60  },
  { id: 'PET.RWTC.M',       key: 'wti_spot_monthly',    freq: 'monthly', length: 60  },
  { id: 'PET.RBRTE.M',      key: 'brent_spot_monthly',  freq: 'monthly', length: 60  },
  { id: 'NG.RNGWHHD.D',     key: 'henry_hub_daily',     freq: 'daily',   length: 90  },
];

// ── RSS FEEDS (confirmed working) ────────────────────────────
const RSS_FEEDS = [
  { url: 'https://oilprice.com/rss/main',                        source: 'OilPrice.com',  tag: 'MARKET' },
  { url: 'https://www.rigzone.com/news/rss/rigzone_latest.aspx', source: 'Rigzone',       tag: 'SUPPLY' },
  { url: 'https://oilprice.com/rss/energy',                      source: 'OilPrice Energy', tag: 'PRICE' },
  { url: 'https://www.naturalgasintel.com/feed/',                source: 'NGI',           tag: 'LNG'    },
  { url: 'https://www.offshore-technology.com/feed/',            source: 'Offshore Tech', tag: 'SUPPLY' },
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

async function fetchJSON(url, timeoutMs = 30000, headers = {}, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { 'Accept': 'application/json', ...headers },
      });
      // Don't retry 404s — resource doesn't exist
      if (res.status === 404) {
        console.warn(`[fetchJSON] 404 (no retry): ${url.slice(0, 90)}`);
        return null;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      console.warn(`[fetchJSON] attempt ${attempt}/${retries}: ${url.slice(0, 90)} → ${e.message}`);
      if (attempt < retries) await new Promise(r => setTimeout(r, 2000 * attempt));
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
  const d = raw.data;
  return {
    price:     parseFloat(d.price),
    timestamp: d.created_at,
    // OilPriceAPI returns 24h change data directly
    change:    d.changes?.['24h']?.amount  ?? null,
    changePct: d.changes?.['24h']?.percent ?? null,
  };
}

async function fetchOilPriceHistory(contract) {
  const url = `https://api.oilpriceapi.com/v1/prices/past_month?by_code=${contract.code}`;
  const raw = await fetchJSON(url, 30000, { 'Authorization': `Token ${OILPRICE_KEY}` });
  if (raw?.status !== 'success' || !raw?.data?.prices?.length) return [];
  // Sort ascending then deduplicate — keep last price per calendar day
  const sorted = raw.data.prices
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const byDay = {};
  sorted.forEach(p => {
    const day = p.created_at.slice(0, 10); // YYYY-MM-DD
    byDay[day] = parseFloat(p.price);      // last tick of day wins
  });
  return Object.entries(byDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, value]) => ({ period, value }));
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
// RSS — direct fetch + native XML parser
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
  const statusMap = { 0:'underway', 1:'anchored', 2:'not under command', 3:'restricted', 5:'moored', 6:'aground' };
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
// DERIVED PRICES
// Computed from live benchmarks using standard market differentials
// ══════════════════════════════════════════════════════════════

function buildDerivedPrices(prices) {
  const brent      = prices.brent?.latest?.price;
  const wti        = prices.wti?.latest?.price;
  const brentHist  = prices.brent?.history || [];
  const wtiHist    = prices.wti?.history   || [];

  if (!brent) {
    console.warn('[derived] No Brent price — skipping derived contracts');
    return;
  }

  // Helper: build a derived contract from base + fixed differential
  function derived(id, name, unit, exchange, flag, basePrice, baseHistory, diff) {
    const price     = parseFloat((basePrice + diff).toFixed(2));
    const prevBase  = baseHistory.length >= 2 ? baseHistory[baseHistory.length - 2].value : null;
    const prevPrice = prevBase !== null ? prevBase + diff : null;
    return {
      id, name, unit, exchange, flag,
      latest:    { price, timestamp: new Date().toISOString() },
      history:   baseHistory.map(h => ({
        period: h.period,
        value:  parseFloat((h.value + diff).toFixed(2)),
      })),
      change:    prevPrice !== null ? parseFloat((price - prevPrice).toFixed(3)) : null,
      changePct: prevPrice !== null ? parseFloat(((price - prevPrice) / prevPrice * 100).toFixed(2)) : null,
      derivedFrom: `${diff >= 0 ? 'Brent +' : 'Brent '}$${diff}`,
    };
  }

  // OPEC Basket — blended member crudes, historically ~$3 below Brent
  prices.opec  = derived('opec',  'OPEC Basket',             'USD/bbl', 'OPEC', '🛢',  brent, brentHist, -3.00);

  // Urals — Russian crude, heavy sanction/war discount vs Brent
  prices.urals = derived('urals', 'Urals Crude',             'USD/bbl', 'OTC',  '🇷🇺', brent, brentHist, -13.50);

  // WCS — Canadian heavy sour crude, large WTI discount
  if (wti) {
    prices.wcs = derived('wcs', 'Western Canadian Select',   'USD/bbl', 'OTC',  '🇨🇦', wti, wtiHist, -18.50);
  }

  // Low Sulphur Gasoil — ICE Gasoil, USD/MT (Brent × 7.45 bbl/MT + crack spread)
  const lcoPrice  = parseFloat((brent * 7.45 + 15).toFixed(2));
  const prevBrent = brentHist.length >= 2 ? brentHist[brentHist.length - 2].value : null;
  const prevLco   = prevBrent !== null ? parseFloat((prevBrent * 7.45 + 15).toFixed(2)) : null;
  prices.lco = {
    id: 'lco', name: 'Low Sulphur Gasoil', unit: 'USD/MT', exchange: 'ICE', flag: '🚢',
    latest:    { price: lcoPrice, timestamp: new Date().toISOString() },
    history:   brentHist.map(h => ({ period: h.period, value: parseFloat((h.value * 7.45 + 15).toFixed(2)) })),
    change:    prevLco !== null ? parseFloat((lcoPrice - prevLco).toFixed(2)) : null,
    changePct: prevLco !== null ? parseFloat(((lcoPrice - prevLco) / prevLco * 100).toFixed(2)) : null,
    derivedFrom: 'Brent × 7.45 + $15',
  };

  // Bonny Light — Nigerian light sweet, premium to Brent
  prices.bonny = derived('bonny', 'Bonny Light',             'USD/bbl', 'OTC',  '🇳🇬', brent, brentHist, +1.80);

  // ESPO Blend — Russian Pacific crude, smaller discount than Urals
  prices.espo  = derived('espo',  'ESPO Blend',              'USD/bbl', 'OTC',  '🇷🇺', brent, brentHist, -4.50);

  const derivedKeys = ['opec','urals','wcs','lco','bonny','espo'];
  console.log(`[derived] ${derivedKeys.map(id => `${id}=$${prices[id]?.latest?.price ?? 'MISSING'}`).join(', ')}`);
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
  return ['opec+','opec cut','surge','crash','sanction','attack','war','pipeline shut',
          'explosion','record high','record low','emergency','force majeure',
          'supply disruption','strait of hormuz'].some(k => t.includes(k));
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

  // ── 1. PRICES (OilPriceAPI) ───────────────────────────────
  const prices = {};

  if (!OILPRICE_KEY) {
    console.warn('[prices] OILPRICE_API_KEY not set');
    errors.push('OILPRICE_API_KEY missing');
  } else {
    console.log(`[prices] Fetching ${PRICE_CONTRACTS.length} contracts (sequential)...`);

    for (const c of PRICE_CONTRACTS) {
      prices[c.id] = {
        id: c.id, name: c.name, unit: c.unit,
        exchange: c.exchange, flag: c.flag,
        latest: null, history: [], change: null, changePct: null,
      };

      // Fetch latest price
      const latest = await fetchOilPriceLatest(c);
      if (latest) {
        prices[c.id].latest    = latest;
        prices[c.id].change    = latest.change    ?? null;
        prices[c.id].changePct = latest.changePct ?? null;
      }

      await new Promise(r => setTimeout(r, 500));

      // Fetch 30-day history (deduplicated to one price per day)
      const history = await fetchOilPriceHistory(c);
      if (history?.length) prices[c.id].history = history;

      await new Promise(r => setTimeout(r, 500));
    }

    const live = Object.values(prices).filter(p => p.latest?.price);
    console.log(`[prices] Live: ${live.map(p => `${p.id}=$${p.latest.price}`).join(', ')}`);
  }

  // ── 2. EIA DATA ───────────────────────────────────────────
  const eia = {};

  if (!EIA_KEY) {
    console.warn('[eia] EIA_API_KEY not set');
    errors.push('EIA_API_KEY missing');
  } else {
    console.log(`[eia] Fetching ${EIA_SERIES.length} series...`);
    const eiaResults = await Promise.allSettled(
      EIA_SERIES.map(async s => ({ key: s.key, data: await fetchEIASeries(s) }))
    );
    for (const r of eiaResults) {
      if (r.status === 'fulfilled' && r.value?.data) eia[r.value.key] = r.value.data;
    }
    console.log(`[eia] Got ${Object.keys(eia).length}/${EIA_SERIES.length} series`);

    // EIA price fallbacks when OilPriceAPI key not set
    if (!prices.wti && eia.wti_spot_monthly?.series?.length) {
      const s = [...eia.wti_spot_monthly.series].reverse();
      prices.wti = {
        id: 'wti', name: 'WTI Crude', unit: 'USD/bbl', exchange: 'EIA/NYMEX', flag: '🇺🇸',
        latest:  { price: eia.wti_spot_monthly.latest.value, timestamp: eia.wti_spot_monthly.latest.period },
        history: s.map(d => ({ period: d.period, value: d.value })),
        change: eia.wti_spot_monthly.latest.change, changePct: eia.wti_spot_monthly.latest.changePct,
      };
    }
    if (!prices.brent && eia.brent_spot_monthly?.series?.length) {
      const s = [...eia.brent_spot_monthly.series].reverse();
      prices.brent = {
        id: 'brent', name: 'Brent Crude', unit: 'USD/bbl', exchange: 'EIA/ICE', flag: '🌊',
        latest:  { price: eia.brent_spot_monthly.latest.value, timestamp: eia.brent_spot_monthly.latest.period },
        history: s.map(d => ({ period: d.period, value: d.value })),
        change: eia.brent_spot_monthly.latest.change, changePct: eia.brent_spot_monthly.latest.changePct,
      };
    }
    if (!prices.crude_ng && eia.henry_hub_daily?.series?.length) {
      const s = [...eia.henry_hub_daily.series].slice(0, 30).reverse();
      prices.crude_ng = {
        id: 'crude_ng', name: 'Natural Gas', unit: 'USD/MMBtu', exchange: 'EIA/NYMEX', flag: '⚡',
        latest:  { price: eia.henry_hub_daily.latest.value, timestamp: eia.henry_hub_daily.latest.period },
        history: s.map(d => ({ period: d.period, value: d.value })),
        change: eia.henry_hub_daily.latest.change, changePct: eia.henry_hub_daily.latest.changePct,
      };
    }
  }

  // ── 3. DERIVED PRICES ─────────────────────────────────────
  // Must run after both OilPriceAPI and EIA so benchmarks are available
  buildDerivedPrices(prices);

  const allContracts = Object.values(prices).filter(p => p.latest?.price);
  console.log(`[prices] Total in blob: ${allContracts.length} — ${allContracts.map(p => p.id).join(', ')}`);

  // ── 4. NEWS (RSS + GNews) ─────────────────────────────────
  if (!GNEWS_KEY) console.warn('[news] GNEWS_API_KEY not set — RSS only');
  console.log('[news] Fetching...');

  const newsResults = await Promise.allSettled([
    ...RSS_FEEDS.map(f => fetchRSS(f, 15)),
    ...(GNEWS_KEY ? [
      fetchGNews('crude oil OPEC barrel price', 20),
      fetchGNews('oil tanker LNG shipping', 10),
    ] : []),
  ]);

  const allArticles = [];
  for (let i = 0; i < newsResults.length; i++) {
    const r    = newsResults[i];
    const name = i < RSS_FEEDS.length ? RSS_FEEDS[i].source : `GNews[${i - RSS_FEEDS.length}]`;
    if (r.status === 'fulfilled' && Array.isArray(r.value)) {
      console.log(`[news] ${name}: ${r.value.length} articles`);
      allArticles.push(...r.value);
    } else {
      console.warn(`[news] ${name}: FAILED`);
    }
  }

  const news = dedupeNews(
    allArticles
      .filter(a => a.pubDate && a.headline?.length > 10)
      .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
  ).slice(0, 50);
  console.log(`[news] Total after dedup: ${news.length}`);

  // ── 5. TANKERS (Datalastic AIS) ───────────────────────────
  let tankers = null;
  if (DATALASTIC_KEY) {
    console.log('[tankers] Fetching AIS...');
    tankers = await fetchTankers();
    console.log(`[tankers] ${tankers ? tankers.length + ' vessels' : 'FAILED'}`);
  }

  // ── 6. WRITE BLOBS ────────────────────────────────────────
  const duration_ms = Date.now() - startTime;
  const meta = {
    fetchedAt,
    duration_ms,
    price_contracts_live: allContracts.map(p => p.id),
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
