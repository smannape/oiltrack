// get-eia-extra.mjs
// GET  /api/eia-extra   -> serve eia-extra blob
// POST /api/eia-extra   -> trigger background refresh

import { getStore } from '@netlify/blobs';

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', ...extra },
  });
}

export default async function handler(req) {
  if (req.method.toUpperCase() === 'POST') {
    const siteUrl = process.env.URL || process.env.DEPLOY_URL;
    if (!siteUrl) return json({ error: 'URL env not set' }, 500);
    try {
      await fetch(`${siteUrl}/.netlify/functions/fetch-eia-extra`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-trigger': 'manual' },
      });
      return json({ triggered: true, message: 'EIA Extra refresh started. Data ready in ~20 seconds.' });
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  }

  try {
    const store = getStore('crude-radar');
    const raw   = await store.get('eia-extra', { type: 'text' });
    if (!raw) {
      const siteUrl = process.env.URL;
      if (siteUrl) {
        fetch(`${siteUrl}/.netlify/functions/fetch-eia-extra`, {
          method: 'POST', headers: { 'x-trigger': 'cold-start' },
        }).catch(() => {});
      }
      return json({
        status: 'initializing',
        message: 'EIA Extra data loading. Retry in ~20 seconds.',
        crudeProduction: {}, refineryUtil: {}, priceForecast: {},
        tradeBalance: {}, electricityMix: {},
      }, 202, { 'Cache-Control': 'no-store' });
    }

    const data = JSON.parse(raw);
    return json(
      { status: 'ok', ...data },
      200,
      {
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=3300',
        'Netlify-CDN-Cache-Control': 'public, max-age=600, stale-while-revalidate=3000, durable',
        'Cache-Tag': 'eia-extra',
      }
    );
  } catch (e) {
    return json({ status: 'error', message: e.message }, 500, { 'Cache-Control': 'no-store' });
  }
}
