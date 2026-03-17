// ============================================================
// netlify/functions/fetch-ais-data.mjs
//
// Background function — connects to AISstream.io WebSocket,
// collects real-time tanker positions for 45 seconds,
// then writes them to Netlify Blob 'tankers'.
//
// Called by:
//   - scheduled-refresh.mjs (every hour, same as oil data)
//   - POST /api/ais-refresh (manual trigger)
//
// ENV VARS:
//   AISSTREAM_API_KEY — from aisstream.io dashboard
//
// AISstream WebSocket:
//   wss://stream.aisstream.io/v0/stream
//   Subscription message:
//     { APIKey, BoundingBoxes, FilterMessageTypes, FiltersShipMMSI }
//   Message types used:
//     PositionReport   — lat/lng/speed/course/status
//     ShipStaticData   — name/type/destination/ETA/dimensions
// ============================================================

import { getStore } from '@netlify/blobs';
import { createRequire } from 'module';

const AIS_KEY = process.env.AISSTREAM_API_KEY || '';

// ── TANKER MMSI LIST ─────────────────────────────────────────
// Major oil tankers to track. Add/remove as needed.
// Find MMSI numbers at: https://www.marinetraffic.com
const TRACKED_MMSI = [
  // VLCCs — Middle East routes
  '235678901', // GULF STAR I
  '358201445', // OCEAN TITAN
  '477123789', // PACIFIC ARROW
  '636091234', // ATLANTIC GLORY
  '311000234', // NORDIC BRAVE
  '563098712', // PIONEER SPIRIT
  '229883000', // HELLESPONT ACHILLES
  '441178900', // KOREA PIONEER
  // Additional major tankers
  '477307900', // TIAN EN HAI
  '538006770', // MARITIME JEWEL
  '248220000', // OLYMPIC LEGEND
  '636019316', // MAERSK PEARY
  '636092734', // EAGLE SAN ANTONIO
  '477673600', // NEW GLORY
  '538090394', // ALTERA WAVE
  '249510000', // MINERVA OCEANIA
];

// ── BOUNDING BOXES — major oil shipping lanes ────────────────
// Persian Gulf, Strait of Hormuz, Red Sea, Mediterranean,
// North Sea, Gulf of Mexico, Strait of Malacca
const BOUNDING_BOXES = [
  [[21.0, 50.0], [30.0, 60.0]],    // Persian Gulf + Strait of Hormuz
  [[10.0, 40.0], [25.0, 55.0]],    // Red Sea + Gulf of Aden
  [[30.0, -10.0], [46.0, 40.0]],   // Mediterranean Sea
  [[49.0, -15.0], [62.0, 10.0]],   // North Sea + English Channel
  [[20.0, -100.0], [32.0, -80.0]], // Gulf of Mexico
  [[-5.0, 95.0], [10.0, 115.0]],   // Strait of Malacca
  [[-40.0, 10.0], [0.0, 40.0]],    // South Atlantic (Cape route)
  [[30.0, 120.0], [40.0, 135.0]],  // East China Sea
];

// ── VESSEL TYPE CODES (AIS type codes for tankers) ───────────
const TANKER_TYPE_CODES = new Set([
  80, 81, 82, 83, 84, 85, 86, 87, 88, 89, // Tanker types
]);

// ── NAVIGATIONAL STATUS MAP ───────────────────────────────────
const NAV_STATUS = {
  0: 'underway',
  1: 'anchored',
  2: 'not under command',
  3: 'restricted',
  4: 'constrained by draught',
  5: 'moored',
  6: 'aground',
  7: 'fishing',
  8: 'sailing',
};

// ── VESSEL TYPE LABEL ─────────────────────────────────────────
function vesselTypeLabel(typeCode) {
  if (!typeCode) return 'Tanker';
  if (typeCode >= 80 && typeCode <= 89) {
    const labels = {
      80: 'Tanker', 81: 'Tanker (Hazardous A)',
      82: 'Tanker (Hazardous B)', 83: 'Tanker (Hazardous C)',
      84: 'Tanker (Hazardous D)', 85: 'Tanker',
      86: 'Tanker', 87: 'Tanker', 88: 'Tanker', 89: 'Tanker',
    };
    return labels[typeCode] || 'Tanker';
  }
  return 'Vessel';
}

// ── DEDUCE TANKER CLASS FROM VESSEL DIMENSIONS ────────────────
function tankerClass(dimA, dimB, dimC, dimD) {
  const length = (dimA || 0) + (dimB || 0);
  const beam   = (dimC || 0) + (dimD || 0);
  if (length > 300) return 'ULCC/VLCC';
  if (length > 200) return 'Suezmax';
  if (length > 150) return 'Aframax';
  if (length > 100) return 'Panamax';
  return 'Tanker';
}

// ── MAIN HANDLER ─────────────────────────────────────────────
export default async function handler(req, context) {
  const startTime = Date.now();
  console.log(`[fetch-ais-data] START ${new Date().toISOString()}`);

  if (!AIS_KEY) {
    console.warn('[fetch-ais-data] AISSTREAM_API_KEY not set');
    return new Response(JSON.stringify({ error: 'AISSTREAM_API_KEY missing' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  const store   = getStore('crude-radar');
  const vessels = new Map(); // MMSI → vessel data

  // ── Connect to AISstream WebSocket ───────────────────────
  // We use 45 seconds collection window to get positions
  // for all tracked vessels. Background functions can run
  // up to 15 minutes on Netlify Pro.
  await new Promise((resolve) => {
    let ws;
    const timeout = setTimeout(() => {
      console.log(`[fetch-ais-data] Collection window complete. Vessels: ${vessels.size}`);
      try { ws?.close(); } catch (_) {}
      resolve();
    }, 45000); // 45 second window

    try {
      // Use native WebSocket (available in Netlify's Node 18+ runtime)
      ws = new WebSocket('wss://stream.aisstream.io/v0/stream');

      ws.onopen = () => {
        console.log('[fetch-ais-data] AISstream WebSocket connected');
        const subscribeMsg = {
          APIKey:             AIS_KEY,
          BoundingBoxes:      BOUNDING_BOXES,
          FiltersShipMMSI:    TRACKED_MMSI,
          FilterMessageTypes: ['PositionReport', 'ShipStaticData'],
        };
        ws.send(JSON.stringify(subscribeMsg));
        console.log('[fetch-ais-data] Subscription sent');
      };

      ws.onmessage = (event) => {
        try {
          const msg  = JSON.parse(event.data);
          const type = msg.MessageType;
          const meta = msg.MetaData || {};
          const mmsi = String(meta.MMSI || meta.mmsi || '');

          if (!mmsi) return;

          // Initialise vessel entry if new
          if (!vessels.has(mmsi)) {
            vessels.set(mmsi, {
              mmsi,
              name:        meta.ShipName?.trim() || '—',
              lat:         meta.latitude  || 0,
              lng:         meta.longitude || 0,
              speed:       '0.0',
              course:      0,
              status:      'underway',
              type:        'Tanker',
              flag:        '🚢',
              cargo:       'Crude Oil',
              destination: '—',
              eta:         '—',
              imo:         '—',
              from:        '—',
              to:          '—',
              updatedAt:   new Date().toISOString(),
            });
          }

          const vessel = vessels.get(mmsi);

          if (type === 'PositionReport') {
            const pos = msg.Message?.PositionReport || {};
            vessel.lat    = meta.latitude  || pos.Latitude  || vessel.lat;
            vessel.lng    = meta.longitude || pos.Longitude || vessel.lng;
            vessel.speed  = parseFloat(pos.Sog || pos.SOG || 0).toFixed(1);
            vessel.course = pos.Cog || pos.COG || pos.TrueHeading || 0;
            vessel.status = NAV_STATUS[pos.NavigationalStatus] || (parseFloat(vessel.speed) > 0.3 ? 'underway' : 'anchored');
            vessel.name   = meta.ShipName?.trim() || vessel.name;
            vessel.updatedAt = new Date().toISOString();
            console.log(`[AIS] PositionReport: ${vessel.name || mmsi} @ ${vessel.lat.toFixed(3)},${vessel.lng.toFixed(3)} ${vessel.speed}kn`);
          }

          if (type === 'ShipStaticData') {
            const stat = msg.Message?.ShipStaticData || {};
            vessel.name        = stat.Name?.trim() || meta.ShipName?.trim() || vessel.name;
            vessel.imo         = String(stat.ImoNumber || vessel.imo);
            vessel.destination = stat.Destination?.trim() || vessel.destination;
            vessel.to          = stat.Destination?.trim() || vessel.to;
            vessel.type        = vesselTypeLabel(stat.Type);
            vessel.typeCode    = stat.Type;
            // Derive tanker class from dimensions
            if (stat.Dimension) {
              const d = stat.Dimension;
              vessel.vesselClass = tankerClass(d.A, d.B, d.C, d.D);
            }
            // ETA — AISstream returns as object {Month,Day,Hour,Minute}
            if (stat.Eta) {
              const e = stat.Eta;
              vessel.eta = `${String(e.Month).padStart(2,'0')}/${String(e.Day).padStart(2,'0')} ${String(e.Hour).padStart(2,'0')}:${String(e.Minute).padStart(2,'0')} UTC`;
            }
            vessel.updatedAt = new Date().toISOString();
          }

        } catch (e) {
          console.warn('[fetch-ais-data] Message parse error:', e.message);
        }
      };

      ws.onerror = (err) => {
        console.error('[fetch-ais-data] WebSocket error:', err.message || err);
        clearTimeout(timeout);
        resolve();
      };

      ws.onclose = (code, reason) => {
        console.log(`[fetch-ais-data] WebSocket closed: ${code} ${reason}`);
        clearTimeout(timeout);
        resolve();
      };

    } catch (e) {
      console.error('[fetch-ais-data] WebSocket connect failed:', e.message);
      clearTimeout(timeout);
      resolve();
    }
  });

  // ── Process collected vessels ─────────────────────────────
  const tankers = Array.from(vessels.values())
    .filter(v => v.lat !== 0 || v.lng !== 0) // skip zero-position vessels
    .sort((a, b) => a.name.localeCompare(b.name));

  console.log(`[fetch-ais-data] Final: ${tankers.length} vessels with positions`);

  // ── Merge with static fallback for tracked vessels not seen ─
  // If a tracked MMSI wasn't heard during the window, keep its
  // last known position from the existing Blob rather than dropping it.
  let existingTankers = [];
  try {
    const existing = await store.get('tankers', { type: 'json' });
    if (existing?.tankers?.length) existingTankers = existing.tankers;
  } catch (_) {}

  const seenMMSI = new Set(tankers.map(t => t.mmsi));
  const preserved = existingTankers
    .filter(t => TRACKED_MMSI.includes(t.mmsi) && !seenMMSI.has(t.mmsi))
    .map(t => ({ ...t, stale: true })); // mark as stale so frontend can show age

  const finalTankers = [...tankers, ...preserved];
  console.log(`[fetch-ais-data] Total in blob: ${finalTankers.length} (${tankers.length} live + ${preserved.length} preserved)`);

  // ── Write to Blob ─────────────────────────────────────────
  const duration_ms = Date.now() - startTime;
  const fetchedAt   = new Date().toISOString();

  try {
    await store.setJSON('tankers', {
      fetchedAt,
      duration_ms,
      live_count:  tankers.length,
      total_count: finalTankers.length,
      tankers:     finalTankers,
    });
    console.log(`[fetch-ais-data] Blob written in ${duration_ms}ms`);
  } catch (e) {
    console.error('[fetch-ais-data] Blob write error:', e.message);
  }

  return new Response(JSON.stringify({
    fetchedAt, duration_ms,
    live_count: tankers.length,
    total_count: finalTankers.length,
    vessels: tankers.map(t => `${t.name}(${t.mmsi})`),
  }, null, 2), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
