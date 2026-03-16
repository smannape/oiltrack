// ============================================================
// netlify/functions/get-telegram-data.mjs
//
// Serves Telegram messages from Netlify Blobs to the frontend.
// Uses Pro fine-grained caching — 60s CDN TTL with SWR.
// Short TTL because Telegram messages arrive in real-time.
//
// Routes (via netlify.toml):
//   GET  /api/oil-telegram          → latest messages
//   POST /api/telegram-register     → register/update webhook URL
// ============================================================

import { getStore } from '@netlify/blobs';

const BOT_TOKEN    = process.env.TELEGRAM_BOT_TOKEN    || '';
const SECRET_TOKEN = process.env.TELEGRAM_SECRET_TOKEN || '';

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      ...extraHeaders,
    },
  });
}

export default async function handler(req, context) {
  const url    = new URL(req.url);
  const method = req.method.toUpperCase();

  // ── POST /api/telegram-register: register webhook ────────
  // Call this once after deploying to tell Telegram where to
  // send messages. You can also run the curl command manually.
  if (method === 'POST') {
    if (!BOT_TOKEN) return jsonResponse({ error: 'TELEGRAM_BOT_TOKEN not set' }, 500);

    const siteUrl = process.env.URL || process.env.DEPLOY_URL;
    if (!siteUrl) return jsonResponse({ error: 'URL env not set' }, 500);

    const webhookUrl = `${siteUrl}/.netlify/functions/telegram-webhook`;
    const apiUrl = `https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`;

    const body = {
      url: webhookUrl,
      allowed_updates: ['message', 'channel_post', 'edited_channel_post'],
      drop_pending_updates: false, // keep messages received while offline
    };

    // Add secret token if configured (recommended)
    if (SECRET_TOKEN) body.secret_token = SECRET_TOKEN;

    try {
      const res  = await fetch(apiUrl, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      const data = await res.json();
      return jsonResponse({
        registered: data.ok,
        webhookUrl,
        telegram: data,
        instructions: data.ok
          ? 'Webhook registered! Add the bot as admin to your Telegram channels to start receiving messages.'
          : 'Registration failed. Check your TELEGRAM_BOT_TOKEN env var.',
      });
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }

  // ── GET: serve Telegram messages from Blob ────────────────
  try {
    const store = getStore('crude-radar');
    const data  = await store.get('telegram', { type: 'json' });

    if (!data || !data.messages?.length) {
      return jsonResponse({
        status: 'no_messages',
        message: 'No Telegram messages yet. Register webhook and add bot to channels.',
        messages: [],
        count: 0,
      }, 200, {
        'Cache-Control': 'no-store',
        'Netlify-CDN-Cache-Control': 'no-store',
      });
    }

    return jsonResponse(
      { status: 'ok', ...data },
      200,
      {
        // Short CDN TTL — Telegram messages arrive in real-time
        'Cache-Control': 'public, max-age=30, stale-while-revalidate=60',
        'Netlify-CDN-Cache-Control': 'public, max-age=60, stale-while-revalidate=60, durable',
        'Cache-Tag': 'oil-data,oil-telegram',
      }
    );
  } catch (e) {
    return jsonResponse({ status: 'error', message: e.message, messages: [] }, 500);
  }
}
