// ============================================================
// netlify/functions/get-eia-data.mjs
// Serves EIA chart data from Netlify Blob to the frontend.
// GET  /api/eia-charts        -> all EIA chart data
// POST /api/eia-refresh       -> trigger background refresh
// ============================================================

import { getStore } from '@netlify/blobs';

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', ...extra },
  });
}

export default async function handler(req) {
  // POST: trigger background refresh
  if (req.method.toUpperCase() === 'POST') {
    const siteUrl = process.env.URL || process.env.DEPLOY_URL;
    if (!siteUrl) return json({ error: 'URL env not set' }, 500);
    try {
      await fetch(`${siteUrl}/.netlify/functions/fetch-eia-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-trigger': 'manual' },
      });
      return json({ triggered: true, message: 'EIA refresh started. Data ready in ~30 seconds.' });
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  }

  // GET: serve from blob
  try {
    const store = getStore('crude-radar');
    const raw = await store.get('eia-charts', { type: 'text' });
    if (!raw) {
      // Cold start — trigger fetch
      const siteUrl = process.env.URL;
      if (siteUrl) {
        fetch(`${siteUrl}/.netlify/functions/fetch-eia-data`, {
          method: 'POST', headers: { 'x-trigger': 'cold-start' },
        }).catch(() => {});
      }
      return json({
        status: 'initializing',
        message: 'EIA data loading. Retry in ~30 seconds.',
        inventory: null, crudeStocks: [], invMoM: [],
        crudeImports: {}, naturalGas: {}, oecdStocks: {},
      }, 202, { 'Cache-Control': 'no-store' });
    }

    const data = JSON.parse(raw);
    return json(
      { status: 'ok', ...data },
      200,
      {
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=3300',
        'Netlify-CDN-Cache-Control': 'public, max-age=600, stale-while-revalidate=3000, durable',
        'Cache-Tag': 'eia-charts',
      }
    );
  } catch (e) {
    return json({ status: 'error', message: e.message }, 500, { 'Cache-Control': 'no-store' });
  }
}
// ============================================================
// netlify/functions/get-eia-data.mjs
// Serves EIA chart data from Netlify Blob to the frontend.
// GET  /api/eia-charts        -> all EIA chart data
// POST /api/eia-refresh       -> trigger background refresh
// ============================================================

import { getStore } from '@netlify/blobs';

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', ...extra },
  });
}

export default async function handler(req) {
  // POST: trigger background refresh
  if (req.method.toUpperCase() === 'POST') {
    const siteUrl = process.env.URL || process.env.DEPLOY_URL;
    if (!siteUrl) return json({ error: 'URL env not set' }, 500);
    try {
      await fetch(`${siteUrl}/.netlify/functions/fetch-eia-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-trigger': 'manual' },
      });
      return json({ triggered: true, message: 'EIA refresh started. Data ready in ~30 seconds.' });
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  }

  // GET: serve from blob
  try {
    const store = getStore('crude-radar');
    const raw = await store.get('eia-charts', { type: 'text' });
    if (!raw) {
      // Cold start — trigger fetch
      const siteUrl = process.env.URL;
      if (siteUrl) {
        fetch(`${siteUrl}/.netlify/functions/fetch-eia-data`, {
          method: 'POST', headers: { 'x-trigger': 'cold-start' },
        }).catch(() => {});
      }
      return json({
        status: 'initializing',
        message: 'EIA data loading. Retry in ~30 seconds.',
        inventory: null, crudeStocks: [], invMoM: [],
        crudeImports: {}, naturalGas: {}, oecdStocks: {},
      }, 202, { 'Cache-Control': 'no-store' });
    }

    const data = JSON.parse(raw);
    return json(
      { status: 'ok', ...data },
      200,
      {
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=3300',
        'Netlify-CDN-Cache-Control': 'public, max-age=600, stale-while-revalidate=3000, durable',
        'Cache-Tag': 'eia-charts',
      }
    );
  } catch (e) {
    return json({ status: 'error', message: e.message }, 500, { 'Cache-Control': 'no-store' });
  }
}
