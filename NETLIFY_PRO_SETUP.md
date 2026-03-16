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
│  ├── EIA API  → 12 data series (weekly + monthly)           │
│  │     crude stocks, production, OPEC output, WTI, Brent    │
│  │     gasoline stocks, distillate, imports, refinery input │
│  │     Henry Hub gas, non-OPEC production                   │
│  ├── Alpha Vantage → WTI weekly, Brent weekly, Nat Gas      │
│  ├── OPEC.org RSS → official press releases                 │
│  ├── IEA.org RSS → Oil Market Reports                       │
│  ├── OilPrice.com RSS → industry news                       │
│  ├── Rigzone RSS → supply/upstream news                     │
│  ├── Reuters RSS → breaking news filter                     │
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
│  • Price cards: live WTI, Brent, Nat Gas from AV + EIA      │
│  • EIA inventory widget: weekly draw/build with WoW change  │
│  • OPEC production from EIA series (authoritative)          │
│  • News feed: OPEC + IEA official + GNews + 4 RSS sources   │
│  • Production/consumption charts: real EIA monthly history  │
│  • Sidebar: U.S. production, OPEC production, FX rates      │
└─────────────────────────────────────────────────────────────┘
```

---

## Step-by-Step Deployment

### Step 1 — Get API Keys (all free)

| Key | Where to get | Env var name |
|-----|-------------|-------------|
| EIA Open Data | https://www.eia.gov/opendata/register.php | `EIA_API_KEY` |
| Alpha Vantage | https://www.alphavantage.co/support/#api-key | `ALPHA_VANTAGE_KEY` |
| GNews | https://gnews.io → Sign up free | `GNEWS_API_KEY` |

RSS feeds (OPEC, IEA, OilPrice, Reuters, Rigzone) require **no keys**.
FX rates (ExchangeRate-API) require **no key**.
Map (CARTO + OpenStreetMap) require **no key**.

### Step 2 — Set Environment Variables in Netlify

Netlify Dashboard → **Site settings** → **Environment variables** → **Add variable**

Add all three:
```
EIA_API_KEY        = eia_your_key_here
ALPHA_VANTAGE_KEY  = your_av_key_here
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

### Step 5 — Set Browser API Keys (optional, for even fresher prices)

On your live site, click **⚙ API Keys** in the nav bar and enter your Alpha Vantage + GNews keys. These supplement the server-side data with direct browser fetches on each page load.

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
| **Background Functions (15 min)** | `fetch-oil-data-background.mjs` — fetches all 12 EIA series + 5 RSS feeds + GNews simultaneously without timeout |
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
