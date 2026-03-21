// get-stocks.mjs
// GET  /api/stocks         -> serve stocks blob
// POST /api/stocks-refresh -> trigger background refresh

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
      await fetch(`${siteUrl}/.netlify/functions/fetch-stocks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-trigger': 'manual' },
      });
      return json({ triggered: true, message: 'Stocks refresh started. Data ready in ~15 seconds.' });
    } catch (e) {
      return json({ error: e.message }, 500);
    }
  }

  try {
    const store = getStore('crude-radar');
    const raw   = await store.get('stocks', { type: 'text' });
    if (!raw) {
      const siteUrl = process.env.URL;
      if (siteUrl) {
        fetch(`${siteUrl}/.netlify/functions/fetch-stocks`, {
          method: 'POST', headers: { 'x-trigger': 'cold-start' },
        }).catch(() => {});
      }
      return json({
        status: 'initializing', stocks: [], summary: {},
        message: 'Stock data loading. Retry in ~20 seconds.',
      }, 202, { 'Cache-Control': 'no-store' });
    }

    const data = JSON.parse(raw);
    // Cache 15 mins -- stock data is delayed anyway
    return json(
      { status: 'ok', ...data },
      200,
      {
        'Cache-Control': 'public, max-age=900, stale-while-revalidate=3600',
        'Netlify-CDN-Cache-Control': 'public, max-age=900, stale-while-revalidate=3600, durable',
        'Cache-Tag': 'stocks',
      }
    );
  } catch (e) {
    return json({ status: 'error', message: e.message }, 500, { 'Cache-Control': 'no-store' });
  }
}
