# TELEGRAM FEED SETUP GUIDE
## Crude Radar — Real-Time Telegram Intelligence

---

## How It Works

```
Telegram Channel Posts
   ↓  (immediately, pushed by Telegram)
netlify/functions/telegram-webhook.mjs
   ↓  (filters for oil keywords, stores item)
Netlify Blobs: 'crude-radar' → 'telegram'
   ↓  (served with 60s CDN SWR cache)
GET /api/oil-telegram
   ↓  (polled every 60 seconds)
Dashboard: "Telegram Intelligence Feed" panel
```

No polling delay. Messages appear on your dashboard within **seconds** of being posted in any Telegram channel your bot monitors.

---

## Step 1 — Create Your Telegram Bot

1. Open Telegram and search for **@BotFather**
2. Send: `/newbot`
3. Choose a name: `Crude Radar Monitor`
4. Choose a username: `cruderadar_monitor_bot` (must end in `bot`)
5. BotFather sends your token: `7123456789:AAFxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

Keep this token — it's your `TELEGRAM_BOT_TOKEN`.

---

## Step 2 — Generate a Secret Token

This is any random string you make up. It prevents fake webhook calls.

```bash
# Generate one in terminal:
openssl rand -hex 32
# Example output: a3f8c2d1e9b7045628f4a1c3d2e5f8b9a0c4d7e2f1b5c8d3e6f9a2b5c8d1e4
```

This becomes your `TELEGRAM_SECRET_TOKEN`.

---

## Step 3 — Set Environment Variables in Netlify

Netlify Dashboard → **Site Settings** → **Environment Variables**

| Variable | Value |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Token from @BotFather |
| `TELEGRAM_SECRET_TOKEN` | Your random secret string |

Then redeploy the site (Netlify Dashboard → Deploys → Trigger deploy).

---

## Step 4 — Register the Webhook

After deploying with the new env vars, register the webhook by visiting:

```
POST https://your-site.netlify.app/api/telegram-register
```

The easiest way is via curl:
```bash
curl -X POST https://your-site.netlify.app/api/telegram-register
```

Or open it in a browser — the function handles GET by returning instructions.

You should see:
```json
{
  "registered": true,
  "webhookUrl": "https://your-site.netlify.app/.netlify/functions/telegram-webhook",
  "instructions": "Webhook registered! Add the bot as admin to your Telegram channels..."
}
```

Verify it worked:
```bash
curl "https://api.telegram.org/bot<YOUR_TOKEN>/getWebhookInfo"
```

---

## Step 5 — Add the Bot to Oil/Energy Telegram Channels

Your bot can receive messages from:

### Channels you own or admin
Add the bot as an admin and it will receive all posts.

### Recommended public oil/energy channels to add the bot to
(These are public channels — you need to be an admin to add a bot)

| Channel | Focus |
|---------|-------|
| `@oiltrading` | Oil & Gas market insights |
| `@crudeoilnews` | Crude oil breaking news |
| `@energymarkets` | Energy market analysis |
| `@opecnews` | OPEC-related news |
| `@OilPriceNews` | OilPrice.com alerts |

**To add the bot:**
1. Open the channel in Telegram
2. Go to channel settings → Administrators
3. Search for your bot username and add it
4. Grant at least "Read Messages" permission

> **Note:** You can only add a bot to a channel if you are an admin of that channel. For channels you don't control, you need to ask the channel admin to add your bot.

---

## Step 6 — Test It

Send a message in any channel where your bot is an admin. Within seconds, visit your dashboard and you'll see the message in the "Telegram Intelligence Feed" panel (if it contains oil/energy keywords).

Test message that will be captured:
> "Brent crude surges to $85 as OPEC announces surprise cut"

Test message that will be filtered out:
> "Good morning everyone!" ← no oil keywords, filtered

---

## Keyword Filter

The system only stores messages containing these keywords (case-insensitive):

`oil, crude, brent, wti, opec, barrel, petroleum, refinery, lng, gas, energy, tanker, pipeline, saudi, aramco, adnoc, eia, iea, inventory, production, output, supply, demand, price, market, trade, cargo, vlcc, suezmax, aframax, iran, iraq, russia, uae, kuwait, nigeria, libya, shale, permian, offshore, upstream, downstream`

This keeps the feed clean — only relevant trading intelligence gets stored.

---

## Message Flow in the Dashboard

Telegram messages appear in **3 places**:
1. **"Telegram Intelligence Feed" panel** — dedicated panel on the dashboard, showing latest 8 messages with channel name, tag, and link to original
2. **Sidebar news feed** — Telegram items are injected at the top (most recent)
3. **Breaking news ticker** — critical Telegram messages (containing "breaking", "surge", "attack", etc.) appear in the orange ticker at the top

---

## Privacy & Security

- Messages are filtered server-side before storage — only oil-relevant content is kept
- The secret token prevents anyone from sending fake messages to your webhook
- No user data from private messages is ever accessible — bots only receive messages from channels/groups they're explicitly added to
- All stored data lives in your Netlify Blobs (your account only)
- Message history is capped at 100 items (rolling window)

---

## Troubleshooting

**Webhook not receiving messages**
```bash
# Check webhook status
curl "https://api.telegram.org/bot<TOKEN>/getWebhookInfo"
# Look for "last_error_message" — common issue: wrong URL or token
```

**Messages not appearing on dashboard**
- Check the message contains oil/energy keywords
- Check Netlify function logs: Dashboard → Functions → telegram-webhook

**Re-register webhook after domain change**
```bash
curl -X POST https://your-new-site.netlify.app/api/telegram-register
```
