// ============================================================
// js/eia_charts.js
// EIA Charts page - 4 live charts from EIA API v2
// Requires: Chart.js (already loaded in index.html)
// ============================================================

(function () {
  'use strict';

  var MONO  = "'Share Tech Mono', monospace";
  var GRID  = 'rgba(30,45,69,0.4)';
  var TICK  = '#4a6078';
  var TT    = {
    backgroundColor: '#0e1117',
    borderColor: '#1e2d45',
    borderWidth: 1,
    titleColor: '#ff6b00',
    bodyColor: '#e0e8f0',
    titleFont: { family: MONO, size: 11 },
    bodyFont:  { family: MONO, size: 11 },
  };

  var charts = {};
  var eiaData = null;
  var initialized = false;

  // ?? public init ?????????????????????????????????????????????
  window.initEIAChartsPage = function () {
    if (initialized) return;
    initialized = true;
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        loadAndRender();
      });
    });
  };

  // ?? fetch data from backend ?????????????????????????????????
  function loadAndRender() {
    setStatus('loading');
    fetch('/api/eia-charts')
      .then(function (r) { return r.json(); })
      .then(function (d) {
        eiaData = d;
        if (d.status === 'initializing') {
          setStatus('initializing');
          setTimeout(loadAndRender, 15000);
          return;
        }
        setStatus('ok', d.fetchedAt);
        renderAll(d);
        updateInventoryWidget(d.inventory);
      })
      .catch(function (e) {
        console.error('[eia_charts] fetch error:', e);
        setStatus('error');
      });
  }

  function setStatus(state, fetchedAt) {
    var el = document.getElementById('eia-status-badge');
    if (!el) return;
    if (state === 'loading')      { el.textContent = 'LOADING...';   el.style.color = '#ffb300'; }
    if (state === 'initializing') { el.textContent = 'INITIALIZING'; el.style.color = '#ffb300'; }
    if (state === 'ok') {
      el.textContent = 'EIA LIVE';
      el.style.color = '#00e676';
      if (fetchedAt) {
        var ts = document.getElementById('eia-last-updated');
        if (ts) ts.textContent = 'Updated: ' + new Date(fetchedAt).toUTCString().slice(0, 25);
      }
    }
    if (state === 'error') { el.textContent = 'EIA ERROR'; el.style.color = '#ff1744'; }
  }

  // ?? Landing page inventory widget ???????????????????????????
  function updateInventoryWidget(inv) {
    if (!inv || inv.latest == null) return;

    var valEl  = document.getElementById('inventory-widget-val');
    var subEl  = document.getElementById('inventory-widget-sub');
    var wowEl  = document.getElementById('inventory-widget-wow');
    var yoyEl  = document.getElementById('inventory-widget-yoy');
    var metaEl = document.getElementById('inventory-widget-meta');

    if (valEl)  valEl.textContent  = (inv.latest / 1000).toFixed(1) + 'M';
    if (subEl)  subEl.textContent  = 'bbl - Week of ' + (inv.period || '-');
    if (metaEl) metaEl.textContent = 'EIA - ' + (inv.period || 'latest');

    if (wowEl && inv.wow != null) {
      var sign = inv.wow >= 0 ? '+' : '';
      wowEl.textContent = sign + inv.wow.toFixed(1) + 'M bbl WoW';
      wowEl.style.color = inv.wow >= 0 ? 'var(--accent-orange)' : 'var(--accent-green)';
    }
    if (yoyEl && inv.yoy != null) {
      var sign2 = inv.yoy >= 0 ? '+' : '';
      yoyEl.textContent = sign2 + inv.yoy.toFixed(1) + 'M bbl YoY';
      yoyEl.style.color = inv.yoy >= 0 ? 'var(--accent-orange)' : 'var(--accent-green)';
    }
  }

  // ?? render all 4 charts ??????????????????????????????????????
  function renderAll(d) {
    if (d.invMoM && d.invMoM.length)         renderChart1(d.invMoM, d.crudeStocks);
    if (d.crudeImports && d.crudeImports.series) renderChart2(d.crudeImports);
    if (d.naturalGas && d.naturalGas.prod)   renderChart3(d.naturalGas);
    if (d.oecdStocks && d.oecdStocks.series) renderChart4(d.oecdStocks);
  }

  // ?? CHART 1: Inventory MoM Histogram ????????????????????????
  function renderChart1(invMoM, crudeStocks) {
    destroyChart('eia-chart1-mom');
    destroyChart('eia-chart1-level');

    var slice = invMoM.slice(-13);
    var labels = slice.map(function (d) {
      var p = d.period;
      var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return months[parseInt(p.slice(5, 7), 10) - 1] + ' ' + p.slice(2, 4);
    });
    var moms = slice.map(function (d) { return d.mom; });
    var barColors = moms.map(function (v, i) {
      var isLatest = i === moms.length - 1;
      if (isLatest) return 'rgba(255,179,0,0.85)';
      return v >= 0 ? 'rgba(26,64,96,0.9)' : 'rgba(224,90,90,0.75)';
    });

    var c1 = document.getElementById('eia-chart1-mom');
    if (c1) {
      charts['eia-chart1-mom'] = new Chart(c1, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: 'MoM Change (Mbbl)',
            data: moms,
            backgroundColor: barColors,
            borderColor: barColors.map(function(c) { return c.replace('0.9','1').replace('0.75','1').replace('0.85','1'); }),
            borderWidth: 1,
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: Object.assign({}, TT, {
              callbacks: {
                label: function (ctx) {
                  var v = ctx.parsed.y;
                  return (v >= 0 ? ' +' : ' ') + v.toFixed(1) + ' Mbbl';
                },
              },
            }),
          },
          scales: {
            x: {
              grid: { color: GRID },
              ticks: { color: TICK, font: { family: MONO, size: 9 }, autoSkip: false, maxRotation: 45 },
              border: { color: GRID },
            },
            y: {
              grid: { color: GRID },
              ticks: {
                color: TICK, font: { family: MONO, size: 9 },
                callback: function (v) { return (v >= 0 ? '+' : '') + v + 'M'; },
              },
              border: { color: GRID },
            },
          },
        },
      });
    }

    // Level line chart
    var level = crudeStocks ? crudeStocks.slice(-52) : [];
    var c1b = document.getElementById('eia-chart1-level');
    if (c1b && level.length) {
      var lvlLabels = level.map(function (d) {
        return d.period ? d.period.slice(5) : '';
      });
      charts['eia-chart1-level'] = new Chart(c1b, {
        type: 'line',
        data: {
          labels: lvlLabels,
          datasets: [{
            label: 'US Crude Stocks (Mbbl)',
            data: level.map(function (d) { return parseFloat((d.value / 1000).toFixed(2)); }),
            borderColor: '#ff6b00',
            backgroundColor: 'rgba(255,107,0,0.08)',
            borderWidth: 1.5,
            pointRadius: 0,
            tension: 0.3,
            fill: true,
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: Object.assign({}, TT, {
              callbacks: {
                label: function (ctx) { return ' ' + ctx.parsed.y.toFixed(1) + ' Mbbl'; },
                title: function (items) { return 'Week of ' + items[0].label; },
              },
            }),
          },
          scales: {
            x: {
              grid: { color: GRID },
              ticks: {
                color: TICK, font: { family: MONO, size: 9 },
                maxTicksLimit: 8, maxRotation: 0,
              },
              border: { color: GRID },
            },
            y: {
              grid: { color: GRID },
              ticks: { color: TICK, font: { family: MONO, size: 9 }, callback: function (v) { return v + 'M'; } },
              border: { color: GRID },
            },
          },
        },
      });
    }

    // Update KPI cards
    var latest = invMoM[invMoM.length - 1];
    if (latest) {
      setKpi('eia-inv-latest', latest.value ? (latest.value / 1000).toFixed(1) + 'M' : '-', 'Mbbl latest');
      setKpi('eia-inv-mom', latest.mom != null ? (latest.mom >= 0 ? '+' : '') + latest.mom.toFixed(1) : '-',
        latest.mom >= 0 ? 'Mbbl build' : 'Mbbl draw',
        latest.mom >= 0 ? '#ff6b00' : '#00e676');
    }
    var stocks52 = crudeStocks && crudeStocks.length >= 52 ? crudeStocks.slice(-52) : [];
    if (stocks52.length) {
      var avg = stocks52.reduce(function (s, d) { return s + d.value; }, 0) / stocks52.length;
      var overhang = latest ? (latest.value - avg) : null;
      setKpi('eia-inv-52avg', (avg / 1000).toFixed(1) + 'M', 'Mbbl 52wk avg');
      if (overhang != null) {
        setKpi('eia-inv-overhang',
          (overhang >= 0 ? '+' : '') + (overhang / 1000).toFixed(1) + 'M',
          overhang >= 0 ? 'vs 52wk avg' : 'deficit vs avg',
          overhang >= 0 ? '#ff6b00' : '#00e676');
      }
    }
  }

  // ?? CHART 2: Crude imports by country ???????????????????????
  function renderChart2(imports) {
    destroyChart('eia-chart2-top');
    destroyChart('eia-chart2-trend');

    var series = imports.series || [];
    var periods = imports.periods || [];
    if (!series.length) return;

    // Latest month totals for ranking
    var lastPeriod = periods[periods.length - 1];
    var ranked = series.map(function (s) {
      var last = s.data.find(function (d) { return d.period === lastPeriod; });
      return { country: s.country, value: last ? last.value : 0 };
    }).sort(function (a, b) { return b.value - a.value; }).slice(0, 10);

    var countryColors = {
      'Canada': '#2a7ab0', 'Mexico': '#3a8010', 'Saudi Arabia': '#9a4a10',
      'Iraq': '#7a3010', 'Russia': '#502880', 'Colombia': '#3a7020',
      'Nigeria': '#7a5020', 'Libya': '#5a5020', 'Kuwait': '#8a4010',
      'Ecuador': '#3a6020', 'Brazil': '#2a8040', 'Venezuela': '#803020',
    };
    function getColor(c) { return countryColors[c] || '#3a6080'; }

    // Top-10 horizontal bar (latest month)
    var c2 = document.getElementById('eia-chart2-top');
    if (c2) {
      charts['eia-chart2-top'] = new Chart(c2, {
        type: 'bar',
        data: {
          labels: ranked.map(function (r) { return r.country; }),
          datasets: [{
            label: 'Crude imports (kbd)',
            data: ranked.map(function (r) { return r.value; }),
            backgroundColor: ranked.map(function (r) { return getColor(r.country) + 'bb'; }),
            borderColor: ranked.map(function (r) { return getColor(r.country); }),
            borderWidth: 1,
          }],
        },
        options: {
          indexAxis: 'y',
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: Object.assign({}, TT, {
              callbacks: {
                label: function (ctx) { return ' ' + ctx.parsed.x.toLocaleString() + ' kbd'; },
              },
            }),
          },
          scales: {
            x: {
              grid: { color: GRID },
              ticks: { color: TICK, font: { family: MONO, size: 9 } },
              border: { color: GRID },
            },
            y: {
              grid: { color: 'transparent' },
              ticks: { color: '#8ba3bc', font: { family: MONO, size: 10 } },
              border: { color: GRID },
            },
          },
        },
      });
    }

    // Stacked bar trend (top 6 countries by region)
    var top6 = ranked.slice(0, 6).map(function (r) { return r.country; });
    var recentPeriods = periods.slice(-12);
    var pLabels = recentPeriods.map(function (p) {
      var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return months[parseInt(p.slice(5, 7), 10) - 1] + "'" + p.slice(2, 4);
    });

    var c2b = document.getElementById('eia-chart2-trend');
    if (c2b) {
      var datasets = top6.map(function (country) {
        var s = series.find(function (x) { return x.country === country; });
        return {
          label: country,
          data: recentPeriods.map(function (p) {
            var pt = s && s.data.find(function (d) { return d.period === p; });
            return pt ? pt.value : 0;
          }),
          backgroundColor: getColor(country) + '99',
          borderColor: getColor(country),
          borderWidth: 0.5,
          stack: 'imports',
        };
      });

      charts['eia-chart2-trend'] = new Chart(c2b, {
        type: 'bar',
        data: { labels: pLabels, datasets: datasets },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: {
              display: true,
              position: 'bottom',
              labels: { color: '#8ba3bc', font: { family: MONO, size: 9 }, padding: 8, boxWidth: 10 },
            },
            tooltip: TT,
          },
          scales: {
            x: {
              stacked: true,
              grid: { color: GRID },
              ticks: { color: TICK, font: { family: MONO, size: 9 }, autoSkip: false, maxRotation: 45 },
              border: { color: GRID },
            },
            y: {
              stacked: true,
              grid: { color: GRID },
              ticks: { color: TICK, font: { family: MONO, size: 9 } },
              border: { color: GRID },
            },
          },
        },
      });
    }

    // KPI: top importer + total
    var total = ranked.reduce(function (s, r) { return s + r.value; }, 0);
    setKpi('eia-imp-top', ranked[0] ? ranked[0].country : '-', ranked[0] ? ranked[0].value.toLocaleString() + ' kbd' : '');
    setKpi('eia-imp-total', total.toLocaleString(), 'kbd total imports');
    setKpi('eia-imp-period', lastPeriod || '-', 'latest data period');
    setKpi('eia-imp-sources', series.length + '', 'countries tracked');
  }

  // ?? CHART 3: Natural Gas ?????????????????????????????????????
  function renderChart3(ng) {
    destroyChart('eia-chart3-prodcons');
    destroyChart('eia-chart3-stor');

    var prod = ng.prod || [];
    var cons = ng.cons || [];
    var stor = ng.stor || [];

    // Align prod & cons by period
    var allPeriods = [];
    prod.forEach(function (d) { if (allPeriods.indexOf(d.period) === -1) allPeriods.push(d.period); });
    allPeriods.sort();
    var recent = allPeriods.slice(-18);
    var pLabels = recent.map(function (p) {
      var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return months[parseInt(p.slice(5, 7), 10) - 1] + "'" + p.slice(2, 4);
    });

    function seriesFor(arr, periods) {
      return periods.map(function (p) {
        var found = arr.find(function (d) { return d.period === p; });
        return found ? parseFloat(found.value.toFixed(1)) : null;
      });
    }

    var c3 = document.getElementById('eia-chart3-prodcons');
    if (c3) {
      charts['eia-chart3-prodcons'] = new Chart(c3, {
        type: 'bar',
        data: {
          labels: pLabels,
          datasets: [
            {
              label: 'Production (Bcf)',
              data: seriesFor(prod, recent),
              backgroundColor: 'rgba(0,230,118,0.55)',
              borderColor: '#00e676',
              borderWidth: 1,
              order: 2,
            },
            {
              label: 'Consumption (Bcf)',
              data: seriesFor(cons, recent),
              type: 'line',
              borderColor: '#00b0ff',
              backgroundColor: 'transparent',
              borderWidth: 1.5,
              pointRadius: 2,
              tension: 0.3,
              order: 1,
            },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: {
              display: true,
              position: 'top',
              labels: { color: '#8ba3bc', font: { family: MONO, size: 9 }, padding: 10, boxWidth: 10 },
            },
            tooltip: TT,
          },
          scales: {
            x: {
              grid: { color: GRID },
              ticks: { color: TICK, font: { family: MONO, size: 9 }, autoSkip: false, maxRotation: 45 },
              border: { color: GRID },
            },
            y: {
              grid: { color: GRID },
              ticks: { color: TICK, font: { family: MONO, size: 9 }, callback: function (v) { return v + ' Bcf'; } },
              border: { color: GRID },
            },
          },
        },
      });
    }

    // Storage line chart vs 5yr avg
    var storSlice = stor.slice(-52);
    var storLabels = storSlice.map(function (d) { return d.period ? d.period.slice(5) : ''; });

    var c3b = document.getElementById('eia-chart3-stor');
    if (c3b && storSlice.length) {
      charts['eia-chart3-stor'] = new Chart(c3b, {
        type: 'line',
        data: {
          labels: storLabels,
          datasets: [
            {
              label: 'Working gas (Bcf)',
              data: storSlice.map(function (d) { return d.value; }),
              borderColor: '#e8b84b',
              backgroundColor: 'rgba(232,184,75,0.08)',
              borderWidth: 2,
              pointRadius: 0,
              tension: 0.3,
              fill: false,
            },
            {
              label: '5yr avg (Bcf)',
              data: storSlice.map(function (d) { return d.avg5yr; }),
              borderColor: '#4a6078',
              backgroundColor: 'transparent',
              borderWidth: 1,
              borderDash: [4, 3],
              pointRadius: 0,
              tension: 0.3,
              fill: false,
            },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: {
              display: true,
              position: 'top',
              labels: { color: '#8ba3bc', font: { family: MONO, size: 9 }, padding: 10, boxWidth: 10 },
            },
            tooltip: Object.assign({}, TT, {
              callbacks: {
                label: function (ctx) {
                  return ' ' + ctx.dataset.label + ': ' + (ctx.parsed.y ? ctx.parsed.y.toLocaleString() : '-') + ' Bcf';
                },
              },
            }),
          },
          scales: {
            x: {
              grid: { color: GRID },
              ticks: { color: TICK, font: { family: MONO, size: 9 }, maxTicksLimit: 8 },
              border: { color: GRID },
            },
            y: {
              grid: { color: GRID },
              ticks: { color: TICK, font: { family: MONO, size: 9 }, callback: function (v) { return v.toLocaleString(); } },
              border: { color: GRID },
            },
          },
        },
      });
    }

    // KPI cards
    var lat = ng.latest || {};
    setKpi('eia-ng-prod', lat.prod ? lat.prod.toFixed(1) : '-', 'Bcf prod latest');
    setKpi('eia-ng-cons', lat.cons ? lat.cons.toFixed(1) : '-', 'Bcf cons latest');
    setKpi('eia-ng-stor', lat.stor ? lat.stor.toLocaleString() : '-', 'Bcf in storage');
    var storDelta = lat.storWoW;
    setKpi('eia-ng-storwow',
      storDelta != null ? (storDelta >= 0 ? '+' : '') + storDelta.toFixed(1) : '-',
      storDelta != null ? (storDelta >= 0 ? 'Bcf injection' : 'Bcf withdrawal') : 'WoW change',
      storDelta != null ? (storDelta >= 0 ? '#ff6b00' : '#00e676') : null);
  }

  // ?? CHART 4: OECD Stocks ?????????????????????????????????????
  function renderChart4(oecd) {
    destroyChart('eia-chart4-level');
    destroyChart('eia-chart4-mom');

    var series = oecd.series || [];
    var latest = oecd.latest || {};

    var labels = series.map(function (d) {
      var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      return months[parseInt(d.period.slice(5, 7), 10) - 1] + "'" + d.period.slice(2, 4);
    });

    // Level + 5yr avg line
    var c4 = document.getElementById('eia-chart4-level');
    if (c4) {
      charts['eia-chart4-level'] = new Chart(c4, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [
            {
              label: 'OECD Stocks (Mbbl)',
              data: series.map(function (d) { return d.value; }),
              backgroundColor: 'rgba(26,64,96,0.75)',
              borderColor: '#2a7ab0',
              borderWidth: 1,
              order: 2,
            },
            {
              label: '5yr avg (Mbbl)',
              data: series.map(function (d) { return d.avg5yr; }),
              type: 'line',
              borderColor: '#e8b84b',
              backgroundColor: 'transparent',
              borderWidth: 1.5,
              borderDash: [4, 3],
              pointRadius: 0,
              tension: 0.3,
              order: 1,
            },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: {
              display: true,
              position: 'top',
              labels: { color: '#8ba3bc', font: { family: MONO, size: 9 }, padding: 10, boxWidth: 10 },
            },
            tooltip: Object.assign({}, TT, {
              callbacks: {
                label: function (ctx) {
                  return ' ' + ctx.dataset.label + ': ' + (ctx.parsed.y ? ctx.parsed.y.toLocaleString() : '-') + ' Mbbl';
                },
              },
            }),
          },
          scales: {
            x: {
              grid: { color: GRID },
              ticks: { color: TICK, font: { family: MONO, size: 9 }, autoSkip: false, maxRotation: 45 },
              border: { color: GRID },
            },
            y: {
              grid: { color: GRID },
              ticks: { color: TICK, font: { family: MONO, size: 9 }, callback: function (v) { return v.toLocaleString(); } },
              border: { color: GRID },
            },
          },
        },
      });
    }

    // MoM overhang chart
    var c4b = document.getElementById('eia-chart4-mom');
    if (c4b) {
      var overhangs = series.map(function (d) { return d.overhang; });
      var ovColors = overhangs.map(function (v) {
        return v == null ? '#3a6080' : (v >= 0 ? 'rgba(26,64,96,0.85)' : 'rgba(224,90,90,0.75)');
      });
      charts['eia-chart4-mom'] = new Chart(c4b, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [{
            label: 'vs 5yr avg (Mbbl)',
            data: overhangs,
            backgroundColor: ovColors,
            borderColor: ovColors.map(function (c) { return c.replace('0.85', '1').replace('0.75', '1'); }),
            borderWidth: 1,
          }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: Object.assign({}, TT, {
              callbacks: {
                label: function (ctx) {
                  var v = ctx.parsed.y;
                  return v == null ? ' N/A' : (v >= 0 ? ' +' : ' ') + v.toLocaleString() + ' Mbbl vs avg';
                },
              },
            }),
          },
          scales: {
            x: {
              grid: { color: GRID },
              ticks: { color: TICK, font: { family: MONO, size: 9 }, autoSkip: false, maxRotation: 45 },
              border: { color: GRID },
            },
            y: {
              grid: { color: GRID },
              ticks: {
                color: TICK, font: { family: MONO, size: 9 },
                callback: function (v) { return (v >= 0 ? '+' : '') + v; },
              },
              border: { color: GRID },
            },
          },
        },
      });
    }

    // KPI cards
    setKpi('eia-oecd-level', latest.value ? latest.value.toLocaleString() : '-', 'Mbbl OECD total');
    setKpi('eia-oecd-mom', latest.mom != null ? (latest.mom >= 0 ? '+' : '') + latest.mom.toFixed(1) : '-',
      'Mbbl MoM change',
      latest.mom != null ? (latest.mom >= 0 ? '#ff6b00' : '#00e676') : null);
    setKpi('eia-oecd-5yravg', latest.avg5yr ? latest.avg5yr.toLocaleString() : '-', 'Mbbl 5yr avg');
    setKpi('eia-oecd-overhang',
      latest.overhang != null ? (latest.overhang >= 0 ? '+' : '') + latest.overhang.toFixed(1) : '-',
      latest.overhang != null ? (latest.overhang >= 0 ? 'Mbbl overhang' : 'Mbbl deficit') : 'vs 5yr avg',
      latest.overhang != null ? (latest.overhang >= 0 ? '#ff6b00' : '#00e676') : null);
  }

  // ?? Helpers ?????????????????????????????????????????????????
  function destroyChart(id) {
    if (charts[id]) { charts[id].destroy(); delete charts[id]; }
  }

  function setKpi(id, val, sub, color) {
    var el = document.getElementById(id);
    if (!el) return;
    el.querySelector('.eia-kv').textContent = val;
    el.querySelector('.eia-ks').textContent = sub || '';
    if (color) el.querySelector('.eia-kv').style.color = color;
    else el.querySelector('.eia-kv').style.color = '';
  }

})();
