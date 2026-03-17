// ============================================================
// netlify/functions/scheduled-refresh.mjs
//
// Runs every hour on the hour (UTC).
// Triggers both background data functions in parallel:
//   1. fetch-oil-data-background — prices, EIA, news
//   2. fetch-ais-data            — AISstream tanker positions
// ============================================================

export default async function handler(req) {
  const { next_run } = await req.json().catch(() => ({}));
  console.log(`[scheduled-refresh] Triggered at ${new Date().toISOString()}, next: ${next_run}`);

  const siteUrl = process.env.URL || process.env.DEPLOY_URL;
  if (!siteUrl) {
    console.error('[scheduled-refresh] URL env var not set');
    return new Response('URL env not set', { status: 500 });
  }

  // Fire both background functions simultaneously
  const results = await Promise.allSettled([
    fetch(`${siteUrl}/.netlify/functions/fetch-oil-data-background`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-trigger': 'scheduled' },
    }),
    fetch(`${siteUrl}/.netlify/functions/fetch-ais-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-trigger': 'scheduled' },
    }),
  ]);

  const [oil, ais] = results;
  console.log(`[scheduled-refresh] oil=${oil.status === 'fulfilled' ? oil.value?.status : oil.reason} ais=${ais.status === 'fulfilled' ? ais.value?.status : ais.reason}`);

  return new Response(JSON.stringify({
    triggered: true,
    at: new Date().toISOString(),
    next_run,
    oil_status: oil.status,
    ais_status: ais.status,
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const config = {
  schedule: '0 * * * *',
};
