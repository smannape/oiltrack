// ============================================================
// netlify/functions/get-oil-data.mjs
//
// Serves cached oil data from Netlify Blobs to the frontend.
// Uses Netlify Pro fine-grained caching with stale-while-
// revalidate (SWR) — responses are served from Netlify's
// edge CDN. The Blob is only read when the CDN cache is stale.
//
// Routes (via netlify.toml redirects):
//   GET  /api/oil-data         → full dataset
//   GET  /api/oil-data?type=prices → prices only
//   GET  /api/oil-data?type=news   → news only
//   GET  /api/oil-data?type=eia    → EIA data only
//   GET  /api/oil-data?type=meta   → fetch status
//   POST /api/oil-refresh          → trigger background refresh
// ============================================================

import { getStore } from '@netlify/blobs';

// REPLACE WITH:
function getBlobKey(url) {
  // Check query param first (direct function calls)
  try {
    const u = new URL(url);
    const type = u.searchParams.get('type');
    if (type && ['latest','prices','news','eia','tankers','meta'].includes(type)) return type;
  } catch (_) {}

  // Fall back to path-based detection (Netlify redirects strip query params)
  if (url.includes('/oil-prices'))  return 'prices';
  if (url.includes('/oil-news'))    return 'news';
  if (url.includes('/oil-eia'))     return 'eia';
  if (url.includes('/oil-data'))    return 'eia';   // /api/oil-data → EIA blob
  if (url.includes('/oil-tankers')) return 'tankers';
  if (url.includes('/oil-meta'))    return 'meta';
  return 'eia';   // fallback to eia (was 'latest', a key that was never written)
}

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Vary': 'Accept-Encoding',
      ...extraHeaders,
    },
  });
}

export default async function handler(req, context) {
  const method = req.method.toUpperCase();

  // ── POST: trigger immediate background refresh ────────────
  if (method === 'POST') {
    const siteUrl = process.env.URL || process.env.DEPLOY_URL;
    if (!siteUrl) return jsonResponse({ error: 'URL env not set' }, 500);
    try {
      const res = await fetch(`${siteUrl}/.netlify/functions/fetch-oil-data-background`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-trigger': 'manual' },
      });
      return jsonResponse({
        triggered: true,
        status: res.status,
        message: 'Background refresh started. Data ready in ~60 seconds.',
      });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  // ── GET: serve from Blobs with CDN caching ────────────────
  const blobKey = getBlobKey(req.url);

  try {
    const store = getStore('crude-radar');
    const data = await store.get(blobKey, { type: 'json' });

    if (!data) {
      // Cold start — trigger background fetch, return initializing
      const siteUrl = process.env.URL;
      if (siteUrl) {
        fetch(`${siteUrl}/.netlify/functions/fetch-oil-data-background`, {
          method: 'POST', headers: { 'x-trigger': 'cold-start' },
        }).catch(() => {});
      }
      return jsonResponse({
        status: 'initializing',
        message: 'First data fetch in progress. Retry in ~60s.',
        fetchedAt: null, eia: {}, prices: {}, news: [],
      }, 202, { 'Cache-Control': 'no-store', 'Netlify-CDN-Cache-Control': 'no-store' });
    }

    const cacheAgeSeconds = data.fetchedAt
      ? Math.floor((Date.now() - new Date(data.fetchedAt).getTime()) / 1000)
      : 0;

    // ── Guard: don't cache empty prices at CDN ────────────────
    // If the blob exists but has no actual price data (e.g. API keys
    // not configured yet), return with short cache so the next fetch
    // after data is fixed picks up immediately.
    const hasData = blobKey !== 'prices'
      || (data.prices && Object.keys(data.prices).length > 0);

    if (!hasData) {
      return jsonResponse(
        { status: 'ok', cacheAgeSeconds, empty: true, ...data },
        200,
        {
          'Cache-Control': 'no-cache',
          'Netlify-CDN-Cache-Control': 'public, max-age=30, stale-while-revalidate=30',
          'Cache-Tag': `oil-data,oil-${blobKey}`,
        }
      );
    }

    // ── Netlify Pro Fine-Grained Caching ─────────────────────
    // CDN edge: fresh for 5 min, SWR up to 55 min (total 1h TTL)
    // Browser: cache 2 min, SWR up to 58 min
    // 'durable' = store in Netlify's persistent edge cache
    return jsonResponse(
      { status: 'ok', cacheAgeSeconds, ...data },
      200,
      {
        'Cache-Control': 'public, max-age=120, stale-while-revalidate=3480',
        'Netlify-CDN-Cache-Control': 'public, max-age=300, stale-while-revalidate=3300, durable',
        'Cache-Tag': `oil-data,oil-${blobKey}`,
      }
    );
  } catch (e) {
    console.error('[get-oil-data] Blob error:', e.message);
    return jsonResponse({ status: 'error', message: e.message }, 500, {
      'Cache-Control': 'no-store',
    });
  }
}
