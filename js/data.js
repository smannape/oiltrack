// ============================================================
// CRUDE RADAR — js/data.js
//
// Static reference data for the dashboard.
// Prices and news are intentionally left as placeholders —
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

// ── TANKERS (static fallback — replaced by Datalastic AIS) ────
CrudeRadar.tankers = [
  { mmsi: '235678901', name: 'GULF STAR I',         type: 'VLCC',    flag: '🇵🇦', cargo: 'Crude Oil', from: 'Ras Tanura',   to: 'Rotterdam', lat: 24.5,  lng: 56.2,   status: 'underway', speed: '13.2', eta: '—' },
  { mmsi: '358201445', name: 'OCEAN TITAN',         type: 'Suezmax', flag: '🇬🇷', cargo: 'Crude Oil', from: 'Basra',        to: 'Trieste',   lat: 12.8,  lng: 45.1,   status: 'underway', speed: '11.8', eta: '—' },
  { mmsi: '477123789', name: 'PACIFIC ARROW',       type: 'Aframax', flag: '🇸🇬', cargo: 'Crude Oil', from: 'Sikka',        to: 'Singapore', lat: 8.2,   lng: 75.4,   status: 'underway', speed: '12.5', eta: '—' },
  { mmsi: '636091234', name: 'ATLANTIC GLORY',      type: 'VLCC',    flag: '🇱🇷', cargo: 'Crude Oil', from: 'Houston',      to: 'Rotterdam', lat: 35.6,  lng: -40.2,  status: 'underway', speed: '14.1', eta: '—' },
  { mmsi: '311000234', name: 'NORDIC BRAVE',        type: 'Suezmax', flag: '🇧🇸', cargo: 'Crude Oil', from: 'Sullom Voe',   to: 'Jurong',    lat: 59.2,  lng: 1.4,    status: 'anchored', speed: '0.0',  eta: '—' },
  { mmsi: '563098712', name: 'PIONEER SPIRIT',      type: 'VLCC',    flag: '🇸🇬', cargo: 'Crude Oil', from: 'Al Jubail',    to: 'Ningbo',    lat: 20.1,  lng: 68.3,   status: 'underway', speed: '13.7', eta: '—' },
  { mmsi: '229883000', name: 'HELLESPONT ACHILLES', type: 'ULCC',    flag: '🇬🇷', cargo: 'Crude Oil', from: 'Kharg Island', to: 'Ulsan',     lat: 15.5,  lng: 62.7,   status: 'underway', speed: '12.9', eta: '—' },
  { mmsi: '441178900', name: 'KOREA PIONEER',       type: 'Aframax', flag: '🇰🇷', cargo: 'Crude Oil', from: 'Nakhodka',     to: 'Ulsan',     lat: 42.3,  lng: 133.6,  status: 'moored',   speed: '0.0',  eta: '—' },
];

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

// ── NEWS (empty — replaced at runtime by live Blob data) ──────
// Leaving empty prevents stale hardcoded articles from showing.
// The dashboard will show a loading state until the Blob is ready.
CrudeRadar.newsData = [];

// ── TICKER FALLBACK ───────────────────────────────────────────
// Shown on first load before live news arrives.
// updateTickerFromNews() replaces these once news loads.
CrudeRadar.tickerMessages = [
  { text: 'Loading live oil market data...', critical: false },
  { text: 'Connecting to EIA, OPEC, IEA feeds...', critical: false },
  { text: 'Fetching WTI · Brent · Dubai · Natural Gas prices...', critical: false },
];

// ── PRICE HISTORY (placeholder — replaced by live 30d data) ──
// These flat arrays are what Chart.js reads.
// applyLivePrices() overwrites them with real OilPriceAPI history.
// Initialised as empty arrays so charts don't throw on first render.
CrudeRadar.priceHistory = {
  wti:     [],
  brent:   [],
  dubai:   [],
  natgas:  [],
  rbob:    [],
  heatoil: [],
};

// Chart labels (dates) — also replaced by live data
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
