// ============================================================
// netlify/functions/scheduled-refresh.mjs
//
// SCHEDULED FUNCTION (Pro plan) — runs on cron schedule.
// Acts as a lightweight trigger that calls the background
// function which does the actual heavy data fetching.
//
// Schedule: every hour (EIA updates weekly on Wednesdays,
// OPEC publishes MOMR ~12th of month — hourly ensures we
// catch updates within 60 minutes of publication).
//
// On Pro plan: scheduled functions have a 10s execution limit,
// so we immediately hand off to the background function.
// ============================================================

export default async function handler(req) {
  const { next_run } = await req.json().catch(() => ({}));
  console.log(`[scheduled-refresh] Triggered at ${new Date().toISOString()}, next run: ${next_run}`);

  // Kick off the background function asynchronously.
  // Background functions run up to 15 minutes on Pro — plenty
  // of time to fetch all EIA series, OPEC RSS, IEA RSS, Alpha
  // Vantage price history, and write to Netlify Blobs.
  const siteUrl = process.env.URL || process.env.DEPLOY_URL;
  if (!siteUrl) {
    console.error('[scheduled-refresh] URL env var not set — cannot invoke background function');
    return new Response('URL env not set', { status: 500 });
  }

  try {
    // Fire-and-forget both background functions in parallel
    const [oilRes, aisRes] = await Promise.allSettled([
      fetch(`${siteUrl}/.netlify/functions/fetch-oil-data-background`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-trigger': 'scheduled' },
      }),
      fetch(`${siteUrl}/.netlify/functions/fetch-ais-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-trigger': 'scheduled' },
      }),
    ]);
    console.log(`[scheduled-refresh] oil-data: ${oilRes.value?.status || oilRes.reason}, ais-data: ${aisRes.value?.status || aisRes.reason}`);
  } catch (err) {
    console.error('[scheduled-refresh] Failed to invoke background functions:', err.message);
  }

  return new Response(JSON.stringify({ triggered: true, at: new Date().toISOString(), next_run }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Runs every hour on the hour (UTC)
export const config = {
  schedule: '0 * * * *',
};
// ============================================================
// netlify/functions/scheduled-refresh.mjs
//
// SCHEDULED FUNCTION (Pro plan) — runs on cron schedule.
// Acts as a lightweight trigger that calls the background
// function which does the actual heavy data fetching.
//
// Schedule: every hour (EIA updates weekly on Wednesdays,
// OPEC publishes MOMR ~12th of month — hourly ensures we
// catch updates within 60 minutes of publication).
//
// On Pro plan: scheduled functions have a 10s execution limit,
// so we immediately hand off to the background function.
// ============================================================

export default async function handler(req) {
  const { next_run } = await req.json().catch(() => ({}));
  console.log(`[scheduled-refresh] Triggered at ${new Date().toISOString()}, next run: ${next_run}`);

  // Kick off the background function asynchronously.
  // Background functions run up to 15 minutes on Pro — plenty
  // of time to fetch all EIA series, OPEC RSS, IEA RSS, Alpha
  // Vantage price history, and write to Netlify Blobs.
  const siteUrl = process.env.URL || process.env.DEPLOY_URL;
  if (!siteUrl) {
    console.error('[scheduled-refresh] URL env var not set — cannot invoke background function');
    return new Response('URL env not set', { status: 500 });
  }

  try {
    // Fire-and-forget both background functions in parallel
    const [oilRes, aisRes] = await Promise.allSettled([
      fetch(`${siteUrl}/.netlify/functions/fetch-oil-data-background`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-trigger': 'scheduled' },
      }),
      fetch(`${siteUrl}/.netlify/functions/fetch-ais-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-trigger': 'scheduled' },
      }),
    ]);
    console.log(`[scheduled-refresh] oil-data: ${oilRes.value?.status || oilRes.reason}, ais-data: ${aisRes.value?.status || aisRes.reason}`);
  } catch (err) {
    console.error('[scheduled-refresh] Failed to invoke background functions:', err.message);
  }

  return new Response(JSON.stringify({ triggered: true, at: new Date().toISOString(), next_run }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Runs every hour on the hour (UTC)
export const config = {
  schedule: '0 * * * *',
};
