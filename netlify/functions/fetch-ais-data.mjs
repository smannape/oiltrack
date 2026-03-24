// ============================================================
// netlify/functions/fetch-ais-data.mjs
//
// Netlify Pro Background Function.
// Connects to AISstream.io WebSocket using the 'ws' npm package
// (native WebSocket is not available in Node.js server runtime).
//
// Strategy:
//   - Opens WebSocket to wss://stream.aisstream.io/v0/stream
//   - Subscribes to major oil shipping lane bounding boxes
//   - Collects PositionReport + ShipStaticData for 45 seconds
//   - Filters to tanker vessel types only
//   - Writes up to 50 tankers to Netlify Blob 'tankers'
//
// ENV VARS:
//   AISSTREAM_API_KEY  from aisstream.io dashboard (free tier)
//
// Triggered by:
//   - POST /api/ais-refresh  (manual)
//   - scheduled-refresh.mjs  (hourly)
// ============================================================

import { getStore } from '@netlify/blobs';
import { WebSocket } from 'ws';  // explicit ws package import

const AIS_KEY = process.env.AISSTREAM_API_KEY || '';

//  COLLECTION WINDOW 
// 45 seconds to collect as many vessel positions as possible
// 30s collection -- background functions can run longer but 30s gives
// plenty of AIS messages while keeping response times reasonable
const COLLECTION_MS = 30000;
// Max tankers to store in blob (keep payload manageable)
const MAX_TANKERS   = 60;

//  BOUNDING BOXES  major oil shipping lanes 
const BOUNDING_BOXES = [
  [[21.0, 50.0], [30.0, 60.0]],     // Persian Gulf + Strait of Hormuz
  [[10.0, 40.0], [25.0, 55.0]],     // Red Sea + Gulf of Aden
  [[30.0, -10.0], [46.0, 40.0]],    // Mediterranean Sea
  [[49.0, -15.0], [62.0, 10.0]],    // North Sea + English Channel
  [[20.0, -100.0], [32.0, -80.0]],  // Gulf of Mexico
  [[-5.0, 95.0], [10.0, 115.0]],    // Strait of Malacca
  [[-40.0, 10.0], [5.0, 40.0]],     // South Atlantic / Cape of Good Hope
  [[30.0, 118.0], [42.0, 132.0]],   // East China Sea / Korea Strait
];

//  TANKER AIS TYPE CODES 
// 80-89 = Tanker, 70-79 = Cargo (also useful)
const TANKER_TYPES = new Set([80,81,82,83,84,85,86,87,88,89]);

//  NAVIGATIONAL STATUS 
const NAV_STATUS = {
  0: 'underway', 1: 'anchored', 2: 'not under command',
  3: 'restricted', 5: 'moored', 6: 'aground',
};

//  TANKER CLASS FROM DIMENSIONS 
function tankerClass(dimA, dimB) {
  const len = (dimA || 0) + (dimB || 0);
  if (len >= 350) return 'ULCC';
  if (len >= 250) return 'VLCC';
  if (len >= 180) return 'Suezmax';
  if (len >= 120) return 'Aframax';
  if (len >= 70)  return 'Panamax';
  return 'Tanker';
}

//  FLAG EMOJI FROM MMSI PREFIX 
function flagFromMMSI(mmsi) {
  const prefix = String(mmsi).slice(0, 3);
  const flags = {
    '235':'GB','211':'DE','229':'GR','248':'MT','249':'MT',
    '310':'BM','311':'BS','319':'KY','338':'US','357':'PA',
    '370':'PA','371':'PA','372':'PA','373':'PA','374':'PA',
    '416':'TW','431':'JP','440':'KR','441':'KR','477':'HK',
    '518':'CK','525':'ID','538':'MH','548':'PH','563':'SG',
    '574':'VN','620':'MZ','636':'LR','710':'BR','720':'BO',
  };
  return flags[prefix] || 'XX';
}

//  MAIN HANDLER 
export default async function handler(req, context) {
  const startTime = Date.now();
  const fetchedAt = new Date().toISOString();
  console.log(`[fetch-ais-data] START ${fetchedAt}`);

  if (!AIS_KEY) {
    console.error('[fetch-ais-data] AISSTREAM_API_KEY not set');
    return new Response(JSON.stringify({ error: 'AISSTREAM_API_KEY not set' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  const store   = getStore('crude-radar');
  const vessels = new Map(); // MMSI  vessel data
  let messageCount = 0;

  //  Connect + collect via WebSocket 
  await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      console.log(`[fetch-ais-data] Collection window complete. Messages: ${messageCount}, Vessels: ${vessels.size}`);
      try { ws.terminate(); } catch (_) {}
      resolve();
    }, COLLECTION_MS);

    const ws = new WebSocket('wss://stream.aisstream.io/v0/stream');

    ws.on('open', () => {
      console.log('[fetch-ais-data] Connected to AISstream');
      ws.send(JSON.stringify({
        APIKey:             AIS_KEY,
        BoundingBoxes:      BOUNDING_BOXES,
        // No MMSI filter  catch ALL tankers in these regions
        FilterMessageTypes: ['PositionReport', 'ShipStaticData'],
      }));
      console.log('[fetch-ais-data] Subscription sent  collecting for 45s...');
    });

    ws.on('message', (raw) => {
      try {
        const msg  = JSON.parse(raw.toString());
        const type = msg.MessageType;
        if (!type) return;

        messageCount++;
        const meta  = msg.MetaData || {};
        const mmsi  = String(meta.MMSI || '');
        if (!mmsi) return;

        //  PositionReport 
        if (type === 'PositionReport') {
          const pos = msg.Message?.PositionReport || {};

          // Only keep tanker types if we have type info, otherwise keep all
          const shipType = vessels.get(mmsi)?.typeCode;
          if (shipType && !TANKER_TYPES.has(shipType)) return;

          const lat   = parseFloat(meta.latitude  || pos.Latitude  || 0);
          const lng   = parseFloat(meta.longitude || pos.Longitude || 0);
          const speed = parseFloat(pos.Sog || pos.SOG || 0);

          // Skip invalid positions
          if (lat === 0 && lng === 0) return;

          if (!vessels.has(mmsi)) {
            vessels.set(mmsi, {
              mmsi,
              name:        (meta.ShipName || '').trim() || `Vessel-${mmsi.slice(-4)}`,
              lat, lng,
              speed:       speed.toFixed(1),
              course:      pos.Cog || pos.COG || pos.TrueHeading || 0,
              status:      NAV_STATUS[pos.NavigationalStatus] ?? (speed > 0.3 ? 'underway' : 'anchored'),
              type:        'Tanker',
              vesselClass: 'Tanker',
              typeCode:    null,
              flag:        flagFromMMSI(mmsi),
              cargo:       'Crude Oil',
              destination: '',
              eta:         '',
              imo:         '',
              from:        '',
              to:          '',
              updatedAt:   new Date().toISOString(),
            });
          } else {
            const v = vessels.get(mmsi);
            v.lat       = lat;
            v.lng       = lng;
            v.speed     = speed.toFixed(1);
            v.course    = pos.Cog || pos.COG || pos.TrueHeading || v.course;
            v.status    = NAV_STATUS[pos.NavigationalStatus] ?? (speed > 0.3 ? 'underway' : 'anchored');
            v.updatedAt = new Date().toISOString();
            if (meta.ShipName?.trim()) v.name = meta.ShipName.trim();
          }

          if (messageCount % 100 === 0) {
            console.log(`[fetch-ais-data] ${messageCount} messages, ${vessels.size} vessels`);
          }
        }

        //  ShipStaticData 
        if (type === 'ShipStaticData') {
          const stat = msg.Message?.ShipStaticData || {};

          // Filter to tankers only
          if (stat.Type && !TANKER_TYPES.has(stat.Type)) return;

          if (!vessels.has(mmsi)) {
            vessels.set(mmsi, {
              mmsi,
              name:        (stat.Name || meta.ShipName || '').trim() || `Vessel-${mmsi.slice(-4)}`,
              lat: 0, lng: 0,
              speed: '0.0', course: 0, status: 'unknown',
              type: 'Tanker', vesselClass: 'Tanker',
              typeCode: stat.Type || null,
              flag: flagFromMMSI(mmsi),
              cargo: 'Crude Oil',
              destination: (stat.Destination || '').trim() || '',
              eta: '', imo: '', from: '',
              to: (stat.Destination || '').trim() || '',
              updatedAt: new Date().toISOString(),
            });
          } else {
            const v = vessels.get(mmsi);
            if (stat.Name?.trim())        v.name        = stat.Name.trim();
            if (stat.Type)                v.typeCode    = stat.Type;
            if (stat.ImoNumber)           v.imo         = String(stat.ImoNumber);
            if (stat.Destination?.trim()) {
              v.destination = stat.Destination.trim();
              v.to          = stat.Destination.trim();
            }
            // Derive vessel class from dimensions
            if (stat.Dimension) {
              v.vesselClass = tankerClass(stat.Dimension.A, stat.Dimension.B);
              v.type        = v.vesselClass;
            }
            // ETA object {Month, Day, Hour, Minute}
            if (stat.Eta?.Month) {
              const e = stat.Eta;
              v.eta = `${String(e.Month).padStart(2,'0')}/${String(e.Day).padStart(2,'0')} ${String(e.Hour).padStart(2,'0')}:${String(e.Minute).padStart(2,'0')} UTC`;
            }
            v.updatedAt = new Date().toISOString();
          }
        }

      } catch (e) {
        console.warn('[fetch-ais-data] Parse error:', e.message);
      }
    });

    ws.on('error', (err) => {
      console.error('[fetch-ais-data] WebSocket error:', err.message);
      clearTimeout(timeout);
      try { ws.terminate(); } catch (_) {}
      resolve();
    });

    ws.on('close', (code, reason) => {
      console.log(`[fetch-ais-data] WebSocket closed: ${code} ${reason?.toString()}`);
      clearTimeout(timeout);
      resolve();
    });
  });

  //  Post-process: filter, sort, cap 
  const tankers = Array.from(vessels.values())
    // Must have a real position
    .filter(v => v.lat !== 0 || v.lng !== 0)
    // Must be a confirmed tanker type or unknown (not cargo/passenger/etc)
    .filter(v => !v.typeCode || TANKER_TYPES.has(v.typeCode))
    // Sort by speed desc (underway vessels first)
    .sort((a, b) => parseFloat(b.speed) - parseFloat(a.speed))
    // Cap at MAX_TANKERS
    .slice(0, MAX_TANKERS);

  console.log(`[fetch-ais-data] Final tankers with positions: ${tankers.length}`);
  tankers.forEach(t => {
    console.log(`   ${t.name} (${t.mmsi}) @ ${t.lat.toFixed(2)},${t.lng.toFixed(2)} ${t.speed}kn  ${t.destination}`);
  });

  //  Merge with previous blob if current run got few results 
  let finalTankers = tankers;
  if (tankers.length < 5) {
    console.log('[fetch-ais-data] Few live results  merging with previous blob');
    try {
      const prev = await store.get('tankers', { type: 'json' });
      if (prev?.tankers?.length) {
        const seenMMSI  = new Set(tankers.map(t => t.mmsi));
        const preserved = prev.tankers
          .filter(t => !seenMMSI.has(t.mmsi))
          .slice(0, MAX_TANKERS - tankers.length)
          .map(t => ({ ...t, stale: true }));
        finalTankers = [...tankers, ...preserved];
        console.log(`[fetch-ais-data] Merged: ${tankers.length} live + ${preserved.length} preserved`);
      }
    } catch (_) {}
  }

  //  Write blob 
  const duration_ms = Date.now() - startTime;
  try {
    await store.setJSON('tankers', {
      fetchedAt,
      duration_ms,
      message_count: messageCount,
      live_count:    tankers.length,
      total_count:   finalTankers.length,
      tankers:       finalTankers,
    });
    console.log(`[fetch-ais-data] Blob written  ${finalTankers.length} tankers in ${duration_ms}ms`);
  } catch (e) {
    console.error('[fetch-ais-data] Blob write error:', e.message);
  }

  return new Response(JSON.stringify({
    fetchedAt, duration_ms,
    message_count: messageCount,
    live_count:    tankers.length,
    total_count:   finalTankers.length,
    sample:        tankers.slice(0, 5).map(t => `${t.name}@${t.lat.toFixed(2)},${t.lng.toFixed(2)}`),
  }, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
