// ============================================================
// netlify/functions/scheduled-prices.mjs
//
// Lightweight price-only refresh — runs every 15 minutes.
// Calls fetch-oil-data-background with mode=quick so only the
// Yahoo Finance prices blob is updated (~2-3 s, no EIA/news).
//
// The full hourly refresh (scheduled-refresh.mjs) still runs
// at :00 to update EIA data, news, and everything else.
// ============================================================

export const config = {
  schedule: '*/15 * * * *',   // Every 15 minutes
};

export default async function handler(req) {
  const siteUrl = process.env.URL || process.env.DEPLOY_URL;
  if (!siteUrl) {
    console.error('[scheduled-prices] URL env var not set');
    return new Response('URL env not set', { status: 500 });
  }

  console.log('[scheduled-prices] Triggering quick price refresh at ' + new Date().toISOString());

  try {
    const res = await fetch(siteUrl + '/.netlify/functions/fetch-oil-data-background', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-trigger': 'scheduled-prices',
      },
      body: JSON.stringify({ mode: 'quick' }),
    });
    const data = await res.json().catch(() => ({}));
    console.log('[scheduled-prices] Result:', data.ok ? 'OK' : 'FAILED', data.contracts || '');
    return new Response(JSON.stringify({ triggered: true, result: data }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[scheduled-prices] Error:', e.message);
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
}
