// ============================================================
// netlify/functions/fetch-ais-data.mjs
//
// Netlify Pro Background Function -- up to 15 min execution
// Two-pass AIS collection:
//   Pass 1 (0-45s):  Middle East + Asia (Persian Gulf, Arabian Sea,
//                    Indian Ocean, Malacca, South China Sea, East Asia)
//   Pass 2 (45-90s): Europe + Americas (North Sea, Med, Gulf of Mexico)
//
// If connection drops (free tier drops ~every 2 min), we reconnect.
// ============================================================

import { getStore } from '@netlify/blobs';
import { WebSocket } from 'ws';

const AIS_KEY = process.env.AISSTREAM_API_KEY || '';

const PASS_MS    = 45000;  // 45s per pass
const MAX_TANKERS = 100;

// ── TANKER AIS TYPE CODES ─────────────────────────────────────
const TANKER_TYPES = new Set([80,81,82,83,84,85,86,87,88,89]);

// ── NAV STATUS ───────────────────────────────────────────────
const NAV_STATUS = {
  0:'underway', 1:'anchored', 2:'not under command',
  3:'restricted', 5:'moored', 6:'aground',
};

// ── BOUNDING BOXES ────────────────────────────────────────────
// Pass 1: Middle East + Asia -- highest priority for oil tankers
const BOXES_ME_ASIA = [
  [[21.0, 48.0], [30.0, 60.0]],    // Persian Gulf + Strait of Hormuz
  [[22.0, 55.0], [26.0, 61.0]],    // Strait of Hormuz chokepoint
  [[10.0, 40.0], [25.0, 60.0]],    // Red Sea + Gulf of Aden + Gulf of Oman
  [[10.0, 55.0], [25.0, 75.0]],    // Arabian Sea
  [[-5.0, 68.0], [15.0, 90.0]],    // Indian Ocean
  [[-6.0, 95.0], [10.0, 116.0]],   // Strait of Malacca
  [[ 0.0, 103.0],[ 5.0, 115.0]],   // Singapore Strait
  [[ 5.0, 105.0],[22.0, 122.0]],   // South China Sea
  [[20.0, 118.0],[42.0, 132.0]],   // East China Sea + Korea + Japan
];

// Pass 2: Europe + Americas
const BOXES_EUROPE_AMERICAS = [
  [[30.0, -10.0],[46.0,  40.0]],   // Mediterranean
  [[49.0, -15.0],[62.0,  10.0]],   // North Sea + English Channel
  [[20.0,-100.0],[32.0, -80.0]],   // Gulf of Mexico
  [[-40.0, 10.0],[ 5.0,  40.0]],   // Cape of Good Hope
  [[ 5.0, 78.0], [15.0,  92.0]],   // Bay of Bengal
];

// ── VESSEL CLASS ─────────────────────────────────────────────
function tankerClass(a, b) {
  const len = (a||0)+(b||0);
  if (len>=350) return 'ULCC';
  if (len>=250) return 'VLCC';
  if (len>=180) return 'Suezmax';
  if (len>=120) return 'Aframax';
  if (len>=70)  return 'Panamax';
  return 'Tanker';
}

// ── FLAG FROM MMSI ───────────────────────────────────────────
function flagFromMMSI(mmsi) {
  const p = String(mmsi).slice(0,3);
  const m = {
    '235':'GB','211':'DE','229':'GR','244':'NL','248':'MT','249':'MT',
    '255':'PT','257':'NO','265':'SE','269':'CH',
    '338':'US','357':'PA','370':'PA','371':'PA','372':'PA','373':'PA',
    '310':'BM','311':'BS','319':'KY','710':'BR',
    '403':'SA','404':'KW','405':'IR','406':'IQ','408':'AE',
    '410':'YE','412':'QA','419':'IN','422':'IR','434':'OM','436':'BH',
    '416':'TW','431':'JP','432':'JP','440':'KR','441':'KR',
    '477':'HK','525':'ID','533':'MY','538':'MH','548':'PH',
    '563':'SG','574':'VN','620':'MZ','636':'LR',
    '412':'CN','413':'CN','414':'CN',
  };
  return m[p] || '?';
}

// ── COLLECT VESSELS via WebSocket for durationMs ─────────────
function collectVessels(boxes, durationMs, vessels) {
  return new Promise((resolve) => {
    let msgCount = 0;
    let ws = null;
    let finished = false;
    let reconnectTimer = null;
    let doneTimer = null;

    function done() {
      if (finished) return;
      finished = true;
      clearTimeout(reconnectTimer);
      clearTimeout(doneTimer);
      try { ws && ws.terminate(); } catch(_) {}
      resolve(msgCount);
    }

    // Stop collecting after durationMs
    doneTimer = setTimeout(() => {
      console.log('[AIS] Pass complete. msgs=' + msgCount + ' vessels=' + vessels.size);
      done();
    }, durationMs);

    function connect() {
      if (finished) return;
      ws = new WebSocket('wss://stream.aisstream.io/v0/stream');

      ws.on('open', () => {
        console.log('[AIS] Connected, sending subscription...');
        ws.send(JSON.stringify({
          APIKey:             AIS_KEY,
          BoundingBoxes:      boxes,
          FilterMessageTypes: ['PositionReport', 'ShipStaticData'],
        }));
      });

      ws.on('message', (raw) => {
        if (finished) return;
        try {
          const msg  = JSON.parse(raw.toString());
          const type = msg.MessageType;
          if (!type) return;
          msgCount++;

          const meta = msg.MetaData || {};
          const mmsi = String(meta.MMSI || '');
          if (!mmsi) return;

          if (type === 'PositionReport') {
            const pos  = msg.Message?.PositionReport || {};
            // Only reject if we KNOW it's not a tanker
            const known = vessels.get(mmsi)?.typeCode;
            if (known && !TANKER_TYPES.has(known)) return;

            const lat   = parseFloat(meta.latitude  || pos.Latitude  || 0);
            const lng   = parseFloat(meta.longitude || pos.Longitude || 0);
            const spd   = parseFloat(pos.Sog || 0);
            if (lat === 0 && lng === 0) return;

            if (!vessels.has(mmsi)) {
              vessels.set(mmsi, {
                mmsi, lat, lng,
                name:        (meta.ShipName||'').trim() || 'Vessel-'+mmsi.slice(-4),
                speed:       spd.toFixed(1),
                course:      pos.Cog || 0,
                status:      NAV_STATUS[pos.NavigationalStatus] ?? (spd>0.3?'underway':'anchored'),
                type:'Tanker', vesselClass:'Tanker', typeCode:null,
                flag:        flagFromMMSI(mmsi),
                cargo:'Crude Oil', destination:'', eta:'', imo:'', from:'', to:'',
                updatedAt:   new Date().toISOString(),
              });
            } else {
              const v = vessels.get(mmsi);
              v.lat=lat; v.lng=lng; v.speed=spd.toFixed(1);
              v.course=pos.Cog||v.course;
              v.status=NAV_STATUS[pos.NavigationalStatus]??(spd>0.3?'underway':'anchored');
              v.updatedAt=new Date().toISOString();
              if (meta.ShipName?.trim()) v.name=meta.ShipName.trim();
            }
          }

          if (type === 'ShipStaticData') {
            const stat = msg.Message?.ShipStaticData || {};
            // Keep unknown types (0), reject known non-tankers
            if (stat.Type && stat.Type!==0 && !TANKER_TYPES.has(stat.Type)) return;

            if (!vessels.has(mmsi)) {
              vessels.set(mmsi, {
                mmsi, lat:0, lng:0, speed:'0.0', course:0, status:'unknown',
                name:        (stat.Name||meta.ShipName||'').trim()||'Vessel-'+mmsi.slice(-4),
                type:'Tanker', vesselClass:'Tanker', typeCode:stat.Type||null,
                flag:        flagFromMMSI(mmsi),
                cargo:'Crude Oil',
                destination: (stat.Destination||'').trim(),
                to:          (stat.Destination||'').trim(),
                eta:'', imo:'', from:'',
                updatedAt:   new Date().toISOString(),
              });
            } else {
              const v = vessels.get(mmsi);
              if (stat.Name?.trim())        v.name        = stat.Name.trim();
              if (stat.Type)                v.typeCode    = stat.Type;
              if (stat.ImoNumber)           v.imo         = String(stat.ImoNumber);
              if (stat.Destination?.trim()) { v.destination=stat.Destination.trim(); v.to=v.destination; }
              if (stat.Dimension)           { v.vesselClass=tankerClass(stat.Dimension.A,stat.Dimension.B); v.type=v.vesselClass; }
              if (stat.Eta?.Month) {
                const e=stat.Eta;
                v.eta=String(e.Month).padStart(2,'0')+'/'+String(e.Day).padStart(2,'0')+' '+
                      String(e.Hour).padStart(2,'0')+':'+String(e.Minute).padStart(2,'0')+' UTC';
              }
              v.updatedAt=new Date().toISOString();
            }
          }

        } catch(e) { /* ignore parse errors */ }
      });

      ws.on('error', (err) => {
        console.warn('[AIS] WS error:', err.message, '-- reconnecting in 2s');
        try { ws.terminate(); } catch(_) {}
        if (!finished) reconnectTimer = setTimeout(connect, 2000);
      });

      ws.on('close', (code) => {
        console.log('[AIS] WS closed code=' + code + ' vessels=' + vessels.size + ' -- reconnecting in 2s');
        if (!finished) reconnectTimer = setTimeout(connect, 2000);
      });
    }

    connect();
  });
}

// ── MAIN HANDLER ─────────────────────────────────────────────
export default async function handler(req) {
  const startTime = Date.now();
  const fetchedAt = new Date().toISOString();
  console.log('[fetch-ais-data] START ' + fetchedAt);

  if (!AIS_KEY) {
    return new Response(JSON.stringify({ error: 'AISSTREAM_API_KEY not set' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  const store   = getStore('crude-radar');
  const vessels = new Map();

  // Pass 1: Middle East + Asia (45s)
  console.log('[AIS] Pass 1: Middle East + Asia (' + BOXES_ME_ASIA.length + ' boxes)');
  const msgs1 = await collectVessels(BOXES_ME_ASIA, PASS_MS, vessels);
  console.log('[AIS] Pass 1 done. msgs=' + msgs1 + ' vessels=' + vessels.size);

  // Pass 2: Europe + Americas (45s)
  console.log('[AIS] Pass 2: Europe + Americas (' + BOXES_EUROPE_AMERICAS.length + ' boxes)');
  const msgs2 = await collectVessels(BOXES_EUROPE_AMERICAS, PASS_MS, vessels);
  console.log('[AIS] Pass 2 done. msgs=' + msgs2 + ' vessels=' + vessels.size);

  // Post-process
  const tankers = Array.from(vessels.values())
    .filter(v => v.lat !== 0 || v.lng !== 0)
    .filter(v => !v.typeCode || TANKER_TYPES.has(v.typeCode))
    .sort((a,b) => parseFloat(b.speed)-parseFloat(a.speed))
    .slice(0, MAX_TANKERS);

  console.log('[fetch-ais-data] Final: ' + tankers.length + ' tankers');
  tankers.forEach(t => {
    console.log('  ' + t.name + ' (' + t.flag + ') @ ' + t.lat.toFixed(2) + ',' + t.lng.toFixed(2) + ' ' + t.speed + 'kn -> ' + (t.destination||'--'));
  });

  // Merge with previous if too few results
  let finalTankers = tankers;
  if (tankers.length < 10) {
    try {
      const prev = await store.get('tankers', { type: 'json' });
      if (prev?.tankers?.length) {
        const seen = new Set(tankers.map(t=>t.mmsi));
        const preserved = prev.tankers
          .filter(t => !seen.has(t.mmsi))
          .slice(0, MAX_TANKERS - tankers.length)
          .map(t => ({ ...t, stale: true }));
        finalTankers = [...tankers, ...preserved];
        console.log('[AIS] Merged: ' + tankers.length + ' live + ' + preserved.length + ' preserved');
      }
    } catch(_) {}
  }

  const duration_ms = Date.now() - startTime;
  await store.setJSON('tankers', {
    fetchedAt, duration_ms,
    message_count: msgs1 + msgs2,
    live_count:    tankers.length,
    total_count:   finalTankers.length,
    tankers:       finalTankers,
  }).catch(e => console.error('[AIS] Blob write error:', e.message));

  console.log('[fetch-ais-data] DONE in ' + duration_ms + 'ms');

  return new Response(JSON.stringify({
    fetchedAt, duration_ms,
    message_count: msgs1+msgs2,
    live_count:    tankers.length,
    total_count:   finalTankers.length,
    passes:        { me_asia: msgs1, europe_americas: msgs2 },
    sample:        tankers.slice(0,5).map(t => t.name+'@'+t.lat.toFixed(2)+','+t.lng.toFixed(2)+' '+t.flag),
  }, null, 2), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
}
