# 🛢 CRUDE RADAR — Live Oil Market Intelligence v2

Bloomberg Terminal-style global oil dashboard with **real map** (Leaflet + CARTO) and **live API integrations**.

![Bloomberg Terminal Theme](https://img.shields.io/badge/Theme-Bloomberg%20Terminal-orange)
![Leaflet](https://img.shields.io/badge/Map-Leaflet%20%2B%20CARTO-green)
![APIs](https://img.shields.io/badge/APIs-Alpha%20Vantage%20%7C%20EIA%20%7C%20GNews%20%7C%20RSS-blue)

---

## 🗺️ Map (New in v2)

**Leaflet.js + CARTO Dark Matter tiles** — completely free, no API key required.

- ✅ Real interactive world map (zoom, pan, click)
- ✅ Production view: bubble markers sized by Mb/d
- ✅ Consumption view: bubble markers by consumption
- ✅ Tanker view: live vessel positions with popups + shipping lane overlays
- ✅ Click any marker for detailed popup

---

## 🔌 Live API Integrations

| API | Data | Free Tier | Key Required |
|-----|------|-----------|-------------|
| **Alpha Vantage** | WTI, Brent, Nat Gas prices | 25 req/day | ✅ Yes (free) |
| **EIA Open Data** | U.S. crude inventory, production | Unlimited | ✅ Yes (free) |
| **GNews** | Oil & gas news feed | 100 req/day | ✅ Yes (free) |
| **NewsAPI** | Backup news (dev/localhost only) | 100 req/day | ✅ Yes (free) |
| **RSS2JSON** | OilPrice.com, Rigzone RSS | 10k req/mo | ❌ No key |
| **ExchangeRate-API** | USD FX cross rates | 1,500 req/mo | ❌ No key |
| **Open-Meteo** | Tanker route weather | Unlimited | ❌ No key |
| **CARTO + OSM** | Interactive world map | Unlimited | ❌ No key |

### Get Your Free API Keys

1. **Alpha Vantage**: https://www.alphavantage.co/support/#api-key
2. **EIA**: https://www.eia.gov/opendata/register.php
3. **GNews**: https://gnews.io/ → Create free account
4. **NewsAPI**: https://newsapi.org/register (works on localhost/dev)

### Configure Keys in the App

Click **⚙ API Keys** in the navigation bar → enter your keys → click Save.

Keys are saved to your browser's localStorage (never sent to any server).

---

## 🚀 Getting Started

```bash
# Option 1: Open directly (no build needed)
open index.html

# Option 2: Serve locally (required for NewsAPI)
python3 -m http.server 8080
# → http://localhost:8080
```

---

## 📂 File Structure

```
crude-radar/
├── index.html          # Full multi-page app + API config UI
├── css/
│   └── main.css        # Bloomberg Terminal dark theme
├── js/
│   ├── data.js         # Static fallback data (prices, tankers, news)
│   ├── api.js          # Live API integration layer
│   └── app.js          # UI engine, Leaflet map, charts, live updates
├── .github/workflows/  # Auto-deploy to GitHub Pages
└── README.md
```

---

## 📊 Features

| Feature | Status |
|---------|--------|
| Live oil contract prices (12 contracts) | ✅ Simulated + Alpha Vantage |
| Breaking news ticker | ✅ Live via GNews/RSS |
| Leaflet interactive world map | ✅ CARTO dark tiles |
| Tanker tracking with AIS-style data | ✅ Simulated (MarineTraffic API for real) |
| Production map with bubble markers | ✅ Live |
| Consumption map | ✅ Live |
| Oil price charts (6 contracts) | ✅ Simulated history |
| OPEC statistics + compliance table | ✅ Live |
| U.S. crude inventory widget | ✅ EIA Open Data |
| FX rates sidebar | ✅ ExchangeRate-API |
| Oil & Gas news page | ✅ GNews + RSS |
| Live trader chat | ✅ Frontend only |
| Login / signup | ✅ Frontend only |
| API key config panel | ✅ localStorage |

---

## 🚀 Deploy to GitHub Pages

```bash
cd crude-radar
git init && git add . && git commit -m "feat: Crude Radar v2 - live map + APIs"
git remote add origin https://github.com/YOUR_USERNAME/crude-radar.git
git push -u origin main
```

Then: Settings → Pages → Source: `main`. GitHub Actions will auto-deploy.

> **Note**: For production use with real AIS tanker data, integrate [MarineTraffic API](https://www.marinetraffic.com/en/ais-api-services) or [VesselFinder API](https://api.vesselfinder.com/).

---

## ⚠️ Disclaimer

Simulated price data used as fallback. Not financial advice.
