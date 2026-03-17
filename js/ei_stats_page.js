// ============================================================
// EI STATISTICS PAGE + COUNTRY DRILLDOWN
// Requires: ei_stats_data.js (EI_DATA), Chart.js
// ============================================================

(function() {
  'use strict';

  const MONO    = "'Share Tech Mono', monospace";
  const GRID    = 'rgba(30,45,69,0.4)';
  const TICK    = '#4a6078';
  const TOOLTIP = { backgroundColor:'#0e1117', borderColor:'#1e2d45', borderWidth:1,
                    titleColor:'#ff6b00', bodyColor:'#e0e8f0',
                    titleFont:{family:MONO,size:11}, bodyFont:{family:MONO,size:11} };

  // ── colour palettes ──────────────────────────────────────────────────────────
  const C_OIL    = 'rgba(255,107,0,0.75)';
  const C_CONS   = 'rgba(0,176,255,0.55)';
  const C_BRENT  = '#ff6b00';
  const C_WTI    = '#00b0ff';
  const C_DUBAI  = '#ffd700';
  const C_GAS    = 'rgba(0,230,118,0.65)';
  const C_COAL   = 'rgba(180,130,60,0.75)';
  const C_ELEC   = 'rgba(0,176,255,0.65)';
  const C_SOLAR  = '#ffd700';
  const C_WIND   = '#4ec94e';
  const C_CO2    = 'rgba(255,50,50,0.7)';
  const C_NUC    = 'rgba(200,100,255,0.65)';

  const REGION_COLORS = {
    'Middle East':'#c05010','S. & Cent. America':'#3a8010',
    'North America':'#1060a0','CIS (inc. Russia)':'#502880',
    'Africa':'#b07010','Europe':'#2040a0','Asia Pacific':'#107060',
  };

  function mkOpts(extra) {
    return Object.assign({
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ labels:{ color:'#8899aa', font:{family:MONO,size:10}, padding:10, boxWidth:10 } }, tooltip:TOOLTIP },
      scales:{ x:{ grid:{color:GRID}, ticks:{color:TICK,font:{family:MONO,size:9},maxRotation:45}, border:{color:GRID} },
               y:{ grid:{color:GRID}, ticks:{color:TICK,font:{family:MONO,size:9}},             border:{color:GRID} } },
    }, extra);
  }

  function getYears(from, to) {
    const W = window.EI_DATA.WORLD;
    const allYears = Object.keys(W.oil_prod).map(Number).filter(y => y >= from && y <= to).sort((a,b)=>a-b);
    return allYears;
  }

  function worldSeries(key, years) {
    const src = window.EI_DATA.WORLD[key] || {};
    return years.map(y => {
      const v = src[y] ?? src[String(y)] ?? null;
      return v;
    });
  }

  // ============================================================
  // STATISTICS PAGE
  // ============================================================
  let statsInit = false;

  window.initEIStatsPage = function() {
    if (statsInit) return;
    if (!window.EI_DATA) { console.error('EI_DATA not loaded'); return; }
    statsInit = true;

    const years = getYears(2000, 2023);
    const yLabels = years.map(String);

    // Oil Prod vs Cons
    const pvs = document.getElementById('ei-chart-oil-prodcons');
    if (pvs) new Chart(pvs, { type:'bar', data:{
      labels: yLabels,
      datasets:[
        { label:'Production (kbd)',  data: worldSeries('oil_prod', years).map(v=>v?+(v/1000).toFixed(1):null), backgroundColor:C_OIL,  borderWidth:0 },
        { label:'Consumption (kbd)', data: worldSeries('oil_cons', years).map(v=>v?+(v/1000).toFixed(1):null), backgroundColor:C_CONS, borderWidth:0 },
      ]
    }, options: mkOpts({ scales:{ x:{ grid:{color:GRID}, ticks:{color:TICK,font:{family:MONO,size:9},maxRotation:45}, border:{color:GRID} }, y:{ grid:{color:GRID}, ticks:{color:TICK,font:{family:MONO,size:9},callback:v=>v+'k'}, border:{color:GRID} } } }) });

    // Spot prices
    const pc = document.getElementById('ei-chart-prices');
    if (pc) {
      const pyears = Object.keys(window.EI_DATA.PRICES).map(Number).filter(y=>y>=2000).sort((a,b)=>a-b);
      new Chart(pc, { type:'line', data:{
        labels: pyears.map(String),
        datasets:[
          { label:'Brent', data:pyears.map(y=>window.EI_DATA.PRICES[y]?.brent), borderColor:C_BRENT, backgroundColor:'transparent', borderWidth:1.5, pointRadius:0, tension:0.3 },
          { label:'WTI',   data:pyears.map(y=>window.EI_DATA.PRICES[y]?.wti),   borderColor:C_WTI,   backgroundColor:'transparent', borderWidth:1.5, pointRadius:0, tension:0.3 },
          { label:'Dubai', data:pyears.map(y=>window.EI_DATA.PRICES[y]?.dubai), borderColor:C_DUBAI, backgroundColor:'transparent', borderWidth:1.5, pointRadius:0, tension:0.3 },
        ]
      }, options: mkOpts({ scales:{ x:{ grid:{color:GRID}, ticks:{color:TICK,font:{family:MONO,size:9},maxRotation:45}, border:{color:GRID} }, y:{ grid:{color:GRID}, ticks:{color:TICK,font:{family:MONO,size:9},callback:v=>'$'+v}, border:{color:GRID} } } }) });
    }

    // Gas prod vs cons
    const gc = document.getElementById('ei-chart-gas');
    if (gc) new Chart(gc, { type:'bar', data:{
      labels: yLabels,
      datasets:[
        { label:'Gas Prod (Bcm)',  data:worldSeries('gas_prod',years), backgroundColor:C_GAS,  borderWidth:0 },
        { label:'Gas Cons (Bcm)',  data:worldSeries('gas_cons',years), backgroundColor:C_CONS, borderWidth:0, type:'line', fill:false, borderColor:C_CONS, pointRadius:0, tension:0.3, yAxisID:'y' },
      ]
    }, options: mkOpts() });

    // Coal production
    const cc = document.getElementById('ei-chart-coal');
    if (cc) new Chart(cc, { type:'bar', data:{
      labels: yLabels,
      datasets:[{ label:'Coal Prod (EJ)', data:worldSeries('coal_prod',years), backgroundColor:C_COAL, borderWidth:0 }]
    }, options: mkOpts() });

    // Electricity
    const ec = document.getElementById('ei-chart-elec');
    if (ec) new Chart(ec, { type:'bar', data:{
      labels: yLabels,
      datasets:[{ label:'Electricity Gen (TWh)', data:worldSeries('elec_gen',years), backgroundColor:C_ELEC, borderWidth:0 }]
    }, options: mkOpts() });

    // Solar + Wind capacity
    const ry = getYears(2010, 2023);
    const rc = document.getElementById('ei-chart-renew-cap');
    if (rc) new Chart(rc, { type:'bar', data:{
      labels: ry.map(String),
      datasets:[
        { label:'Solar (GW)', data:ry.map(y=>window.EI_DATA.WORLD.solar_gw[y]??null), backgroundColor:C_SOLAR, borderWidth:0 },
        { label:'Wind (GW)',  data:ry.map(y=>window.EI_DATA.WORLD.wind_gw[y]??null),  backgroundColor:C_WIND,  borderWidth:0 },
      ]
    }, options: mkOpts() });

    // CO2 + Nuclear
    const cn = document.getElementById('ei-chart-co2-nuclear');
    if (cn) new Chart(cn, { type:'bar', data:{
      labels: yLabels,
      datasets:[
        { label:'CO₂ (Mt)',          data:worldSeries('co2',    years), backgroundColor:C_CO2,  borderWidth:0 },
        { label:'Nuclear TWh (×10)', data:worldSeries('nuclear',years).map(v=>v?+(v*10).toFixed(0):null), backgroundColor:C_NUC, borderWidth:0, type:'line', fill:false, borderColor:C_NUC, pointRadius:0, tension:0.3, yAxisID:'y1' },
      ]
    }, options: mkOpts({ scales:{ x:{ grid:{color:GRID},ticks:{color:TICK,font:{family:MONO,size:9},maxRotation:45},border:{color:GRID} }, y:{ grid:{color:GRID},ticks:{color:TICK,font:{family:MONO,size:9}},border:{color:GRID} }, y1:{ position:'right',grid:{display:false},ticks:{color:TICK,font:{family:MONO,size:9}},border:{color:GRID},display:true } } }) });

    // Build reserves bars
    renderReserveBars('oil-res-bars',  window.EI_DATA.OIL_RESERVES,  'val',   v => v.toFixed(1)+' Gbbl', 303.8, '#c06020');
    renderReserveBars('gas-res-bars',  window.EI_DATA.GAS_RESERVES,  'val',   v => v.toFixed(1)+' Tcm',  37.4,  '#20a060');
    renderReserveBars('coal-res-bars', window.EI_DATA.COAL_RESERVES, 'total', v => (v/1000).toFixed(0)+'k Mt', 248941, '#906030');

    // Oil regional stacked bar
    const regions = [
      {name:'Middle East',   val:836.4, color:'#c05010'},
      {name:'S.&C. America', val:323.4, color:'#3a8010'},
      {name:'North America', val:242.9, color:'#1060a0'},
      {name:'CIS',           val:142.5, color:'#502880'},
      {name:'Africa',        val:125.7, color:'#b07010'},
      {name:'Asia Pacific',  val:47.5,  color:'#107060'},
      {name:'Europe',        val:13.6,  color:'#2040a0'},
    ];
    const total = regions.reduce((s,r)=>s+r.val,0);
    const stacked = document.getElementById('oil-res-stacked');
    if (stacked) stacked.innerHTML = regions.map(r=>`<div class="ei-stacked-seg" style="flex:${r.val};background:${r.color}" title="${r.name}: ${r.val} Gbbl"></div>`).join('');

    const reg = document.getElementById('oil-res-regional');
    if (reg) reg.innerHTML = regions.map(r=>`
      <div class="res-bar-row">
        <div class="res-bar-name">${r.name}</div>
        <div class="res-bar-track"><div class="res-bar-fill" style="width:${(r.val/total*100).toFixed(1)}%;background:${r.color}"></div></div>
        <div class="res-bar-val">${r.val.toFixed(1)} Gbbl</div>
        <div class="res-bar-pct">${(r.val/total*100).toFixed(1)}%</div>
      </div>`).join('');

    // Gas donut
    const gdCanvas = document.getElementById('ei-chart-gas-res-donut');
    if (gdCanvas) {
      const top = window.EI_DATA.GAS_RESERVES.slice(0,8);
      new Chart(gdCanvas, { type:'doughnut', data:{
        labels: top.map(r=>r.name),
        datasets:[{ data:top.map(r=>r.val), backgroundColor:['#c05010','#8a2020','#502880','#107060','#2060a0','#8a5010','#3a8030','#1a5050'], borderColor:'#0a0c0f', borderWidth:2 }]
      }, options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:true,position:'right',labels:{color:'#8899aa',font:{family:MONO,size:9},padding:6,boxWidth:9}}, tooltip:TOOLTIP } } });
    }

    // Coal donut
    const cdCanvas = document.getElementById('ei-chart-coal-res-donut');
    if (cdCanvas) {
      const top = window.EI_DATA.COAL_RESERVES.slice(0,8);
      new Chart(cdCanvas, { type:'doughnut', data:{
        labels: top.map(r=>r.name),
        datasets:[{ data:top.map(r=>r.total), backgroundColor:['#2060a0','#502880','#107060','#8a2020','#8a5010','#3a3a3a','#607020','#3a5050'], borderColor:'#0a0c0f', borderWidth:2 }]
      }, options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{display:true,position:'right',labels:{color:'#8899aa',font:{family:MONO,size:9},padding:6,boxWidth:9}}, tooltip:TOOLTIP } } });
    }

    // Sub-tab switching
    document.querySelectorAll('.ei-subtab[data-res]').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.ei-subtab[data-res]').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        const t = btn.dataset.res;
        ['oil','gas','coal'].forEach(k => {
          const p = document.getElementById('res-panel-'+k);
          if (p) p.style.display = k===t ? '' : 'none';
        });
      });
    });
  };

  function renderReserveBars(containerId, data, valKey, fmtFn, maxVal, color) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = data.map(r => {
      const v = (r[valKey] != null ? r[valKey] : 0);
      const pct = Math.min(100, (v / maxVal * 100)).toFixed(1);
      return `<div class="res-bar-row">
        <div class="res-bar-name" title="${r.name}">${r.name}</div>
        <div class="res-bar-track"><div class="res-bar-fill" style="width:${pct}%;background:${color}"></div></div>
        <div class="res-bar-val">${fmtFn(v)}</div>
        <div class="res-bar-pct">${r.share!=null?r.share.toFixed(1)+'%':'—'}</div>
      </div>`;
    }).join('');
  }

  // ============================================================
  // COUNTRY DRILLDOWN PAGE
  // ============================================================
  let countryInit   = false;
  let activeCountry = null;
  let histChart     = null;

  const DEST_COLORS = {
    'China':'#c04040', 'India':'#c07030', 'Europe':'#3060c0', 'Japan':'#30a070',
    'US':'#2040a0', 'Canada':'#1060a0', 'S.&C. America':'#407020',
    'Middle East':'#a06020', 'Other Asia Pac.':'#307060', 'Singapore':'#60a080',
    'Africa':'#a08020', 'Australasia':'#208060', 'Other CIS':'#504080',
  };

  window.initEICountryPage = function() {
    if (countryInit) return;
    if (!window.EI_DATA) { console.error('EI_DATA not loaded'); return; }
    countryInit = true;

    const countries = Object.keys(window.EI_DATA.COUNTRY_PROFILES);
    const list = document.getElementById('cd-country-list');
    if (!list) return;

    list.innerHTML = countries.map(c => {
      const p = window.EI_DATA.COUNTRY_PROFILES[c];
      return `<button class="cd-cty-btn" data-country="${c}">${p.flag} ${c}</button>`;
    }).join('');

    list.querySelectorAll('.cd-cty-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        list.querySelectorAll('.cd-cty-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        loadCountry(btn.dataset.country);
      });
    });

    // Load first country by default
    list.querySelector('.cd-cty-btn')?.click();
  };

  function loadCountry(name) {
    activeCountry = name;
    const p = window.EI_DATA.COUNTRY_PROFILES[name];
    const flows = window.EI_DATA.CRUDE_FLOWS[name] || window.EI_DATA.CRUDE_FLOWS[name.replace(' Fed.','').replace(' Federation','')] || {};

    // KPIs
    const fmt = v => v ? v.toLocaleString() : '—';
    setEl('cd-kv-prod', fmt(p.oil_prod_2023));
    setEl('cd-ku-prod', 'kbd · 2023');
    const prodDelta = p.oil_prod_2023 && p.oil_prod_2020 ? (((p.oil_prod_2023-p.oil_prod_2020)/p.oil_prod_2020)*100).toFixed(1) : null;
    setEl('cd-kd-prod', prodDelta ? `${prodDelta > 0 ? '▲' : '▼'} ${Math.abs(prodDelta)}% vs 2020`, prodDelta > 0 ? 'var(--accent-green)' : 'var(--accent-red)');

    const expMt = flows['Total'] != null
      ? flows['Total']
      : Object.entries(flows).filter(([k])=>k!=='Total').reduce((s,[,v])=>s+v, 0);
    setEl('cd-kv-exp', expMt ? expMt.toFixed(1) : '—');
    setEl('cd-ku-exp', 'Mt crude · 2024');
    setEl('cd-kd-exp', expMt ? `≈ ${(expMt*7.33/365).toFixed(0)} kbd` : 'No export data');

    setEl('cd-kv-res', p.oil_reserves ? p.oil_reserves.toFixed(1) : '—');
    setEl('cd-ku-res', 'Gbbl proved (2020)');
    setEl('cd-kd-res', p.rp_oil ? `R/P ratio: ${p.rp_oil} yrs` : p.opec ? '● OPEC member' : '');

    setEl('cd-kv-gas', p.gas_prod_2023 ? fmt(p.gas_prod_2023) : '—');
    setEl('cd-ku-gas', 'Bcm · 2023');
    setEl('cd-kd-gas', p.gas_reserves ? `Reserves: ${p.gas_reserves} Tcm` : '');

    // Sankey title
    setEl('sankey-title', `Crude Oil Export Trade Flows — ${name} (2024)`);
    setEl('sankey-sub', `${name} → destination region · crude only · million tonnes`);

    // Render Sankey
    renderSankey(name, flows);

    // Production history chart
    const histYears = Object.keys(p.hist_prod).sort();
    const histData  = histYears.map(y => p.hist_prod[y]);
    const histEl = document.getElementById('cd-chart-hist');
    if (histEl) {
      if (histChart) { histChart.destroy(); histChart = null; }
      histChart = new Chart(histEl, { type:'bar', data:{
        labels: histYears,
        datasets:[{ label:`${name} Oil Prod (kbd)`, data:histData, backgroundColor:'rgba(0,230,118,0.55)', borderColor:'#00e676', borderWidth:1 }]
      }, options: mkOpts({ scales:{ x:{grid:{color:GRID},ticks:{color:TICK,font:{family:MONO,size:9}},border:{color:GRID}}, y:{grid:{color:GRID},ticks:{color:TICK,font:{family:MONO,size:9}},border:{color:GRID}} } }) });
    }

    // Destination bars
    const destEl = document.getElementById('cd-dest-bars');
    if (destEl && Object.keys(flows).length) {
      const dests = Object.entries(flows)
        .filter(([k]) => k !== 'Total')
        .sort(([,a],[,b]) => b - a)
        .slice(0, 10);
      const maxDest = dests[0]?.[1] || 1;
      destEl.innerHTML = dests.map(([dest, mt]) => {
        const pct = (mt / maxDest * 100).toFixed(0);
        const col = DEST_COLORS[dest] || '#3a6080';
        return `<div class="cd-dest-row">
          <div class="cd-dest-name">${dest}</div>
          <div class="cd-dest-track"><div class="cd-dest-fill" style="width:${pct}%;background:${col};opacity:0.8"></div></div>
          <div class="cd-dest-val">${mt.toFixed(1)} Mt</div>
        </div>`;
      }).join('');
    } else if (destEl) {
      destEl.innerHTML = `<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-dim);padding:20px 0">No crude export data for this country in 2024</div>`;
    }
    setEl('cd-hist-title', `${name} — Oil Production History (kbd)`);
  }

  function setEl(id, text, color) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    if (color) el.style.color = color;
  }

  // ── D3-style Sankey rendered with plain SVG ──────────────────────────────────
  function renderSankey(country, flows) {
    const wrap = document.getElementById('sankey-svg-wrap');
    if (!wrap) return;

    const destinations = Object.entries(flows)
      .filter(([k]) => k !== 'Total')
      .sort(([,a],[,b]) => b - a);

    if (!destinations.length) {
      wrap.innerHTML = `<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-dim);padding:30px 0;text-align:center">No crude export flow data available for ${country}</div>`;
      document.getElementById('sankey-legend').innerHTML = '';
      return;
    }

    const W = 760, H = Math.max(260, destinations.length * 36 + 80);
    const leftX = 20, leftW = 160;
    const rightX = 580, rightW = 160;
    const midX = 400;

    const totalExports = destinations.reduce((s,[,v])=>s+v,0);
    const maxFlow = destinations[0][1];
    const maxBarH = H - 80;

    // Source node height = proportional bands
    // Arrange destination nodes evenly
    const nodeH    = 22;
    const nodeGap  = Math.max(6, (H - 60 - destinations.length * nodeH) / Math.max(1, destinations.length - 1));
    const srcH     = Math.min(maxBarH, 200);
    const srcY     = (H - srcH) / 2;

    let svgParts = [`<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" style="width:100%;min-width:600px;font-family:${MONO}">`];

    // Bg
    svgParts.push(`<rect width="${W}" height="${H}" fill="#0d1117"/>`);

    // Column labels
    svgParts.push(`<text x="${leftX + leftW/2}" y="16" text-anchor="middle" font-size="8" fill="#e8b84b" letter-spacing="1.5">EXPORTER</text>`);
    svgParts.push(`<text x="${rightX + rightW/2}" y="16" text-anchor="middle" font-size="8" fill="#00b0ff" letter-spacing="1.5">DESTINATION</text>`);

    // Source node
    const p = window.EI_DATA.COUNTRY_PROFILES[country];
    const srcColor = '#00e676';
    svgParts.push(`<rect x="${leftX}" y="${srcY}" width="${leftW}" height="${srcH}" rx="2" fill="rgba(0,230,118,0.08)" stroke="#00e676" stroke-width="1"/>`);
    svgParts.push(`<text x="${leftX+leftW/2}" y="${srcY+srcH/2-8}" text-anchor="middle" font-size="11" fill="#00e676">${p?.flag || ''} ${country}</text>`);
    svgParts.push(`<text x="${leftX+leftW/2}" y="${srcY+srcH/2+8}" text-anchor="middle" font-size="9" fill="#4aa070">${totalExports.toFixed(1)} Mt total</text>`);
    svgParts.push(`<text x="${leftX+leftW/2}" y="${srcY+srcH/2+22}" text-anchor="middle" font-size="9" fill="#2a7050">crude exports 2024</text>`);

    // Draw flows + destination nodes
    let runningY = srcY; // track source exit point

    destinations.forEach(([dest, mt], i) => {
      const destY  = 30 + i * (nodeH + nodeGap);
      const destMidY = destY + nodeH / 2;
      const flowW  = Math.max(1.5, (mt / maxFlow) * 50); // px stroke width
      const srcMidY = srcY + srcH * (runningY - srcY + flowW/2) / srcH;
      // proportional exit point on source
      const srcExitY = srcY + (totalExports > 0 ? ((destinations.slice(0,i).reduce((s,[,v])=>s+v,0) + mt/2) / totalExports) * srcH : srcH/2);

      const col = DEST_COLORS[dest] || '#3a6080';

      // Bezier flow
      const cx1 = leftX + leftW + (midX - leftX - leftW) * 0.5;
      const cx2 = rightX - (rightX - (leftX + leftW)) * 0.5;
      svgParts.push(
        `<path d="M ${leftX+leftW} ${srcExitY} C ${cx1} ${srcExitY}, ${cx2} ${destMidY}, ${rightX} ${destMidY}" ` +
        `stroke="${col}" stroke-width="${flowW}" fill="none" opacity="0.45" ` +
        `class="sankey-flow" data-from="${country}" data-to="${dest}" data-mt="${mt.toFixed(1)}" data-kbd="${(mt*7.33/365).toFixed(0)}" style="cursor:pointer"/>`
      );

      // Destination node
      svgParts.push(`<rect x="${rightX}" y="${destY}" width="${rightW}" height="${nodeH}" rx="2" fill="${col}22" stroke="${col}" stroke-width="0.8" class="sankey-dest-node" data-dest="${dest}" data-mt="${mt.toFixed(1)}" style="cursor:pointer"/>`);
      svgParts.push(`<text x="${rightX+8}" y="${destY+13}" font-size="9" fill="${col}">${dest}</text>`);
      svgParts.push(`<text x="${rightX+rightW-6}" y="${destY+13}" text-anchor="end" font-size="9" fill="${col}aa">${mt.toFixed(1)} Mt</text>`);
    });

    svgParts.push('</svg>');

    wrap.innerHTML = svgParts.join('\n');

    // Legend
    const legend = document.getElementById('sankey-legend');
    if (legend) {
      legend.innerHTML = destinations.slice(0,8).map(([dest,mt]) => {
        const col = DEST_COLORS[dest] || '#3a6080';
        return `<span style="display:flex;align-items:center;gap:4px"><span style="width:10px;height:10px;border-radius:1px;background:${col};opacity:0.8;display:inline-block"></span>${dest}: ${mt.toFixed(1)} Mt</span>`;
      }).join('');
    }

    // Tooltip interactivity
    const tooltip = document.getElementById('sankey-tooltip');
    if (!tooltip) return;

    wrap.querySelectorAll('.sankey-flow, .sankey-dest-node').forEach(el => {
      el.addEventListener('mousemove', e => {
        const mt  = el.dataset.mt;
        const kbd = el.dataset.kbd || (parseFloat(mt)*7.33/365).toFixed(0);
        const from = el.dataset.from || country;
        const to   = el.dataset.to   || el.dataset.dest;
        const sharePct = totalExports > 0 ? (parseFloat(mt)/totalExports*100).toFixed(1) : '—';
        tooltip.innerHTML = `<div style="color:var(--accent-green);margin-bottom:3px">${from} → ${to}</div>` +
          `Volume: <b>${mt} Mt</b><br>` +
          `≈ ${kbd} kbd daily<br>` +
          `Share of exports: ${sharePct}%`;
        tooltip.style.display = 'block';
        tooltip.style.left  = (e.clientX + 14) + 'px';
        tooltip.style.top   = (e.clientY - 10) + 'px';
      });
      el.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
    });
  }

})();
