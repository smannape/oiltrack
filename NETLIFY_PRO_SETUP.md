# NETLIFY PRO SETUP GUIDE
## Crude Radar — Automatic EIA + OPEC + IEA Data Updates

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│  SCHEDULED FUNCTION  (scheduled-refresh.mjs)                │
│  Cron: 0 * * * *  —  fires every hour automatically         │
│  Execution limit: 10 seconds (just a trigger)               │
│  → Immediately calls the background function and returns    │
└──────────────────────────┬──────────────────────────────────┘
                           │ POST (fire-and-forget)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  BACKGROUND FUNCTION  (fetch-oil-data-background.mjs)       │
│  Execution limit: 15 MINUTES  (Pro plan feature)            │
│                                                             │
│  Fetches simultaneously:                                    │
│  ├── Commodity Price API → 5 futures (WTI, Brent, NG, etc) │
│  ├── EIA API  → 8 data series (weekly + monthly + daily)    │
│  │     crude stocks, production, WTI, Brent, Henry Hub      │
│  │     gasoline stocks, distillate, imports                  │
│  ├── 30 RSS feeds → OilPrice, Rigzone, MEES, Energy Voice  │
│  └── GNews API → 2 targeted queries (oil + tankers)         │
│                                                             │
│  Writes to Netlify Blobs (store: 'crude-radar'):            │
│  ├── 'latest'  — full dataset                               │
│  ├── 'prices'  — price data only  (lightweight)             │
│  ├── 'news'    — news items only  (lightweight)             │
│  ├── 'eia'     — EIA series only                            │
│  └── 'meta'    — status + timestamps                        │
└──────────────────────────┬──────────────────────────────────┘
                           │ written to Netlify Blobs
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  SERVE FUNCTION  (get-oil-data.mjs)                         │
│  GET /api/oil-prices  → prices blob  (fast, small)          │
│  GET /api/oil-news    → news blob    (fast, small)          │
│  GET /api/oil-eia     → EIA blob                            │
│  GET /api/oil-data    → full dataset                        │
│  GET /api/oil-meta    → status check                        │
│  POST /api/oil-refresh → trigger manual background refresh  │
│                                                             │
│  NETLIFY PRO FINE-GRAINED CACHING (SWR):                    │
│  CDN edge: fresh 5 min, stale-while-revalidate 55 min       │
│  Browser:  fresh 2 min, stale-while-revalidate 58 min       │
│  → Near-zero latency for users worldwide                    │
│  → Cache-Tag: 'oil-data' (purgeable on-demand)              │
└──────────────────────────┬──────────────────────────────────┘
                           │ fetched on page load (CDN cached)
                           ▼
┌─────────────────────────────────────────────────────────────┐
│  USER'S BROWSER  (js/app.js + js/api.js)                    │
│  • Split fetches: /api/oil-prices + /api/oil-news in        │
│    parallel → smaller payloads, faster dashboard load       │
│  • Price cards: live WTI, Brent, Nat Gas from Commodity API │
│  • EIA inventory widget: weekly draw/build with WoW change  │
│  • OPEC production from EIA series (authoritative)          │
│  • News feed: 30 RSS feeds + GNews (deduplicated)           │
│  • Production/consumption charts: real EIA monthly history  │
│  • Sidebar: U.S. production, OPEC production, FX rates      │
└─────────────────────────────────────────────────────────────┘
```

---

## Step-by-Step Deployment

### Step 1 — Get API Keys (all free)

| Key | Where to get | Env var name |
|-----|-------------|-------------|
| Commodity Price API | https://omkar.cloud → Sign up free (5,000 req/mo) | `COMMODITY_API_KEY` |
| EIA Open Data | https://www.eia.gov/opendata/register.php | `EIA_API_KEY` |
| GNews | https://gnews.io → Sign up free | `GNEWS_API_KEY` |

RSS feeds (OilPrice, Rigzone, Energy Voice, MEES + 25 more) require **no keys**.
FX rates (ExchangeRate-API) require **no key**.
Map (CARTO + OpenStreetMap) require **no key**.

### Step 2 — Set Environment Variables in Netlify

Netlify Dashboard → **Site settings** → **Environment variables** → **Add variable**

Add all three:
```
COMMODITY_API_KEY  = your_omkarcloud_key_here
EIA_API_KEY        = eia_your_key_here
GNEWS_API_KEY      = your_gnews_key_here
```

Netlify automatically provides `URL` and `DEPLOY_URL` — no need to set these.

### Step 3 — Deploy

**Option A: GitHub (recommended)**
```bash
git init
git add .
git commit -m "feat: Crude Radar v4 - Netlify Pro"
git remote add origin https://github.com/YOUR_USERNAME/crude-radar.git
git push -u origin main
```
Then: Netlify → New site → Import from GitHub → select repo.

**Option B: Netlify CLI**
```bash
npm install
netlify login
netlify deploy --prod
```

**Option C: Drag & drop**
Drag the `crude-radar` folder to app.netlify.com.

### Step 4 — Trigger First Data Fetch

After deploy, the scheduled function runs at the top of the next hour.
To get data immediately:

```bash
# Via curl
curl -X POST https://your-site.netlify.app/api/oil-refresh

# Via browser — just visit this URL
https://your-site.netlify.app/.netlify/functions/fetch-oil-data-background
```

Wait ~60 seconds, then check:
```bash
curl https://your-site.netlify.app/api/oil-meta
```

You should see `"status": "ok"` with `eia_series`, `news_count`, etc.

### Step 5 — Verify Prices

Once data is fetched, the dashboard shows 12 contracts: 5 live from Commodity Price API (WTI, Brent, Nat Gas, Heating Oil, RBOB) + 7 derived from benchmarks (Dubai, OPEC Basket, Urals, WCS, Gasoil, Bonny Light, ESPO). EIA daily data provides price history and serves as fallback if the Commodity API is unavailable.

**Quota management** (free tier: 5,000 requests/month):
- 3 layers of protection: monthly hard cap (4,500 reqs) + daily limit (24 rounds) + hour gap (1h)
- Typical usage: 24 rounds/day × 5 contracts × 31 days = **3,720 requests/month** (~74% of limit)
- Prices update every hour (matching the hourly cron schedule)
- 500-request buffer reserved for retries and manual refreshes
- Failed requests are also counted against quota (they consume API calls)
- Between rounds, cached prices are served from Netlify Blobs
- Monthly counter resets automatically on the 1st of each month
- Hard monthly cap stops all fetches if somehow 4,500 requests are exceeded

---

## Data Update Schedule

| Data | EIA/Source Publishes | Your Site Updates |
|------|---------------------|------------------|
| U.S. crude inventory | Every Wednesday ~10:30 ET | Within 1 hour |
| OPEC production (EIA) | ~last week of following month | Within 1 hour |
| U.S. field production | ~last week of following month | Within 1 hour |
| WTI monthly spot price | ~last week of following month | Within 1 hour |
| Brent monthly spot price | ~last week of following month | Within 1 hour |
| OPEC press releases | On publication | Within 1 hour |
| IEA Oil Market Report | ~2nd week of month | Within 1 hour |
| General O&G news | Continuous | Within 1 hour |

---

## Pro Plan Features Used

| Feature | How it's used |
|---------|-------------|
| **Background Functions (15 min)** | `fetch-oil-data-background.mjs` — fetches 5 commodity prices + 8 EIA series + 30 RSS feeds + GNews simultaneously without timeout |
| **Scheduled Functions** | `scheduled-refresh.mjs` — fires every hour, triggers background function |
| **Netlify Blobs** | Stores 5 blob keys (latest, prices, news, eia, meta) |
| **Fine-Grained Caching (SWR)** | `get-oil-data.mjs` — `Netlify-CDN-Cache-Control: durable` with 5-min fresh + 55-min SWR |
| **Cache Tags** | `oil-data` tag for on-demand purge if needed |
| **25k build minutes** | CI/CD on every Git push |

---

## Monitoring

**Function logs:**
Netlify Dashboard → Functions → `fetch-oil-data-background` → View logs

**Check data freshness:**
```bash
curl https://your-site.netlify.app/api/oil-meta | jq .
```

**Manual refresh anytime:**
```bash
curl -X POST https://your-site.netlify.app/api/oil-refresh
```

**Purge CDN cache (if needed):**
Netlify Dashboard → Deploys → Clear cache and redeploy
Or via API: `curl -X POST "https://api.netlify.com/api/v1/sites/SITE_ID/purge" -H "Authorization: Bearer TOKEN"`
