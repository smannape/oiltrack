// EI Statistical Review 2024 — Extracted Data
// Auto-generated from EI-Stats-Review-ALL-data.xlsx
// DO NOT EDIT MANUALLY

const EI_DATA = (function() {

  // ── World totals time series (key years 2000-2023) ──────────────────────────
  const WORLD = {
    oil_prod:  {2000:75974,2005:81517,2010:83174,2015:91669,2019:95189,2020:88938,2021:90299,2022:94328,2023:96342},   // kbd
    oil_cons:  {2000:75648,2005:82984,2010:87282,2015:94080,2019:100087,2020:90057,2021:95279,2022:98298,2023:100735}, // kbd
    gas_prod:  {2000:2412,2005:2766,2010:3195,2015:3512,2019:3976,2020:3867,2021:4047,2022:4050,2023:4064},           // Bcm
    gas_cons:  {2000:2423,2005:2770,2010:3192,2015:3497,2019:3994,2020:3870,2021:4023,2022:4006,2023:4015},           // Bcm
    coal_prod: {2000:91.8,2005:122.8,2010:149.7,2015:158.8,2019:160.9,2020:156.6,2021:163.3,2022:174.8,2023:180.3},  // EJ
    elec_gen:  {2000:14880,2005:17474,2010:21564,2015:24255,2019:27282,2020:27017,2021:28544,2022:29204,2023:29963},  // TWh
    co2:       {2000:23509,2005:27226,2010:30316,2015:32286,2019:34344,2020:32368,2021:34016,2022:34597,2023:35024},  // Mt
    renewables:{2000:14.1,2005:16.1,2010:20.8,2015:31.3,2019:41.7,2020:38.3,2021:40.5,2022:43.0,2023:45.3},         // EJ
    solar_gw:  {2015:227,2016:289,2017:385,2018:479,2019:617,2020:724,2021:867,2022:1061,2023:1414},                 // GW
    wind_gw:   {2015:430,2016:489,2017:538,2018:592,2019:651,2020:734,2021:824,2022:903,2023:1020},                  // GW
    nuclear:   {2000:2591,2005:2768,2010:2756,2015:2571,2019:2796,2020:2689,2021:2803,2022:2679,2023:2738},          // TWh
  };

  // ── Spot crude prices ($/bbl annual avg) ────────────────────────────────────
  const PRICES = {
    2000:{brent:28.5,dubai:26.2,wti:30.4},2001:{brent:24.4,dubai:22.8,wti:26.2},
    2002:{brent:25.0,dubai:23.7,wti:26.1},2003:{brent:28.8,dubai:26.8,wti:31.1},
    2004:{brent:38.3,dubai:33.6,wti:41.5},2005:{brent:54.5,dubai:49.4,wti:56.5},
    2006:{brent:65.4,dubai:61.5,wti:66.0},2007:{brent:72.7,dubai:68.4,wti:72.3},
    2008:{brent:97.3,dubai:94.3,wti:99.6},2009:{brent:61.5,dubai:61.7,wti:61.9},
    2010:{brent:79.5,dubai:78.1,wti:79.5},2011:{brent:111.3,dubai:106.2,wti:95.1},
    2012:{brent:111.7,dubai:109.1,wti:94.1},2013:{brent:108.7,dubai:105.1,wti:97.9},
    2014:{brent:99.0,dubai:96.6,wti:93.2},2015:{brent:52.4,dubai:51.2,wti:48.8},
    2016:{brent:44.1,dubai:41.3,wti:43.3},2017:{brent:54.2,dubai:53.1,wti:51.0},
    2018:{brent:71.3,dubai:70.2,wti:65.2},2019:{brent:64.2,dubai:63.7,wti:57.0},
    2020:{brent:41.8,dubai:42.4,wti:39.2},2021:{brent:70.9,dubai:68.9,wti:68.1},
    2022:{brent:101.3,dubai:96.4,wti:94.6},2023:{brent:82.6,dubai:82.1,wti:78.9},
    2024:{brent:80.8,dubai:79.6,wti:75.9},
  };

  // ── Proved reserves ─────────────────────────────────────────────────────────
  const OIL_RESERVES = [
    {name:'Venezuela',      val:303.8, share:17.5, rp:1538},
    {name:'Saudi Arabia',   val:297.5, share:17.2, rp:66},
    {name:'Canada',         val:168.1, share:9.7,  rp:89},
    {name:'Iran',           val:157.8, share:9.1,  rp:null},
    {name:'Iraq',           val:145.0, share:8.4,  rp:91},
    {name:'Russian Fed.',   val:107.8, share:6.2,  rp:27},
    {name:'Kuwait',         val:101.5, share:5.9,  rp:93},
    {name:'UAE',            val:97.8,  share:5.6,  rp:65},
    {name:'US',             val:68.8,  share:4.0,  rp:11},
    {name:'Libya',          val:48.4,  share:2.8,  rp:110},
    {name:'Nigeria',        val:36.9,  share:2.1,  rp:67},
    {name:'Kazakhstan',     val:30.0,  share:1.7,  rp:43},
    {name:'China',          val:26.0,  share:1.5,  rp:18},
    {name:'Qatar',          val:25.2,  share:1.5,  rp:null},
    {name:'Brazil',         val:11.9,  share:0.7,  rp:11},
  ];

  const GAS_RESERVES = [
    {name:'Russian Fed.',   val:37.4, share:19.9, rp:58},
    {name:'Iran',           val:32.1, share:17.1, rp:null},
    {name:'Qatar',          val:24.7, share:13.1, rp:null},
    {name:'Turkmenistan',   val:13.6, share:7.2,  rp:null},
    {name:'US',             val:12.6, share:6.7,  rp:14},
    {name:'China',          val:8.4,  share:4.5,  rp:null},
    {name:'Venezuela',      val:6.3,  share:3.3,  rp:334},
    {name:'Saudi Arabia',   val:6.0,  share:3.2,  rp:null},
    {name:'UAE',            val:5.9,  share:3.1,  rp:null},
    {name:'Nigeria',        val:5.5,  share:2.9,  rp:null},
    {name:'Iraq',           val:3.5,  share:1.9,  rp:null},
    {name:'Azerbaijan',     val:2.5,  share:1.3,  rp:null},
    {name:'Canada',         val:2.4,  share:1.3,  rp:14},
    {name:'Australia',      val:2.4,  share:1.3,  rp:null},
    {name:'Kazakhstan',     val:2.3,  share:1.2,  rp:null},
  ];

  const COAL_RESERVES = [
    {name:'US',             val:248941, share:23.2, rp:514},
    {name:'Russian Fed.',   val:162166, share:15.1, rp:null},
    {name:'Australia',      val:150227, share:14.0, rp:null},
    {name:'China',          val:143197, share:13.3, rp:null},
    {name:'India',          val:111052, share:10.3, rp:null},
    {name:'Germany',        val:35900,  share:3.3,  rp:334},
    {name:'Indonesia',      val:34869,  share:3.2,  rp:null},
    {name:'Ukraine',        val:34375,  share:3.2,  rp:null},
    {name:'Poland',         val:28395,  share:2.6,  rp:282},
    {name:'Kazakhstan',     val:25605,  share:2.4,  rp:null},
    {name:'South Africa',   val:9893,   share:0.9,  rp:null},
    {name:'Colombia',       val:4554,   share:0.4,  rp:90},
    {name:'Canada',         val:6582,   share:0.6,  rp:166},
    {name:'Brazil',         val:6596,   share:0.6,  rp:1396},
    {name:'New Zealand',    val:7575,   share:0.7,  rp:null},
  ];

  // ── Crude oil trade flows 2024 (inter-area, million tonnes) ─────────────────
  // Structure: FLOWS[exporter][importer] = Mt
  const CRUDE_FLOWS = {
    'Canada':          {US:203.1, Europe:5.9, China:9.2, 'Other Asia Pac.':0.6},
    'Mexico':          {US:23.2, Europe:10.5, China:1.0, India:0.3},
    'US':              {Canada:17.7, 'S.&C. America':9.0, Europe:95.8, Africa:2.8, Australasia:0.7, China:9.6, India:6.5, Japan:2.4, Singapore:1.1, 'Other Asia Pac.':3.1},
    'S.&C. America':   {Canada:0.9, US:53.6, Europe:47.2, 'Middle East':1.6, Africa:2.6, China:52.6, India:7.3, Japan:1.1, Singapore:0.7, 'Other Asia Pac.':17.0},
    'Europe':          {US:3.7, 'S.&C. America':0.6, China:4.1, India:0.5},
    'Russia':          {Europe:29.6, 'Other CIS':16.1, 'Middle East':0.5, China:108.5, India:72.3},
    'Other CIS':       {US:1.9, Europe:80.9, 'Middle East':1.7, Africa:0.5, China:2.0},
    'Iraq':            {US:9.9, Europe:38.2, China:63.8, India:49.7, Singapore:0.6, 'Other Asia Pac.':18.3},
    'Kuwait':          {US:1.1, 'Middle East':2.8, China:16.0, India:10.6, Japan:11.2, 'Other Asia Pac.':18.5},
    'Saudi Arabia':    {Canada:2.5, US:13.6, 'S.&C. America':3.2, Europe:38.6, 'Middle East':12.5, Africa:2.6, China:78.6, India:31.0, Japan:46.4, Singapore:3.5, 'Other Asia Pac.':87.9},
    'UAE':             {US:1.9, Europe:1.7, Australasia:0.5, China:35.5, India:35.0, Japan:53.3, Singapore:13.0, 'Other Asia Pac.':42.0},
    'Other Mid. East': {Europe:0.6, 'Middle East':8.9, China:121.5, India:15.8, Japan:5.3, Singapore:1.0, 'Other Asia Pac.':11.0},
    'North Africa':    {US:4.8, 'S.&C. America':1.1, Europe:57.8, 'Middle East':2.0, China:1.8, India:2.6, 'Other Asia Pac.':3.2},
    'West Africa':     {Canada:3.9, US:12.2, 'S.&C. America':6.4, Europe:55.7, 'Middle East':2.6, Africa:5.9, China:46.6, India:20.8, Singapore:1.2, 'Other Asia Pac.':10.5},
  };

  // ── Per-country profiles (for drilldown) ────────────────────────────────────
  const COUNTRY_PROFILES = {
    'Saudi Arabia': {
      flag:'🇸🇦', region:'Middle East', opec:true,
      oil_prod_2023:11261, oil_prod_2020:10826, oil_prod_2015:12014,
      oil_cons_2023:3700, gas_prod_2023:117, oil_reserves:297.5, rp_oil:66,
      gas_reserves:6.0, coal_reserves:0,
      exports_crude_2024:320.6,
      hist_prod:{2015:12014,2016:12403,2017:11950,2018:12287,2019:11832,2020:10826,2021:10848,2022:11541,2023:11261},
    },
    'Russia': {
      flag:'🇷🇺', region:'CIS', opec:false,
      oil_prod_2023:11074, oil_prod_2020:10499, oil_prod_2015:10980,
      oil_cons_2023:3700, gas_prod_2023:616, oil_reserves:107.8, rp_oil:27,
      gas_reserves:37.4, coal_reserves:162166,
      exports_crude_2024:243.1,
      hist_prod:{2015:10980,2016:11227,2017:11257,2018:11438,2019:11537,2020:10499,2021:10779,2022:10958,2023:11074},
    },
    'US': {
      flag:'🇺🇸', region:'North America', opec:false,
      oil_prod_2023:19433, oil_prod_2020:16482, oil_prod_2015:15003,
      oil_cons_2023:20162, gas_prod_2023:1040, oil_reserves:68.8, rp_oil:11,
      gas_reserves:12.6, coal_reserves:248941,
      exports_crude_2024:198.3,
      hist_prod:{2015:15003,2016:14837,2017:15550,2018:17897,2019:19451,2020:16482,2021:17768,2022:18875,2023:19433},
    },
    'Iraq': {
      flag:'🇮🇶', region:'Middle East', opec:true,
      oil_prod_2023:4355, oil_prod_2020:4099, oil_prod_2015:4033,
      oil_cons_2023:900, gas_prod_2023:12, oil_reserves:145.0, rp_oil:91,
      gas_reserves:3.5, coal_reserves:0,
      exports_crude_2024:179.6,
      hist_prod:{2015:4033,2016:4464,2017:4472,2018:4623,2019:4779,2020:4099,2021:4100,2022:4524,2023:4355},
    },
    'UAE': {
      flag:'🇦🇪', region:'Middle East', opec:true,
      oil_prod_2023:4017, oil_prod_2020:3661, oil_prod_2015:3473,
      oil_cons_2023:1100, gas_prod_2023:60, oil_reserves:97.8, rp_oil:65,
      gas_reserves:5.9, coal_reserves:0,
      exports_crude_2024:182.7,
      hist_prod:{2015:3473,2016:3566,2017:3561,2018:3579,2019:3683,2020:3661,2021:2961,2022:3740,2023:4017},
    },
    'Kuwait': {
      flag:'🇰🇼', region:'Middle East', opec:true,
      oil_prod_2023:2902, oil_prod_2020:2671, oil_prod_2015:3108,
      oil_cons_2023:500, gas_prod_2023:17, oil_reserves:101.5, rp_oil:93,
      gas_reserves:1.7, coal_reserves:0,
      exports_crude_2024:60.1,
      hist_prod:{2015:3108,2016:3155,2017:2923,2018:3041,2019:2941,2020:2671,2021:2459,2022:2937,2023:2902},
    },
    'Iran': {
      flag:'🇮🇷', region:'Middle East', opec:true,
      oil_prod_2023:4573, oil_prod_2020:3108, oil_prod_2015:3615,
      oil_cons_2023:1900, gas_prod_2023:262, oil_reserves:157.8, rp_oil:null,
      gas_reserves:32.1, coal_reserves:0,
      exports_crude_2024:80, // estimated
      hist_prod:{2015:3615,2016:4601,2017:4967,2018:4407,2019:3108,2020:3108,2021:3560,2022:4080,2023:4573},
    },
    'Canada': {
      flag:'🇨🇦', region:'North America', opec:false,
      oil_prod_2023:5648, oil_prod_2020:5128, oil_prod_2015:4388,
      oil_cons_2023:2313, gas_prod_2023:190, oil_reserves:168.1, rp_oil:89,
      gas_reserves:2.4, coal_reserves:6582,
      exports_crude_2024:219.4,
      hist_prod:{2015:4388,2016:4464,2017:4813,2018:5244,2019:5371,2020:5128,2021:5414,2022:5575,2023:5648},
    },
    'Nigeria': {
      flag:'🇳🇬', region:'Africa', opec:true,
      oil_prod_2023:1430, oil_prod_2020:1793, oil_prod_2015:2173,
      oil_cons_2023:450, gas_prod_2023:38, oil_reserves:36.9, rp_oil:67,
      gas_reserves:5.5, coal_reserves:0,
      exports_crude_2024:55,
      hist_prod:{2015:2173,2016:1533,2017:1549,2018:1886,2019:1910,2020:1793,2021:1420,2022:1350,2023:1430},
    },
    'China': {
      flag:'🇨🇳', region:'Asia Pacific', opec:false,
      oil_prod_2023:4198, oil_prod_2020:3839, oil_prod_2015:4309,
      oil_cons_2023:15820, gas_prod_2023:235, oil_reserves:26.0, rp_oil:18,
      gas_reserves:8.4, coal_reserves:143197,
      exports_crude_2024:0.9,
      hist_prod:{2015:4309,2016:3999,2017:3846,2018:3798,2019:3841,2020:3839,2021:3989,2022:4110,2023:4198},
    },
    'India': {
      flag:'🇮🇳', region:'Asia Pacific', opec:false,
      oil_prod_2023:861, oil_prod_2020:784, oil_prod_2015:886,
      oil_cons_2023:5762, gas_prod_2023:35, oil_reserves:4.7, rp_oil:14,
      gas_reserves:1.0, coal_reserves:111052,
      exports_crude_2024:0.1,
      hist_prod:{2015:886,2016:875,2017:870,2018:843,2019:830,2020:784,2021:769,2022:793,2023:861},
    },
  };

  return { WORLD, PRICES, OIL_RESERVES, GAS_RESERVES, COAL_RESERVES, CRUDE_FLOWS, COUNTRY_PROFILES };
})();
