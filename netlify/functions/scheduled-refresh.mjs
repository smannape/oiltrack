// ============================================================
// netlify/functions/scheduled-refresh.mjs
// Scheduled function: runs every hour via Netlify cron.
// Uses v2 inline config -- no netlify.toml schedule entry needed.
// ============================================================

export const config = {
  schedule: '0 * * * *',   // Every hour at :00
};

export default async function handler(req) {
  const body = await req.json().catch(() => ({}));
  const next_run = body.next_run || 'unknown';
  console.log('[scheduled-refresh] Triggered at ' + new Date().toISOString() + ' next: ' + next_run);

  const siteUrl = process.env.URL || process.env.DEPLOY_URL;
  if (!siteUrl) {
    console.error('[scheduled-refresh] URL env var not set');
    return new Response('URL env not set', { status: 500 });
  }

  // Fire all background fetch functions in parallel
  const [oil, ais, eia] = await Promise.allSettled([
    fetch(siteUrl + '/.netlify/functions/fetch-oil-data-background', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-trigger': 'scheduled' },
    }),
    fetch(siteUrl + '/.netlify/functions/fetch-ais-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-trigger': 'scheduled' },
    }),
    fetch(siteUrl + '/.netlify/functions/fetch-eia-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-trigger': 'scheduled' },
    }),
  ]);

  // Fire-and-forget for secondary fetches
  const extras = [
    'fetch-stocks',
    'fetch-events',
    'fetch-eia-extra',
  ];
  for (const fn of extras) {
    fetch(siteUrl + '/.netlify/functions/' + fn, {
      method: 'POST',
      headers: { 'x-trigger': 'scheduled' },
    }).catch(function(e) {
      console.warn('[scheduled] ' + fn + ':', e.message);
    });
  }

  console.log('[scheduled-refresh] oil=' + oil.status + ' ais=' + ais.status + ' eia=' + eia.status);

  return new Response(JSON.stringify({
    triggered: true,
    at:        new Date().toISOString(),
    next_run:  next_run,
    oil:       oil.status,
    ais:       ais.status,
    eia:       eia.status,
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
