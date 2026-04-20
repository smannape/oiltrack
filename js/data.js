// ============================================================
// CRUDE RADAR -- js/data.js
//
// Static reference data for the dashboard.
// Prices and news are intentionally left as placeholders --
// they are replaced at runtime by live Netlify Blob data.
// Only contracts, tankers, production, stats, and ticker
// (fallback) are defined here.
// ============================================================

window.CrudeRadar = window.CrudeRadar || {};

// ── OIL CONTRACTS ─────────────────────────────────────────────
// price / prev are placeholder values shown before live data loads.
// They are overwritten by applyLivePrices() once the Blob is fetched.
CrudeRadar.contracts = [
  { id: 'wti',      label: 'WTI',       name: 'WTI Crude',              price: 0,   prev: 0,   exchange: 'NYMEX', unit: 'USD/bbl',   flag: '🇺🇸' },
  { id: 'brent',    label: 'BRENT',     name: 'Brent Crude',            price: 0,   prev: 0,   exchange: 'ICE',   unit: 'USD/bbl',   flag: '🌊'  },
  { id: 'dubai',    label: 'DUBAI',     name: 'Dubai Crude',            price: 0,   prev: 0,   exchange: 'DME',   unit: 'USD/bbl',   flag: '🇦🇪' },
  { id: 'opec',     label: 'OPEC',      name: 'OPEC Basket',            price: 0,   prev: 0,   exchange: 'OPEC',  unit: 'USD/bbl',   flag: '🛢'  },
  { id: 'urals',    label: 'URALS',     name: 'Urals Crude',            price: 0,   prev: 0,   exchange: 'OTC',   unit: 'USD/bbl',   flag: '🇷🇺' },
  { id: 'wcs',      label: 'WCS',       name: 'Western Canadian Select',price: 0,   prev: 0,   exchange: 'NYMEX', unit: 'USD/bbl',   flag: '🇨🇦' },
  { id: 'crude_ng', label: 'NAT GAS',   name: 'Natural Gas',            price: 0,   prev: 0,   exchange: 'NYMEX', unit: 'USD/MMBtu', flag: '⚡'  },
  { id: 'hho',      label: 'HTNG OIL',  name: 'Heating Oil',            price: 0,   prev: 0,   exchange: 'NYMEX', unit: 'USD/gal',   flag: '🔥'  },
  { id: 'rbob',     label: 'RBOB',      name: 'RBOB Gasoline',          price: 0,   prev: 0,   exchange: 'NYMEX', unit: 'USD/gal',   flag: '⛽'  },
  { id: 'lco',      label: 'LCO',       name: 'Low Sulphur Gasoil',     price: 0,   prev: 0,   exchange: 'ICE',   unit: 'USD/MT',    flag: '🚢'  },
  { id: 'bonny',    label: 'BONNY',     name: 'Bonny Light',            price: 0,   prev: 0,   exchange: 'OTC',   unit: 'USD/bbl',   flag: '🇳🇬' },
  { id: 'espo',     label: 'ESPO',      name: 'ESPO Blend',             price: 0,   prev: 0,   exchange: 'OTC',   unit: 'USD/bbl',   flag: '🇷🇺' },
];

// ── TANKERS (comprehensive static seed -- augmented by live AIS blob) ─
// Covers all major oil shipping lanes globally. Live data from AISstream
// is merged on top; these remain as fallback for regions with poor coverage.
// Note: Persian Gulf vessels may show as anchored/waiting due to Iran conflict
// causing vessels to disable AIS transponders (war risk insurance cancelled March 2026).
CrudeRadar.tankers = [];  // populated at runtime by live AIS (fetch-ais-data-background.mjs)


// ── OIL PRODUCTION (Mb/d) ─────────────────────────────────────
CrudeRadar.production = [
  { country: 'United States', code: 'US', production: 13.1, consumption: 20.4, share: 13.2, company: 'ExxonMobil / Chevron'  },
  { country: 'Russia',        code: 'RU', production: 10.8, consumption: 3.6,  share: 10.9, company: 'Rosneft / Lukoil'       },
  { country: 'Saudi Arabia',  code: 'SA', production: 10.5, consumption: 3.7,  share: 10.6, company: 'Saudi Aramco'            },
  { country: 'Canada',        code: 'CA', production: 5.8,  consumption: 2.4,  share: 5.8,  company: 'Suncor / CNRL'          },
  { country: 'Iraq',          code: 'IQ', production: 4.6,  consumption: 0.9,  share: 4.6,  company: 'SOMO / BP'              },
  { country: 'China',         code: 'CN', production: 4.2,  consumption: 15.8, share: 4.2,  company: 'CNOOC / Sinopec'        },
  { country: 'UAE',           code: 'AE', production: 4.1,  consumption: 1.0,  share: 4.1,  company: 'ADNOC'                  },
  { country: 'Iran',          code: 'IR', production: 3.4,  consumption: 1.8,  share: 3.4,  company: 'NIOC'                   },
  { country: 'Brazil',        code: 'BR', production: 3.3,  consumption: 3.1,  share: 3.3,  company: 'Petrobras'              },
  { country: 'Kuwait',        code: 'KW', production: 2.9,  consumption: 0.5,  share: 2.9,  company: 'KPC'                    },
  { country: 'Mexico',        code: 'MX', production: 1.9,  consumption: 1.7,  share: 1.9,  company: 'Pemex'                  },
  { country: 'Nigeria',       code: 'NG', production: 1.5,  consumption: 0.5,  share: 1.5,  company: 'NNPC'                   },
  { country: 'Kazakhstan',    code: 'KZ', production: 1.9,  consumption: 0.3,  share: 1.9,  company: 'KazMunayGas'            },
  { country: 'Norway',        code: 'NO', production: 1.8,  consumption: 0.2,  share: 1.8,  company: 'Equinor'                },
  { country: 'Libya',         code: 'LY', production: 1.2,  consumption: 0.2,  share: 1.2,  company: 'NOC Libya'              },
];

// ── CONSUMPTION (Mb/d) ────────────────────────────────────────
CrudeRadar.consumption = [
  { country: 'United States', consumption: 20.4 },
  { country: 'China',         consumption: 15.8 },
  { country: 'India',         consumption: 5.3  },
  { country: 'Japan',         consumption: 3.6  },
  { country: 'Russia',        consumption: 3.6  },
  { country: 'Saudi Arabia',  consumption: 3.7  },
  { country: 'South Korea',   consumption: 2.8  },
  { country: 'Brazil',        consumption: 3.1  },
  { country: 'Germany',       consumption: 2.3  },
  { country: 'Canada',        consumption: 2.4  },
];

// ── NEWS (empty -- replaced at runtime by live Blob data) ──────
// Leaving empty prevents stale hardcoded articles from showing.
// The dashboard will show a loading state until the Blob is ready.
CrudeRadar.newsData = [];

// ── TICKER FALLBACK ───────────────────────────────────────────
// Shown on first load before live news arrives.
// updateTickerFromNews() replaces these once news loads.
CrudeRadar.tickerMessages = [
  { text: 'Loading live oil market data...', critical: false },
  { text: 'Connecting to EIA, OPEC, IEA feeds...', critical: false },
  { text: 'Fetching WTI . Brent . Dubai . Natural Gas prices...', critical: false },
];

// ── PRICE HISTORY (placeholder -- replaced by live 30d data) ──
// These flat arrays are what Chart.js reads.
// applyLivePrices() overwrites them with real Commodity API / EIA history.
// Initialised as empty arrays so charts don't throw on first render.
CrudeRadar.priceHistory = {
  wti:     [],
  brent:   [],
  dubai:   [],
  natgas:  [],
  rbob:    [],
  heatoil: [],
};

// Chart labels (dates) -- also replaced by live data
CrudeRadar.chartLabels = [];

// ── STATS DATA ────────────────────────────────────────────────
CrudeRadar.statsData = {
  globalProduction:  101.8,
  globalConsumption: 103.5,
  opecProduction:    26.4,
  opecShare:         25.9,
  globalReserves:    1733,
  opecReserves:      1242,
  yearlyGrowth:      1.0,
  productionVsConsumption: {
    years:       ['2019','2020','2021','2022','2023','2024','2025E'],
    production:  [100.6, 88.4, 96.4, 99.8, 101.7, 102.8, 101.8],
    consumption: [100.3, 91.0, 96.2, 99.5, 101.8, 103.0, 103.5],
  },
  opecVsNonOpec: {
    labels: ['Saudi Arabia','UAE','Iraq','Kuwait','Iran','Venezuela','Nigeria','Libya','Others OPEC',
             'USA','Russia','Canada','China','Brazil','Others'],
    data:   [10.5, 4.1, 4.6, 2.9, 3.4, 0.9, 1.5, 1.2, 1.1, 13.1, 10.8, 5.8, 4.2, 3.3, 34.4],
  },
};
