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
CrudeRadar.tankers = [
  // ── Persian Gulf / Strait of Hormuz ──────────────────────────────────
  { mmsi:'403123001', name:'BAHRI YANBU',        type:'VLCC',    flag:'SA', cargo:'Crude Oil', from:'Ras Tanura',    to:'Rotterdam',  lat:26.60, lng:56.30, status:'anchored', speed:'0.0',  course:0,   eta:'--', imo:'--', destination:'Rotterdam',  vesselClass:'VLCC',    stale:false },
  { mmsi:'403123002', name:'BAHRI JUBAIL',       type:'VLCC',    flag:'SA', cargo:'Crude Oil', from:'Jubail',        to:'Rotterdam',  lat:27.10, lng:56.80, status:'anchored', speed:'0.0',  course:0,   eta:'--', imo:'--', destination:'Rotterdam',  vesselClass:'VLCC',    stale:false },
  { mmsi:'403456003', name:'SIRIUS STAR',        type:'ULCC',    flag:'SA', cargo:'Crude Oil', from:'Ras Tanura',    to:'Waiting',    lat:26.20, lng:57.10, status:'anchored', speed:'0.0',  course:0,   eta:'--', imo:'--', destination:'Waiting',    vesselClass:'ULCC',    stale:false },
  { mmsi:'408456001', name:'ADNOC UMRIQAH',      type:'VLCC',    flag:'AE', cargo:'Crude Oil', from:'Fujairah',      to:'Ruwais',     lat:25.30, lng:55.10, status:'moored',   speed:'0.0',  course:0,   eta:'--', imo:'--', destination:'Ruwais',     vesselClass:'VLCC',    stale:false },
  { mmsi:'408789002', name:'AL DHAFRA',          type:'Aframax', flag:'AE', cargo:'Crude Oil', from:'Jebel Ali',     to:'Singapore',  lat:24.50, lng:54.40, status:'moored',   speed:'0.0',  course:0,   eta:'--', imo:'--', destination:'Singapore',  vesselClass:'Aframax', stale:false },
  { mmsi:'404789001', name:'AL BIDAA',           type:'Suezmax', flag:'KW', cargo:'Crude Oil', from:'Mina Al Ahmadi',to:'Rotterdam',  lat:29.10, lng:48.10, status:'anchored', speed:'0.0',  course:0,   eta:'--', imo:'--', destination:'Rotterdam',  vesselClass:'Suezmax', stale:false },
  { mmsi:'436001001', name:'AL SHUWAIMIYAH',     type:'VLCC',    flag:'BH', cargo:'Crude Oil', from:'Sitra',         to:'Rotterdam',  lat:26.00, lng:50.60, status:'moored',   speed:'0.0',  course:0,   eta:'--', imo:'--', destination:'Rotterdam',  vesselClass:'VLCC',    stale:false },
  { mmsi:'412001001', name:'YUAN HAI',           type:'VLCC',    flag:'CN', cargo:'Crude Oil', from:'Ras Tanura',    to:'Qingdao',    lat:25.80, lng:57.50, status:'underway', speed:'13.5', course:90,  eta:'--', imo:'--', destination:'Qingdao',    vesselClass:'VLCC',    stale:false },
  // ── Gulf of Oman / Arabian Sea ────────────────────────────────────────
  { mmsi:'403456004', name:'SAUDI VISION',       type:'VLCC',    flag:'SA', cargo:'Crude Oil', from:'Ras Tanura',    to:'Rotterdam',  lat:22.10, lng:62.30, status:'underway', speed:'14.5', course:270, eta:'--', imo:'--', destination:'Rotterdam',  vesselClass:'VLCC',    stale:false },
  { mmsi:'419001001', name:'MAHARASHTRA',        type:'Suezmax', flag:'IN', cargo:'Crude Oil', from:'Hormuz',        to:'Mumbai',     lat:22.50, lng:59.80, status:'underway', speed:'9.2',  course:225, eta:'--', imo:'--', destination:'Mumbai',     vesselClass:'Suezmax', stale:false },
  { mmsi:'419002001', name:'JNPT STAR',          type:'Aframax', flag:'IN', cargo:'Crude Oil', from:'Muscat',        to:'Mumbai',     lat:18.70, lng:66.40, status:'underway', speed:'12.1', course:90,  eta:'--', imo:'--', destination:'Mumbai',     vesselClass:'Aframax', stale:false },
  { mmsi:'434001001', name:'AL SALAM',           type:'Suezmax', flag:'OM', cargo:'Crude Oil', from:'Oman',          to:'Rotterdam',  lat:20.30, lng:61.50, status:'underway', speed:'11.8', course:270, eta:'--', imo:'--', destination:'Rotterdam',  vesselClass:'Suezmax', stale:false },
  // ── Red Sea / Gulf of Aden ────────────────────────────────────────────
  { mmsi:'636001001', name:'GLORY TRADER',       type:'Suezmax', flag:'LR', cargo:'Crude Oil', from:'Jeddah',        to:'Rotterdam',  lat:15.20, lng:42.80, status:'underway', speed:'13.8', course:315, eta:'--', imo:'--', destination:'Rotterdam',  vesselClass:'Suezmax', stale:false },
  { mmsi:'636001002', name:'CAPE PIONEER',       type:'VLCC',    flag:'LR', cargo:'Crude Oil', from:'Ras Tanura',    to:'Rerouting',  lat:12.60, lng:43.50, status:'underway', speed:'11.2', course:180, eta:'--', imo:'--', destination:'Cape Route', vesselClass:'VLCC',    stale:false },
  { mmsi:'229883000', name:'HELLESPONT AJAX',    type:'ULCC',    flag:'GR', cargo:'Crude Oil', from:'Kharg Island',  to:'Ulsan',      lat:13.50, lng:48.20, status:'underway', speed:'12.9', course:315, eta:'--', imo:'--', destination:'Ulsan',      vesselClass:'ULCC',    stale:false },
  // ── Indian Ocean ──────────────────────────────────────────────────────
  { mmsi:'538001001', name:'MARSHAL ISLAND',     type:'VLCC',    flag:'MH', cargo:'Crude Oil', from:'Muscat',        to:'Singapore',  lat:5.80,  lng:74.20, status:'underway', speed:'15.2', course:90,  eta:'--', imo:'--', destination:'Singapore',  vesselClass:'VLCC',    stale:false },
  { mmsi:'477123789', name:'PACIFIC ARROW',      type:'Aframax', flag:'HK', cargo:'Crude Oil', from:'Sikka',         to:'Singapore',  lat:8.20,  lng:75.40, status:'underway', speed:'12.5', course:90,  eta:'--', imo:'--', destination:'Singapore',  vesselClass:'Aframax', stale:false },
  { mmsi:'538002001', name:'PACIFIC VOYAGER',    type:'Suezmax', flag:'MH', cargo:'Crude Oil', from:'Oman',          to:'China',      lat:2.50,  lng:83.10, status:'underway', speed:'14.1', course:90,  eta:'--', imo:'--', destination:'Ningbo',     vesselClass:'Suezmax', stale:false },
  // ── Strait of Malacca / Singapore ────────────────────────────────────
  { mmsi:'563001001', name:'MARINA BAY',         type:'Suezmax', flag:'SG', cargo:'Crude Oil', from:'Oman',          to:'Singapore',  lat:2.10,  lng:96.50, status:'underway', speed:'13.7', course:90,  eta:'--', imo:'--', destination:'Singapore',  vesselClass:'Suezmax', stale:false },
  { mmsi:'563002001', name:'SINGAPORE SPIRIT',   type:'Aframax', flag:'SG', cargo:'Crude Oil', from:'Singapore',     to:'Busan',      lat:3.50,  lng:103.8, status:'underway', speed:'12.8', course:45,  eta:'--', imo:'--', destination:'Busan',      vesselClass:'Aframax', stale:false },
  { mmsi:'525001001', name:'INDO MASTER',        type:'Aframax', flag:'ID', cargo:'Crude Oil', from:'Singapore',     to:'Jakarta',    lat:1.20,  lng:104.5, status:'underway', speed:'11.5', course:180, eta:'--', imo:'--', destination:'Jakarta',    vesselClass:'Aframax', stale:false },
  // ── South China Sea ───────────────────────────────────────────────────
  { mmsi:'477001001', name:'HK FORTUNE',         type:'VLCC',    flag:'HK', cargo:'Crude Oil', from:'Singapore',     to:'Ningbo',     lat:10.50, lng:112.3, status:'underway', speed:'14.1', course:45,  eta:'--', imo:'--', destination:'Ningbo',     vesselClass:'VLCC',    stale:false },
  { mmsi:'477001002', name:'HK VIRTUE',          type:'VLCC',    flag:'HK', cargo:'Crude Oil', from:'Oman',          to:'Qingdao',    lat:15.80, lng:115.6, status:'underway', speed:'13.9', course:45,  eta:'--', imo:'--', destination:'Qingdao',    vesselClass:'VLCC',    stale:false },
  { mmsi:'477001003', name:'HK EXCELLENCE',      type:'Suezmax', flag:'HK', cargo:'Crude Oil', from:'Singapore',     to:'Zhoushan',   lat:8.30,  lng:109.2, status:'underway', speed:'12.3', course:45,  eta:'--', imo:'--', destination:'Zhoushan',   vesselClass:'Suezmax', stale:false },
  // ── East Asia (China / Korea / Japan) ────────────────────────────────
  { mmsi:'431001001', name:'NISSHO MARU',        type:'VLCC',    flag:'JP', cargo:'Crude Oil', from:'Singapore',     to:'Tokyo',      lat:31.20, lng:124.5, status:'underway', speed:'15.8', course:45,  eta:'--', imo:'--', destination:'Tokyo',      vesselClass:'VLCC',    stale:false },
  { mmsi:'440001001', name:'KOREA STAR',         type:'VLCC',    flag:'KR', cargo:'Crude Oil', from:'Kuwait',        to:'Ulsan',      lat:33.50, lng:126.8, status:'underway', speed:'14.2', course:45,  eta:'--', imo:'--', destination:'Ulsan',      vesselClass:'VLCC',    stale:false },
  { mmsi:'441178900', name:'KOREA PIONEER',      type:'Aframax', flag:'KR', cargo:'Crude Oil', from:'Nakhodka',      to:'Ulsan',      lat:42.30, lng:133.6, status:'moored',   speed:'0.0',  course:0,   eta:'--', imo:'--', destination:'Ulsan',      vesselClass:'Aframax', stale:false },
  // ── Mediterranean / Europe ────────────────────────────────────────────
  { mmsi:'229001001', name:'AEGEAN GLORY',       type:'Suezmax', flag:'GR', cargo:'Crude Oil', from:'Black Sea',     to:'Augusta',    lat:37.80, lng:21.30, status:'underway', speed:'11.5', course:270, eta:'--', imo:'--', destination:'Augusta',    vesselClass:'Suezmax', stale:false },
  { mmsi:'248001001', name:'MEDI CAGLIARI',      type:'Aframax', flag:'MT', cargo:'Crude Oil', from:'Tripoli',       to:'Tarragona',  lat:38.50, lng:12.80, status:'underway', speed:'12.2', course:315, eta:'--', imo:'--', destination:'Tarragona',  vesselClass:'Aframax', stale:false },
  { mmsi:'311000234', name:'NORDIC BRAVE',       type:'Suezmax', flag:'BS', cargo:'Crude Oil', from:'Sullom Voe',    to:'Rotterdam',  lat:59.20, lng:1.40,  status:'anchored', speed:'0.0',  course:0,   eta:'--', imo:'--', destination:'Rotterdam',  vesselClass:'Suezmax', stale:false },
  { mmsi:'235001001', name:'BRITISH SCULPTOR',   type:'Aframax', flag:'GB', cargo:'Crude Oil', from:'Hound Point',   to:'Rotterdam',  lat:57.80, lng:-0.20, status:'underway', speed:'10.8', course:180, eta:'--', imo:'--', destination:'Rotterdam',  vesselClass:'Aframax', stale:false },
  // ── Atlantic / Americas ───────────────────────────────────────────────
  { mmsi:'636091234', name:'ATLANTIC GLORY',     type:'VLCC',    flag:'LR', cargo:'Crude Oil', from:'Houston',       to:'Rotterdam',  lat:35.60, lng:-40.2, status:'underway', speed:'14.1', course:45,  eta:'--', imo:'--', destination:'Rotterdam',  vesselClass:'VLCC',    stale:false },
  { mmsi:'338001001', name:'EAGLE SAN ANTONIO',  type:'Aframax', flag:'US', cargo:'Crude Oil', from:'Houston',       to:'Rotterdam',  lat:27.50, lng:-91.2, status:'underway', speed:'12.3', course:270, eta:'--', imo:'--', destination:'Rotterdam',  vesselClass:'Aframax', stale:false },
  { mmsi:'710001001', name:'MARAVILHA',          type:'Suezmax', flag:'BR', cargo:'Crude Oil', from:'Santos',        to:'Rotterdam',  lat:-5.80, lng:-35.1, status:'underway', speed:'13.8', course:45,  eta:'--', imo:'--', destination:'Rotterdam',  vesselClass:'Suezmax', stale:false },
  // ── Cape of Good Hope ─────────────────────────────────────────────────
  { mmsi:'636002001', name:'CAPE HARMONY',       type:'VLCC',    flag:'LR', cargo:'Crude Oil', from:'Ras Tanura',    to:'Rotterdam',  lat:-32.50,lng:18.40, status:'underway', speed:'13.2', course:315, eta:'--', imo:'--', destination:'Rotterdam',  vesselClass:'VLCC',    stale:false },
  { mmsi:'636002002', name:'CAPE FREEDOM',       type:'VLCC',    flag:'LR', cargo:'Crude Oil', from:'Kuwait',        to:'Rotterdam',  lat:-28.30,lng:33.50, status:'underway', speed:'14.0', course:315, eta:'--', imo:'--', destination:'Rotterdam',  vesselClass:'VLCC',    stale:false },
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
