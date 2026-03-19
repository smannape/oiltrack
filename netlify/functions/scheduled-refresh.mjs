// ============================================================
// netlify/functions/scheduled-refresh.mjs
// Runs every hour. Triggers all 3 background data functions.
// ============================================================

export default async function handler(req) {
  const { next_run } = await req.json().catch(() => ({}));
  console.log(`[scheduled-refresh] Triggered at ${new Date().toISOString()}, next: ${next_run}`);

  const siteUrl = process.env.URL || process.env.DEPLOY_URL;
  if (!siteUrl) {
    console.error('[scheduled-refresh] URL env var not set');
    return new Response('URL env not set', { status: 500 });
  }

  const results = await Promise.allSettled([
    fetch(`${siteUrl}/.netlify/functions/fetch-oil-data-background`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-trigger': 'scheduled' },
    }),
    fetch(`${siteUrl}/.netlify/functions/fetch-ais-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-trigger': 'scheduled' },
    }),
    // EIA charts refresh — runs every hour but EIA updates weekly/monthly
    // Cheap call — if data unchanged, just re-caches same blob
    fetch(`${siteUrl}/.netlify/functions/fetch-eia-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-trigger': 'scheduled' },
    }),
  ]);

  const [oil, ais, eia] = results;

  // Trigger events refresh (daily is fine, but hourly keeps dates fresh)
  fetch(`${siteUrl}/.netlify/functions/fetch-events`, {
    method: 'POST', headers: { 'x-trigger': 'scheduled' },
  }).catch(e => console.warn('[scheduled] fetch-events:', e.message));

  // Trigger EIA extra (non-critical, fire-and-forget)
  fetch(`${siteUrl}/.netlify/functions/fetch-eia-extra`, {
    method: 'POST', headers: { 'x-trigger': 'scheduled' },
  }).catch(e => console.warn('[scheduled] eia-extra:', e.message));
  console.log(`[scheduled-refresh] oil=${oil.status} ais=${ais.status} eia=${eia.status}`);

  return new Response(JSON.stringify({
    triggered: true,
    at: new Date().toISOString(),
    next_run,
    oil_status: oil.status,
    ais_status: ais.status,
    eia_status: eia.status,
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

export const config = { schedule: '0 * * * *' };
