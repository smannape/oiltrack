// js/eia_charts.js  --  EIA Charts page renderer
// Called by app.js: initEIAChartsPage() on every charts tab activation
// No internal "initialized" guard -- app.js state.eiaChartsInitialized handles that

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

  // ── public entry point ─────────────────────────────────────
  window.initEIAChartsPage = function () {
    setStatus('loading');
    fetch('/api/eia-charts')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.status === 'initializing') {
          setStatus('initializing');
          setTimeout(window.initEIAChartsPage, 8000);
          return;
        }
        setStatus('ok', d.fetchedAt);
        updateInventoryWidget(d.inventory);
        renderChart1(d.invMoM || [], d.crudeStocks || []);
        renderChart2(d.crudeImports || {}, d.importsWeekly || []);
        renderChart3(d.naturalGas || {});
        renderChart4(d.oecdStocks || {});
      })
      .catch(function (e) {
        console.error('[eia_charts] fetch error:', e);
        setStatus('error');
      });
  };

  // ── status badge ───────────────────────────────────────────
  function setStatus(s, fetchedAt) {
    var el = document.getElementById('eia-status-badge');
    if (!el) return;
    if (s === 'loading')      { el.textContent = 'LOADING...';   el.style.color = '#ffb300'; return; }
    if (s === 'initializing') { el.textContent = 'INITIALIZING'; el.style.color = '#ffb300'; return; }
    if (s === 'error')        { el.textContent = 'EIA ERROR';    el.style.color = '#ff1744'; return; }
    if (s === 'ok') {
      el.textContent = 'EIA LIVE'; el.style.color = '#00e676';
      if (fetchedAt) {
        var ts = document.getElementById('eia-last-updated');
        if (ts) ts.textContent = 'Updated: ' + new Date(fetchedAt).toUTCString().slice(0, 25);
      }
    }
  }

  // ── dashboard inventory widget ─────────────────────────────
  function updateInventoryWidget(inv) {
    if (!inv || inv.latest == null) return;
    var set = function (id, txt, color) {
      var el = document.getElementById(id);
      if (el) { el.textContent = txt; if (color) el.style.color = color; }
    };
    set('inventory-widget-val', (inv.latest / 1000).toFixed(1) + 'M');
    set('inventory-widget-sub', 'bbl - Week of ' + (inv.period || '-'));
    set('inventory-widget-meta', 'EIA - ' + (inv.period || 'latest'));
    if (inv.wow != null) {
      var sign = inv.wow >= 0 ? '+' : '';
      set('inventory-widget-wow', sign + inv.wow.toFixed(1) + 'M bbl WoW',
          inv.wow >= 0 ? 'var(--accent-orange)' : 'var(--accent-green)');
    }
    if (inv.yoy != null) {
      var sign2 = inv.yoy >= 0 ? '+' : '';
      set('inventory-widget-yoy', sign2 + inv.yoy.toFixed(1) + 'M bbl YoY',
          inv.yoy >= 0 ? 'var(--accent-orange)' : 'var(--accent-green)');
    }
  }

  // ── destroy helper ─────────────────────────────────────────
  function kill(id) {
    if (charts[id]) { try { charts[id].destroy(); } catch(e) {} delete charts[id]; }
    // Also destroy via Chart.js registry in case of duplicate
    var canvas = document.getElementById(id);
    if (canvas) { var ex = Chart.getChart(canvas); if (ex) ex.destroy(); }
  }

  // ── shared chart options factory ───────────────────────────
  function opts(extra) {
    return Object.assign({
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color:'#8899aa', font:{family:MONO,size:9}, padding:8, boxWidth:10 } },
        tooltip: TT,
      },
      scales: {
        x: { grid:{color:GRID}, ticks:{color:TICK,font:{family:MONO,size:9},maxRotation:45}, border:{color:GRID} },
        y: { grid:{color:GRID}, ticks:{color:TICK,font:{family:MONO,size:9}},               border:{color:GRID} },
      },
    }, extra || {});
  }

  // ── setKpi helper ──────────────────────────────────────────
  function setKpi(id, val, sub, color) {
    var el = document.getElementById(id);
    if (!el) return;
    var kv = el.querySelector('.eia-kv');
    var ks = el.querySelector('.eia-ks');
    if (kv) { kv.textContent = val; if (color) kv.style.color = color; else kv.style.color = ''; }
    if (ks && sub) ks.textContent = sub;
  }

  // ══════════════════════════════════════════════════════════════
  // CHART 1 -- US Crude Inventory MoM histogram
  // ══════════════════════════════════════════════════════════════
  function renderChart1(invMoM, crudeStocks) {
    kill('eia-chart1-mom');
    kill('eia-chart1-level');

    var slice  = invMoM.slice(-13);
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var labels = slice.map(function (d) {
      return months[parseInt(d.period.slice(5,7),10)-1] + " '" + d.period.slice(2,4);
    });
    var moms = slice.map(function (d) { return d.mom; });
    var colors = moms.map(function (v, i) {
      if (i === moms.length-1) return 'rgba(255,179,0,0.85)';
      return v >= 0 ? 'rgba(26,64,96,0.9)' : 'rgba(224,90,90,0.75)';
    });

    var c1 = document.getElementById('eia-chart1-mom');
    if (c1 && slice.length) {
      charts['eia-chart1-mom'] = new Chart(c1, {
        type: 'bar',
        data: { labels: labels, datasets: [{
          label: 'MoM (Mbbl)', data: moms,
          backgroundColor: colors, borderWidth: 1,
        }]},
        options: opts({
          plugins: {
            legend: { display: false },
            tooltip: Object.assign({}, TT, {
              callbacks: { label: function (ctx) { var v=ctx.parsed.y; return (v>=0?'+':'')+v.toFixed(1)+' Mbbl'; } },
            }),
          },
          scales: {
            x: { grid:{color:GRID}, ticks:{color:TICK,font:{family:MONO,size:9},autoSkip:false,maxRotation:45}, border:{color:GRID} },
            y: { grid:{color:GRID}, ticks:{color:TICK,font:{family:MONO,size:9},callback:function(v){return(v>=0?'+':'')+v+'M';}}, border:{color:GRID} },
          },
        }),
      });
    }

    // Level line (52 weeks)
    var level  = crudeStocks.slice(-52);
    var c1b    = document.getElementById('eia-chart1-level');
    if (c1b && level.length) {
      charts['eia-chart1-level'] = new Chart(c1b, {
        type: 'line',
        data: { labels: level.map(function(d){ return d.period ? d.period.slice(5) : ''; }),
          datasets: [{ label:'US Crude Stocks (Mbbl)',
            data: level.map(function(d){ return parseFloat((d.value/1000).toFixed(2)); }),
            borderColor:'#ff6b00', backgroundColor:'rgba(255,107,0,0.08)',
            borderWidth:1.5, pointRadius:0, tension:0.3, fill:true,
          }]},
        options: opts({
          plugins: {
            legend: { display: false },
            tooltip: Object.assign({}, TT, { callbacks: {
              label: function(ctx){ return ' '+ctx.parsed.y.toFixed(1)+' Mbbl'; },
              title: function(items){ return 'Week of '+items[0].label; },
            }}),
          },
          scales: {
            x: { grid:{color:GRID}, ticks:{color:TICK,font:{family:MONO,size:9},maxTicksLimit:8,maxRotation:0}, border:{color:GRID} },
            y: { grid:{color:GRID}, ticks:{color:TICK,font:{family:MONO,size:9},callback:function(v){return v+'M';}}, border:{color:GRID} },
          },
        }),
      });
    }

    // KPIs
    var latest = invMoM[invMoM.length-1];
    if (latest) {
      setKpi('eia-inv-latest', latest.value ? (latest.value/1000).toFixed(1)+'M' : '-', 'Mbbl latest');
      setKpi('eia-inv-mom', latest.mom!=null ? (latest.mom>=0?'+':'')+latest.mom.toFixed(1) : '-',
        latest.mom>=0 ? 'Mbbl build' : 'Mbbl draw', latest.mom>=0 ? '#ff6b00' : '#00e676');
    }
    if (crudeStocks.length >= 52) {
      var s52  = crudeStocks.slice(-52);
      var avg  = s52.reduce(function(s,d){return s+d.value;},0) / s52.length;
      var over = latest ? (latest.value - avg) : null;
      setKpi('eia-inv-52avg', (avg/1000).toFixed(1)+'M', 'Mbbl 52wk avg');
      if (over!=null) setKpi('eia-inv-overhang',
        (over>=0?'+':'')+(over/1000).toFixed(1)+'M',
        over>=0 ? 'above 52wk avg' : 'below 52wk avg', over>=0 ? '#ff6b00' : '#00e676');
    }
  }

  // ══════════════════════════════════════════════════════════════
  // CHART 2 -- Crude imports by country + weekly trend
  // ══════════════════════════════════════════════════════════════
  function renderChart2(imports, importsWeekly) {
    kill('eia-chart2-top');
    kill('eia-chart2-trend');

    var series  = imports.series || [];
    var periods = imports.periods || [];

    // Top-10 horizontal bar (latest available month)
    var lastPeriod = periods[periods.length-1];
    var ranked = series.map(function (s) {
      var last = s.data.find(function(d){ return d.period === lastPeriod; });
      return { country: s.country, value: last ? last.value : 0 };
    }).sort(function(a,b){ return b.value-a.value; }).slice(0,10);

    var cColors = {
      'Canada':'#2a7ab0','Mexico':'#3a8010','Saudi Arabia':'#9a4a10',
      'Iraq':'#7a3010','Russia':'#502880','Colombia':'#3a7020',
      'Nigeria':'#7a5020','Libya':'#5a5020','Kuwait':'#8a4010',
      'Ecuador':'#3a6020','Brazil':'#2a8040','Venezuela':'#803020',
    };
    function col(c){ return cColors[c] || '#3a6080'; }

    var c2 = document.getElementById('eia-chart2-top');
    if (c2 && ranked.length) {
      charts['eia-chart2-top'] = new Chart(c2, {
        type:'bar',
        data:{ labels: ranked.map(function(r){return r.country;}),
          datasets:[{ label:'Crude imports (kbd)',
            data: ranked.map(function(r){return r.value;}),
            backgroundColor: ranked.map(function(r){return col(r.country)+'bb';}),
            borderColor:     ranked.map(function(r){return col(r.country);}),
            borderWidth:1,
          }]},
        options: opts({
          indexAxis:'y',
          plugins:{
            legend:{display:false},
            tooltip: Object.assign({},TT,{callbacks:{label:function(ctx){return ' '+ctx.parsed.x.toLocaleString()+' kbd';}}}),
          },
          scales:{
            x:{ grid:{color:GRID}, ticks:{color:TICK,font:{family:MONO,size:9}}, border:{color:GRID} },
            y:{ grid:{color:'transparent'}, ticks:{color:'#8ba3bc',font:{family:MONO,size:10}}, border:{color:GRID} },
          },
        }),
      });
    }

    // Weekly imports trend line (26 weeks)
    var c2b = document.getElementById('eia-chart2-trend');
    if (c2b && importsWeekly.length > 4) {
      var wSlice  = importsWeekly.slice(-26);
      var wLabels = wSlice.map(function(d){ return d.period ? d.period.slice(5) : ''; });
      charts['eia-chart2-trend'] = new Chart(c2b, {
        type:'line',
        data:{ labels: wLabels, datasets:[{
          label:'US crude imports (kbd)',
          data: wSlice.map(function(d){ return d.value; }),
          borderColor:'#2a7ab0', backgroundColor:'rgba(42,122,176,0.12)',
          borderWidth:2, pointRadius:2, tension:0.3, fill:true,
        }]},
        options: opts({
          plugins:{
            legend:{display:false},
            tooltip: Object.assign({},TT,{callbacks:{label:function(ctx){return ' '+ctx.parsed.y.toLocaleString()+' kbd';}}}),
          },
          scales:{
            x:{ grid:{color:GRID}, ticks:{color:TICK,font:{family:MONO,size:9},maxTicksLimit:10,maxRotation:45}, border:{color:GRID} },
            y:{ grid:{color:GRID}, ticks:{color:TICK,font:{family:MONO,size:9},callback:function(v){return v.toLocaleString();}}, border:{color:GRID} },
          },
        }),
      });
    }

    // KPIs
    if (ranked[0]) setKpi('eia-imp-top', ranked[0].country, ranked[0].value.toLocaleString()+' kbd');
    var total = ranked.reduce(function(s,r){return s+r.value;},0);
    setKpi('eia-imp-total', total.toLocaleString(), 'kbd total imports');
    setKpi('eia-imp-period', lastPeriod || '-', 'country data period');
    if (importsWeekly.length) {
      var latestW = importsWeekly[importsWeekly.length-1];
      setKpi('eia-imp-sources', latestW.value ? latestW.value.toLocaleString() : '-', 'kbd latest week total');
    }
  }

  // ══════════════════════════════════════════════════════════════
  // CHART 3 -- Natural Gas
  // ══════════════════════════════════════════════════════════════
  function renderChart3(ng) {
    kill('eia-chart3-prodcons');
    kill('eia-chart3-stor');

    var prod = ng.prod || [];
    var cons = ng.cons || [];
    var stor = ng.stor || [];

    // Get shared period labels for prod/cons
    var allP = [];
    prod.forEach(function(d){ if(allP.indexOf(d.period)===-1) allP.push(d.period); });
    allP.sort();
    var recent = allP.slice(-18);
    var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var pLabels = recent.map(function(p){
      return months[parseInt(p.slice(5,7),10)-1] + "'" + p.slice(2,4);
    });
    function serFor(arr, periods) {
      return periods.map(function(p){
        var f = arr.find(function(d){return d.period===p;});
        return f ? parseFloat(f.value.toFixed(1)) : null;
      });
    }

    var c3 = document.getElementById('eia-chart3-prodcons');
    if (c3 && recent.length) {
      charts['eia-chart3-prodcons'] = new Chart(c3, {
        type:'bar',
        data:{ labels: pLabels, datasets:[
          { label:'Production (Bcf)', data: serFor(prod,recent), backgroundColor:'rgba(0,230,118,0.55)', borderColor:'#00e676', borderWidth:1, order:2 },
          { type:'line', label:'Consumption (Bcf)', data: serFor(cons,recent), borderColor:'#00b0ff', backgroundColor:'transparent', borderWidth:1.5, pointRadius:2, tension:0.3, order:1 },
        ]},
        options: opts(),
      });
    }

    // Storage vs 5yr avg
    var storSlice  = stor.slice(-52);
    var storLabels = storSlice.map(function(d){ return d.period ? d.period.slice(5) : ''; });
    var c3b = document.getElementById('eia-chart3-stor');
    if (c3b && storSlice.length) {
      charts['eia-chart3-stor'] = new Chart(c3b, {
        type:'line',
        data:{ labels: storLabels, datasets:[
          { label:'Working gas (Bcf)',
            data: storSlice.map(function(d){return d.value;}),
            borderColor:'#e8b84b', backgroundColor:'rgba(232,184,75,0.08)',
            borderWidth:2, pointRadius:0, tension:0.3, fill:false },
          { label:'5yr avg (Bcf)',
            data: storSlice.map(function(d){return d.avg5yr;}),
            borderColor:'#4a6078', backgroundColor:'transparent',
            borderWidth:1, borderDash:[4,3], pointRadius:0, tension:0.3, fill:false },
        ]},
        options: opts({
          scales:{
            x:{ grid:{color:GRID}, ticks:{color:TICK,font:{family:MONO,size:9},maxTicksLimit:8}, border:{color:GRID} },
            y:{ grid:{color:GRID}, ticks:{color:TICK,font:{family:MONO,size:9},callback:function(v){return v.toLocaleString();}}, border:{color:GRID} },
          },
        }),
      });
    }

    // KPIs
    var lat = ng.latest || {};
    setKpi('eia-ng-prod', lat.prod ? lat.prod.toFixed(1) : '-', 'Bcf production');
    setKpi('eia-ng-cons', lat.cons ? lat.cons.toFixed(1) : '-', 'Bcf consumption');
    setKpi('eia-ng-stor', lat.stor ? lat.stor.toLocaleString() : '-', 'Bcf in storage');
    var ww = lat.storWoW;
    setKpi('eia-ng-storwow', ww!=null ? (ww>=0?'+':'')+ww.toFixed(1) : '-',
      ww!=null ? (ww>=0 ? 'Bcf injection' : 'Bcf withdrawal') : 'WoW change',
      ww!=null ? (ww>=0 ? '#ff6b00' : '#00e676') : null);
  }

  // ══════════════════════════════════════════════════════════════
  // CHART 4 -- US Crude Inventory MoM (STEO)
  // ══════════════════════════════════════════════════════════════
  function renderChart4(oecd) {
    kill('eia-chart4-level');
    kill('eia-chart4-mom');

    var series = oecd.series || [];
    var latest = oecd.latest || {};

    var months  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    var labels  = series.map(function(d){
      return months[parseInt(d.period.slice(5,7),10)-1] + "'" + d.period.slice(2,4);
    });

    // Level + 5yr avg
    var c4 = document.getElementById('eia-chart4-level');
    if (c4 && series.length) {
      charts['eia-chart4-level'] = new Chart(c4, {
        type:'bar',
        data:{ labels: labels, datasets:[
          { label:'US Crude Inv. excl SPR (Mbbl)', data: series.map(function(d){return d.value;}),
            backgroundColor:'rgba(26,64,96,0.75)', borderColor:'#2a7ab0', borderWidth:1, order:2 },
          { type:'line', label:'5yr avg (Mbbl)', data: series.map(function(d){return d.avg5yr;}),
            borderColor:'#e8b84b', backgroundColor:'transparent',
            borderWidth:1.5, borderDash:[4,3], pointRadius:0, tension:0.3, order:1 },
        ]},
        options: opts({
          scales:{
            x:{ grid:{color:GRID}, ticks:{color:TICK,font:{family:MONO,size:9},autoSkip:false,maxRotation:45}, border:{color:GRID} },
            y:{ grid:{color:GRID}, ticks:{color:TICK,font:{family:MONO,size:9},callback:function(v){return v.toLocaleString();}}, border:{color:GRID} },
          },
        }),
      });
    }

    // MoM overhang/deficit
    var c4b = document.getElementById('eia-chart4-mom');
    if (c4b && series.length) {
      var overhangs = series.map(function(d){return d.overhang;});
      var oColors   = overhangs.map(function(v){
        return v==null ? '#3a6080' : (v>=0 ? 'rgba(26,64,96,0.85)' : 'rgba(224,90,90,0.75)');
      });
      charts['eia-chart4-mom'] = new Chart(c4b, {
        type:'bar',
        data:{ labels: labels, datasets:[{
          label:'vs 5yr avg (Mbbl)', data: overhangs,
          backgroundColor: oColors, borderColor: oColors.map(function(c){return c.replace('0.85','1').replace('0.75','1');}), borderWidth:1,
        }]},
        options: opts({
          plugins:{
            legend:{display:false},
            tooltip: Object.assign({},TT,{callbacks:{label:function(ctx){var v=ctx.parsed.y; return v==null?' N/A':(v>=0?' +':' ')+v.toLocaleString()+' Mbbl vs avg';}}}),
          },
          scales:{
            x:{ grid:{color:GRID}, ticks:{color:TICK,font:{family:MONO,size:9},autoSkip:false,maxRotation:45}, border:{color:GRID} },
            y:{ grid:{color:GRID}, ticks:{color:TICK,font:{family:MONO,size:9},callback:function(v){return(v>=0?'+':'')+v;}}, border:{color:GRID} },
          },
        }),
      });
    }

    // KPIs
    setKpi('eia-oecd-level',    latest.value  ? latest.value.toLocaleString()  : '-', 'Mbbl US crude excl SPR');
    setKpi('eia-oecd-mom',      latest.mom!=null  ? (latest.mom>=0?'+':'')+latest.mom.toFixed(1)  : '-', 'Mbbl MoM change', latest.mom!=null?(latest.mom>=0?'#ff6b00':'#00e676'):null);
    setKpi('eia-oecd-5yravg',   latest.avg5yr ? latest.avg5yr.toLocaleString() : '-', 'Mbbl 5yr avg');
    setKpi('eia-oecd-overhang', latest.overhang!=null ? (latest.overhang>=0?'+':'')+latest.overhang.toFixed(1) : '-',
      latest.overhang!=null ? (latest.overhang>=0 ? 'Mbbl above avg':'Mbbl below avg') : 'vs 5yr avg',
      latest.overhang!=null ? (latest.overhang>=0?'#ff6b00':'#00e676') : null);
  }

})();
