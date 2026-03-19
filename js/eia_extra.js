// js/eia_extra.js  --  EIA Extra Dashboard (6 new charts)
// Called by app.js navigateTo('charts-extra') or button click
// No initialized guard -- app.js eiaExtraInitialized handles that

(function () {
  'use strict';

  var charts  = {};
  var MONO    = "'Share Tech Mono', monospace";
  var GRID    = 'rgba(30,45,69,0.4)';
  var TICK    = '#4a6078';
  var TT = {
    backgroundColor:'#0e1117', borderColor:'#1e2d45', borderWidth:1,
    titleColor:'#ff6b00', bodyColor:'#e0e8f0',
    titleFont:{family:MONO,size:11}, bodyFont:{family:MONO,size:11},
  };

  // ── public entry point ──────────────────────────────────────
  window.initEIAExtraPage = function () {
    setBadge('loading');
    fetch('/api/eia-extra')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.status === 'initializing') {
          setBadge('initializing');
          setTimeout(window.initEIAExtraPage, 8000);
          return;
        }
        setBadge('ok', d.fetchedAt);
        renderChart1(d.crudeProduction  || {});
        renderChart2(d.refineryUtil     || {});
        renderChart3(d.priceForecast    || {});
        renderChart4(d.tradeBalance     || {});
        renderChart5(d.electricityMix   || {});
        updateKPIRow(d);
      })
      .catch(function (e) {
        console.error('[eia_extra] fetch error:', e);
        setBadge('error');
      });
  };

  function setBadge(s, fetchedAt) {
    var el = document.getElementById('eia-extra-badge');
    if (!el) return;
    if (s === 'loading')      { el.textContent = 'LOADING...';   el.style.color = '#ffb300'; return; }
    if (s === 'initializing') { el.textContent = 'INITIALIZING'; el.style.color = '#ffb300'; return; }
    if (s === 'error')        { el.textContent = 'EIA ERROR';    el.style.color = '#ff1744'; return; }
    if (s === 'ok') {
      el.textContent = 'EIA LIVE'; el.style.color = '#00e676';
      var ts = document.getElementById('eia-extra-updated');
      if (ts && fetchedAt) ts.textContent = 'Updated: ' + new Date(fetchedAt).toUTCString().slice(0, 25);
    }
  }

  function kill(id) {
    if (charts[id]) { try { charts[id].destroy(); } catch(e) {} delete charts[id]; }
    var c = document.getElementById(id); if (c) { var ex = Chart.getChart(c); if (ex) ex.destroy(); }
  }

  function setKpi(id, val, sub, color) {
    var el = document.getElementById(id); if (!el) return;
    var kv = el.querySelector('.eia-kv'); var ks = el.querySelector('.eia-ks');
    if (kv) { kv.textContent = val; kv.style.color = color || ''; }
    if (ks && sub) ks.textContent = sub;
  }

  function baseOpts(overrides) {
    return Object.assign({
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: TT },
      scales: {
        x: { grid:{color:GRID}, ticks:{color:TICK,font:{family:MONO,size:9},maxTicksLimit:10,maxRotation:45}, border:{color:GRID} },
        y: { grid:{color:GRID}, ticks:{color:TICK,font:{family:MONO,size:9}}, border:{color:GRID} },
      },
    }, overrides || {});
  }

  function moLabel(period) {
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var m = parseInt((period || '').slice(5, 7), 10) - 1;
    return months[m] + "'" + (period || '').slice(2, 4);
  }

  function wkLabel(period) { return (period || '').slice(5); }

  // ══════════════════════════════════════════════════════════════
  // CHART 1 -- US Crude Production + STEO Forecast
  // ══════════════════════════════════════════════════════════════
  function renderChart1(d) {
    kill('eia-extra-c1');
    var hist = d.history || [];
    var fcst = d.forecast || [];
    var lat  = d.latest || {};

    var allPeriods = hist.map(function(x){return x.period;}).concat(fcst.map(function(x){return x.period;}));
    var labels     = allPeriods.map(moLabel);
    var histLen    = hist.length;

    // Actual: values for hist, null for forecast
    var actual   = hist.map(function(x){return x.value;}).concat(fcst.map(function(){return null;}));
    // Forecast: null for hist, values for forecast (with overlap on last hist point)
    var forecast = hist.map(function(x,i){return i===hist.length-1?x.value:null;}).concat(fcst.map(function(x){return x.value;}));

    var c = document.getElementById('eia-extra-c1');
    if (!c || !hist.length) return;

    charts['eia-extra-c1'] = new Chart(c, {
      type: 'line',
      data: { labels: labels, datasets: [
        { label: 'US crude production (Mbbl/d)',
          data: actual, borderColor: '#4a9ab0', backgroundColor: 'rgba(74,154,176,0.1)',
          borderWidth: 2, pointRadius: 0, tension: 0.3, fill: true },
        { label: 'STEO forecast (Mbbl/d)',
          data: forecast, borderColor: '#e8b84b', backgroundColor: 'rgba(232,184,75,0.06)',
          borderWidth: 1.5, borderDash: [5, 3], pointRadius: 0, tension: 0.3, fill: true },
      ]},
      options: baseOpts({
        plugins: {
          legend: { display: false },
          tooltip: Object.assign({}, TT, { callbacks: {
            label: function(ctx){ return ' ' + ctx.dataset.label + ': ' + ctx.parsed.y.toFixed(2) + ' Mbbl/d'; },
          }}),
          annotation: {},
        },
        scales: {
          x: { grid:{color:GRID}, ticks:{color:TICK,font:{family:MONO,size:9},maxTicksLimit:12,maxRotation:45}, border:{color:GRID} },
          y: { grid:{color:GRID}, ticks:{color:TICK,font:{family:MONO,size:9},callback:function(v){return v.toFixed(1);}}, border:{color:GRID}, min: 10 },
        },
      }),
    });

    setKpi('eia-extra-kpi1a', lat.value ? lat.value.toFixed(2) : '--', 'Mbbl/d latest', '#4a9ab0');
    setKpi('eia-extra-kpi1b', lat.mom != null ? (lat.mom >= 0 ? '+' : '') + lat.mom.toFixed(2) : '--',
      'Mbbl/d MoM', lat.mom != null ? (lat.mom >= 0 ? '#ff6b00' : '#00e676') : null);
    setKpi('eia-extra-kpi1c', fcst.length ? fcst[fcst.length - 1].value.toFixed(1) : '--', 'STEO end-fcst', '#e8b84b');
  }

  // ══════════════════════════════════════════════════════════════
  // CHART 2 -- Refinery Utilization %
  // ══════════════════════════════════════════════════════════════
  function renderChart2(d) {
    kill('eia-extra-c2');
    var pct  = d.pct  || [];
    var lat  = d.latest || {};

    if (!pct.length) return;
    var labels  = pct.map(function(x){ return wkLabel(x.period); });
    var values  = pct.map(function(x){ return x.value; });
    var avg5yr  = pct.map(function(x){ return x.avg5yr; });

    var c = document.getElementById('eia-extra-c2');
    if (!c) return;

    charts['eia-extra-c2'] = new Chart(c, {
      type: 'line',
      data: { labels: labels, datasets: [
        { label: 'Refinery utilization (%)',
          data: values, borderColor: '#4a9030', backgroundColor: 'rgba(74,144,48,0.08)',
          borderWidth: 1.5, pointRadius: 0, tension: 0.3, fill: true },
        { label: '5yr avg (%)',
          data: avg5yr, borderColor: '#4a6078', backgroundColor: 'transparent',
          borderWidth: 1, borderDash: [4, 3], pointRadius: 0, tension: 0.3 },
      ]},
      options: baseOpts({
        scales: {
          x: { grid:{color:GRID}, ticks:{color:TICK,font:{family:MONO,size:9},maxTicksLimit:8,maxRotation:45}, border:{color:GRID} },
          y: { grid:{color:GRID}, ticks:{color:TICK,font:{family:MONO,size:9},callback:function(v){return v.toFixed(1)+'%';}}, border:{color:GRID}, min:75, max:100 },
        },
      }),
    });

    setKpi('eia-extra-kpi2a', lat.pct != null ? lat.pct.toFixed(1) + '%' : '--', 'Latest util.', '#4a9030');
    setKpi('eia-extra-kpi2b', lat.pctWoW != null ? (lat.pctWoW >= 0 ? '+' : '') + lat.pctWoW.toFixed(1) + '%' : '--',
      'WoW change', lat.pctWoW != null ? (lat.pctWoW >= 0 ? '#ff6b00' : '#00e676') : null);
    setKpi('eia-extra-kpi2c', lat.input ? Math.round(lat.input).toLocaleString() : '--', 'kbd net input', '#8ba3bc');
  }

  // ══════════════════════════════════════════════════════════════
  // CHART 3 -- WTI & Brent Price Forecast (STEO)
  // ══════════════════════════════════════════════════════════════
  function renderChart3(d) {
    kill('eia-extra-c3');
    var wtiH = d.wtiHistory  || [];
    var brtH = d.brtHistory  || [];
    var wtiF = d.wtiForecast || [];
    var brtF = d.brtForecast || [];
    var lat  = d.latest || {};

    if (!wtiH.length) return;

    // Merge periods
    var histPeriods = wtiH.map(function(x){return x.period;});
    var fcstPeriods = wtiF.map(function(x){return x.period;});
    var allPeriods  = histPeriods.concat(fcstPeriods);
    var labels      = allPeriods.map(moLabel);

    function buildDs(hist, fcst) {
      var hLen   = hist.length;
      var actual = hist.map(function(x){return x.value;}).concat(fcst.map(function(){return null;}));
      // Overlap at last hist point for visual continuity
      var fcast  = hist.map(function(x,i){return i===hLen-1?x.value:null;}).concat(fcst.map(function(x){return x.value;}));
      return { actual: actual, fcast: fcast };
    }

    var wtiDs = buildDs(wtiH, wtiF);
    var brtDs = buildDs(brtH, brtF);

    var c = document.getElementById('eia-extra-c3');
    if (!c) return;

    charts['eia-extra-c3'] = new Chart(c, {
      type: 'line',
      data: { labels: labels, datasets: [
        { label: 'WTI actual ($/bbl)',   data: wtiDs.actual, borderColor: '#e8b84b', borderWidth: 2, pointRadius: 0, tension: 0.3, backgroundColor:'rgba(232,184,75,0.06)', fill:false },
        { label: 'Brent actual ($/bbl)', data: brtDs.actual, borderColor: '#2a7ab0', borderWidth: 2, pointRadius: 0, tension: 0.3, backgroundColor:'transparent', fill:false },
        { label: 'WTI forecast',   data: wtiDs.fcast, borderColor: '#7a6010', borderWidth: 1.5, borderDash:[5,3], pointRadius: 0, tension: 0.3, backgroundColor:'transparent', fill:false },
        { label: 'Brent forecast', data: brtDs.fcast, borderColor: '#1a4070', borderWidth: 1.5, borderDash:[5,3], pointRadius: 0, tension: 0.3, backgroundColor:'transparent', fill:false },
      ]},
      options: baseOpts({
        scales: {
          x: { grid:{color:GRID}, ticks:{color:TICK,font:{family:MONO,size:9},maxTicksLimit:12,maxRotation:45}, border:{color:GRID} },
          y: { grid:{color:GRID}, ticks:{color:TICK,font:{family:MONO,size:9},callback:function(v){return '$'+Math.round(v);}}, border:{color:GRID} },
        },
      }),
    });

    setKpi('eia-extra-kpi3a', lat.wti ? '$' + lat.wti.toFixed(1) : '--', 'WTI latest', '#e8b84b');
    setKpi('eia-extra-kpi3b', lat.brt ? '$' + lat.brt.toFixed(1) : '--', 'Brent latest', '#2a7ab0');
    setKpi('eia-extra-kpi3c', lat.spread != null ? (lat.spread >= 0 ? '+' : '') + '$' + lat.spread.toFixed(2) : '--', 'Brent-WTI spread', '#8ba3bc');
    setKpi('eia-extra-kpi3d', lat.wtiAvgFcst ? '$' + lat.wtiAvgFcst.toFixed(0) : '--', 'WTI STEO avg fcst', '#7a6010');
  }

  // ══════════════════════════════════════════════════════════════
  // CHART 4 -- US Crude Trade Balance (weekly)
  // ══════════════════════════════════════════════════════════════
  function renderChart4(d) {
    kill('eia-extra-c4');
    var series = d.series || [];
    var lat    = d.latest || {};

    if (!series.length) return;
    var labels  = series.map(function(x){ return wkLabel(x.period); });

    var c = document.getElementById('eia-extra-c4');
    if (!c) return;

    charts['eia-extra-c4'] = new Chart(c, {
      type: 'bar',
      data: { labels: labels, datasets: [
        { type: 'bar',  label: 'Crude exports (kbd)', data: series.map(function(x){return x.exports;}),
          backgroundColor: 'rgba(42,122,176,0.65)', borderColor: '#2a7ab0', borderWidth: 1 },
        { type: 'bar',  label: 'Crude imports (kbd)', data: series.map(function(x){return x.imports ? -x.imports : null;}),
          backgroundColor: 'rgba(224,90,90,0.65)', borderColor: '#e05a5a', borderWidth: 1 },
        { type: 'line', label: 'Net balance (kbd)',   data: series.map(function(x){return x.balance;}),
          borderColor: '#00e676', borderWidth: 2, pointRadius: 0, tension: 0.3, fill: false },
      ]},
      options: baseOpts({
        scales: {
          x: { grid:{color:GRID}, ticks:{color:TICK,font:{family:MONO,size:9},maxTicksLimit:8,maxRotation:45}, border:{color:GRID} },
          y: { grid:{color:GRID}, ticks:{color:TICK,font:{family:MONO,size:9},callback:function(v){return (v>=0?'+':'')+Math.round(v);}}, border:{color:GRID} },
        },
      }),
    });

    setKpi('eia-extra-kpi4a', lat.exports ? Math.round(lat.exports).toLocaleString() : '--', 'kbd exports latest', '#2a7ab0');
    setKpi('eia-extra-kpi4b', lat.imports ? Math.round(lat.imports).toLocaleString() : '--', 'kbd imports latest', '#e05a5a');
    setKpi('eia-extra-kpi4c', lat.balance != null ? (lat.balance >= 0 ? '+' : '') + Math.round(lat.balance).toLocaleString() : '--',
      'kbd net balance', lat.balance != null ? (lat.balance >= 0 ? '#00e676' : '#e05a5a') : null);
  }

  // ══════════════════════════════════════════════════════════════
  // CHART 5 -- US Electricity Generation Mix (stacked bar)
  // ══════════════════════════════════════════════════════════════
  function renderChart5(d) {
    kill('eia-extra-c5');
    var series  = d.series  || {};
    var periods = d.periods || [];
    var lat     = d.latest  || {};

    if (!periods.length) return;
    var labels = periods.map(moLabel);

    var gas   = (series.gas   || []).map(function(x){return x.value;});
    var nuc   = (series.nuclear || []).map(function(x){return x.value;});
    var coal  = (series.coal  || []).map(function(x){return x.value;});
    var wind  = (series.wind  || []).map(function(x){return x.value;});
    var solar = (series.solar || []).map(function(x){return x.value;});
    var hydro = (series.hydro || []).map(function(x){return x.value;});

    var c = document.getElementById('eia-extra-c5');
    if (!c) return;

    charts['eia-extra-c5'] = new Chart(c, {
      type: 'bar',
      data: { labels: labels, datasets: [
        { label: 'Natural gas (GWh)', data: gas,   backgroundColor: 'rgba(232,184,75,0.75)', stack: 'a' },
        { label: 'Nuclear (GWh)',     data: nuc,   backgroundColor: 'rgba(42,122,176,0.75)', stack: 'a' },
        { label: 'Wind (GWh)',        data: wind,  backgroundColor: 'rgba(58,144,80,0.75)',  stack: 'a' },
        { label: 'Solar (GWh)',       data: solar, backgroundColor: 'rgba(224,180,40,0.75)', stack: 'a' },
        { label: 'Coal (GWh)',        data: coal,  backgroundColor: 'rgba(90,90,58,0.75)',   stack: 'a' },
        { label: 'Hydro (GWh)',       data: hydro, backgroundColor: 'rgba(42,112,96,0.75)', stack: 'a' },
      ]},
      options: baseOpts({
        scales: {
          x: { stacked:true, grid:{color:GRID}, ticks:{color:TICK,font:{family:MONO,size:9},maxTicksLimit:8,maxRotation:45}, border:{color:GRID} },
          y: { stacked:true, grid:{color:GRID}, ticks:{color:TICK,font:{family:MONO,size:9},callback:function(v){return Math.round(v).toLocaleString();}}, border:{color:GRID} },
        },
      }),
    });

    setKpi('eia-extra-kpi5a', lat.gasShare != null ? lat.gasShare.toFixed(1) + '%' : '--', 'Natural gas share', '#e8b84b');
    setKpi('eia-extra-kpi5b', lat.renewablesShare != null ? lat.renewablesShare.toFixed(1) + '%' : '--', 'All renewables', '#3a8010');
    setKpi('eia-extra-kpi5c', lat.nuclearShare != null ? lat.nuclearShare.toFixed(1) + '%' : '--', 'Nuclear share', '#2a7ab0');
    setKpi('eia-extra-kpi5d', lat.coalShare != null ? lat.coalShare.toFixed(1) + '%' : '--', 'Coal share', '#5a5a3a');
  }

  // ══════════════════════════════════════════════════════════════
  // Top KPI row update
  // ══════════════════════════════════════════════════════════════
  function updateKPIRow(d) {
    var prod  = (d.crudeProduction || {}).latest || {};
    var ref   = (d.refineryUtil    || {}).latest || {};
    var price = (d.priceForecast   || {}).latest || {};
    var trade = (d.tradeBalance    || {}).latest || {};
    var elec  = (d.electricityMix  || {}).latest || {};

    var rows = [
      ['eia-extra-kpi-prod',   prod.value  ? prod.value.toFixed(2) + ' Mbbl/d'    : '--', 'US crude production', '#4a9ab0'],
      ['eia-extra-kpi-ref',    ref.pct != null ? ref.pct.toFixed(1) + '%'          : '--', 'Refinery util.',      '#4a9030'],
      ['eia-extra-kpi-wti',    price.wti   ? '$' + price.wti.toFixed(1)           : '--', 'WTI (STEO)',          '#e8b84b'],
      ['eia-extra-kpi-brt',    price.brt   ? '$' + price.brt.toFixed(1)           : '--', 'Brent (STEO)',        '#2a7ab0'],
      ['eia-extra-kpi-bal',    trade.balance != null ? (trade.balance>=0?'+':'') + Math.round(trade.balance).toLocaleString() + ' kbd' : '--', 'Trade balance', trade.balance!=null?(trade.balance>=0?'#00e676':'#e05a5a'):null],
      ['eia-extra-kpi-gas',    elec.gasShare != null ? elec.gasShare.toFixed(1) + '%' : '--', 'Gas in grid',     '#e8b84b'],
    ];
    rows.forEach(function(r) { setKpi(r[0], r[1], r[2], r[3]); });
  }

})();
