// ============================================================
// netlify/functions/telegram-webhook.mjs
//
// Real-time Telegram message receiver (webhook mode).
//
// HOW IT WORKS:
//   1. You create a Telegram bot via @BotFather → get a token
//   2. You add the bot as admin to oil/energy channels you own
//      OR the bot joins public channels you control
//   3. You register this function's URL as the webhook:
//      https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://your-site.netlify.app/.netlify/functions/telegram-webhook
//   4. Telegram pushes every new message to this function
//      instantly — no polling delay
//   5. Function filters for oil/energy relevant content,
//      formats it as a news item, and prepends it to the
//      Netlify Blob 'telegram' store
//   6. The frontend polls /api/oil-telegram every few minutes
//      and shows these as a live Telegram feed panel
//
// SECURITY:
//   - We verify the secret token Telegram sends in the header
//     X-Telegram-Bot-Api-Secret-Token (set in setWebhook call)
//   - This prevents anyone else from posting fake messages
//
// ENV VARS NEEDED:
//   TELEGRAM_BOT_TOKEN     — from @BotFather
//   TELEGRAM_SECRET_TOKEN  — any random string you choose
//                            (passed to setWebhook as secret_token)
// ============================================================

import { getStore } from '@netlify/blobs';

const BOT_TOKEN     = process.env.TELEGRAM_BOT_TOKEN     || '';
const SECRET_TOKEN  = process.env.TELEGRAM_SECRET_TOKEN  || '';

// Max messages to keep in the Blob (rolling window)
const MAX_MESSAGES = 100;

// ── OIL/ENERGY KEYWORD FILTER ─────────────────────────────────
// Only store messages that contain oil/energy keywords.
// Prevents noise from unrelated channel activity.
const OIL_KEYWORDS = [
  'oil','crude','brent','wti','opec','barrel','petroleum','refin',
  'lng','gas','energy','tanker','pipeline','saudi','aramco','adnoc',
  'eia','iea','inventory','production','output','supply','demand',
  'price','market','trade','cargo','vlcc','suezmax','aframax',
  'iran','iraq','russia','uae','kuwait','nigeria','libya',
  'shale','permian','offshore','upstream','downstream',
];

function isOilRelated(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return OIL_KEYWORDS.some(k => lower.includes(k));
}

// ── TAG DETECTION ─────────────────────────────────────────────
function detectTag(text) {
  if (!text) return 'TELEGRAM';
  const t = text.toLowerCase();
  if (t.includes('opec'))                               return 'OPEC';
  if (t.includes('price') || t.includes('barrel') || t.includes('brent') || t.includes('wti')) return 'PRICE';
  if (t.includes('tanker') || t.includes('vlcc') || t.includes('vessel')) return 'TANKER';
  if (t.includes('lng'))                               return 'LNG';
  if (t.includes('shale') || t.includes('permian'))   return 'SHALE';
  if (t.includes('pipeline'))                         return 'PIPELINE';
  if (t.includes('refin'))                            return 'REFINERY';
  if (t.includes('inventory') || t.includes('stock')) return 'REPORT';
  if (t.includes('sanction') || t.includes('war') || t.includes('attack')) return 'GEOPOLITICAL';
  return 'TELEGRAM';
}

function isCritical(text) {
  if (!text) return false;
  const t = text.toLowerCase();
  return ['breaking','urgent','alert','surge','crash','explosion','attack',
          'sanction','war','emergency','record','force majeure','shutdown'].some(k => t.includes(k));
}

function timeAgo(unixTs) {
  const diff = Math.floor(Date.now() / 1000) - unixTs;
  if (diff < 60)    return `${diff}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ── EXTRACT MESSAGE TEXT ──────────────────────────────────────
// Handles plain messages, channel posts, forwarded messages, captions
function extractText(update) {
  const msg = update.message || update.channel_post || update.edited_channel_post;
  if (!msg) return null;
  return msg.text || msg.caption || null;
}

function extractChatName(update) {
  const msg = update.message || update.channel_post || update.edited_channel_post;
  if (!msg?.chat) return 'Telegram';
  return msg.chat.title || msg.chat.username || 'Telegram';
}

function extractMessageId(update) {
  const msg = update.message || update.channel_post || update.edited_channel_post;
  return msg?.message_id || null;
}

function extractTimestamp(update) {
  const msg = update.message || update.channel_post || update.edited_channel_post;
  return msg?.date || Math.floor(Date.now() / 1000);
}

function extractUsername(update) {
  const msg = update.message || update.channel_post;
  if (!msg) return null;
  if (msg.forward_from_chat?.username) return msg.forward_from_chat.username;
  if (msg.chat?.username) return msg.chat.username;
  return null;
}

// ── MAIN HANDLER ─────────────────────────────────────────────
export default async function handler(req, context) {

  // ── Verify Telegram secret token ─────────────────────────
  if (SECRET_TOKEN) {
    const incoming = req.headers.get('x-telegram-bot-api-secret-token') || '';
    if (incoming !== SECRET_TOKEN) {
      console.warn('[telegram-webhook] Invalid secret token — rejecting request');
      return new Response('Unauthorized', { status: 401 });
    }
  }

  // ── Only accept POST from Telegram ───────────────────────
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  let update;
  try {
    update = await req.json();
  } catch {
    return new Response('Bad JSON', { status: 400 });
  }

  // ── Extract and filter message text ──────────────────────
  const text = extractText(update);
  if (!text || !isOilRelated(text)) {
    // Acknowledge to Telegram but don't store
    return new Response('OK', { status: 200 });
  }

  const chatName  = extractChatName(update);
  const msgId     = extractMessageId(update);
  const ts        = extractTimestamp(update);
  const username  = extractUsername(update);

  // Build the URL to the original Telegram message (if public channel)
  const messageUrl = username && msgId
    ? `https://t.me/${username}/${msgId}`
    : null;

  // Format as a news item compatible with the dashboard news feed
  const newsItem = {
    source:      `Telegram: ${chatName}`,
    tag:         detectTag(text),
    headline:    text.slice(0, 280).replace(/\n+/g, ' ').trim(),
    url:         messageUrl,
    time:        timeAgo(ts),
    pubDate:     new Date(ts * 1000).toISOString(),
    unixTs:      ts,
    critical:    isCritical(text),
    chatName,
    username,
    messageId:   msgId,
    fullText:    text.length > 280 ? text : null, // store full text if longer
  };

  // ── Write to Netlify Blobs ────────────────────────────────
  try {
    const store = getStore('crude-radar');

    // Read existing messages
    let existing = [];
    try {
      const current = await store.get('telegram', { type: 'json' });
      if (current?.messages) existing = current.messages;
    } catch { /* first message */ }

    // Prepend new message, keep rolling window
    const messages = [newsItem, ...existing].slice(0, MAX_MESSAGES);

    await store.setJSON('telegram', {
      fetchedAt: new Date().toISOString(),
      count: messages.length,
      messages,
    });

    console.log(`[telegram-webhook] Stored message from "${chatName}": ${text.slice(0, 60)}...`);
  } catch (e) {
    console.error('[telegram-webhook] Blob write error:', e.message);
  }

  // Always return 200 to Telegram — otherwise it retries
  return new Response('OK', { status: 200 });
}
