// ============================================================
// netlify/functions/get-telegram-data.mjs
//
// Serves Telegram messages from Netlify Blobs to the frontend.
// Uses Pro fine-grained caching -- 60s CDN TTL with SWR.
// Short TTL because Telegram messages arrive in real-time.
//
// Routes (via netlify.toml):
//   GET  /api/oil-telegram          -> latest messages
//   POST /api/telegram-register     -> register/update webhook URL
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

  // POST /api/telegram-register -> register webhook at current URL
  // GET  /api/telegram-register -> check current webhook status
  if (method === 'POST' || url.pathname.includes('telegram-register')) {
    if (!BOT_TOKEN) return jsonResponse({ error: 'TELEGRAM_BOT_TOKEN not set. Add it in Netlify env vars.' }, 500);

    const siteUrl = process.env.URL || process.env.DEPLOY_URL;
    if (!siteUrl) return jsonResponse({ error: 'URL env not set' }, 500);

    // GET: return current webhook info so you can verify URL is correct
    if (method === 'GET') {
      try {
        const info = await fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/getWebhookInfo');
        const data = await info.json();
        return jsonResponse({
          status:      'ok',
          webhookInfo: data.result,
          expectedUrl: siteUrl + '/.netlify/functions/telegram-webhook',
          urlMatch:    data.result?.url === siteUrl + '/.netlify/functions/telegram-webhook',
        });
      } catch (e) {
        return jsonResponse({ error: e.message }, 500);
      }
    }

    // POST: register / update webhook URL
    const webhookUrl = siteUrl + '/.netlify/functions/telegram-webhook';
    const body = {
      url:              webhookUrl,
      allowed_updates:  ['message', 'channel_post', 'edited_channel_post'],
      drop_pending_updates: false,
    };
    if (SECRET_TOKEN) body.secret_token = SECRET_TOKEN;

    try {
      const res  = await fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/setWebhook', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      const data = await res.json();
      return jsonResponse({
        registered:   data.ok,
        webhookUrl,
        telegram:     data,
        instructions: data.ok
          ? 'Webhook registered at ' + webhookUrl + '. Add the bot as admin to your channels.'
          : 'Registration failed: ' + JSON.stringify(data),
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
      // Polling fallback: try getUpdates if no webhook messages yet
      if (BOT_TOKEN) {
        try {
          const upd = await fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/getUpdates?limit=20&allowed_updates=["channel_post","message"]', {
            signal: AbortSignal.timeout(8000),
          });
          const updData = await upd.json();
          if (updData.ok && updData.result?.length) {
            const messages = updData.result
              .filter(u => u.channel_post || u.message)
              .map(u => {
                const post = u.channel_post || u.message;
                const text = post.text || post.caption || '';
                return {
                  id:       String(u.update_id),
                  headline: text.slice(0, 200),
                  chatName: post.chat?.title || post.chat?.username || 'Telegram',
                  source:   'Telegram',
                  tag:      'TELEGRAM',
                  critical: false,
                  time:     new Date(post.date * 1000).toISOString(),
                  url:      null,
                };
              })
              .filter(m => m.headline.length > 5)
              .slice(0, 20);
            if (messages.length) {
              return jsonResponse({ status: 'ok', messages, count: messages.length, source: 'polling' }, 200, { 'Cache-Control': 'no-store' });
            }
          }
        } catch {}
      }
      return jsonResponse({
        status:  'no_messages',
        message: 'No Telegram messages yet. Register webhook: POST /api/telegram-register',
        messages: [],
        count: 0,
      }, 200, { 'Cache-Control': 'no-store', 'Netlify-CDN-Cache-Control': 'no-store' });
    }

    return jsonResponse(
      { status: 'ok', ...data },
      200,
      {
        // Short CDN TTL -- Telegram messages arrive in real-time
        'Cache-Control': 'public, max-age=30, stale-while-revalidate=60',
        'Netlify-CDN-Cache-Control': 'public, max-age=60, stale-while-revalidate=60, durable',
        'Cache-Tag': 'oil-data,oil-telegram',
      }
    );
  } catch (e) {
    return jsonResponse({ status: 'error', message: e.message, messages: [] }, 500);
  }
}
