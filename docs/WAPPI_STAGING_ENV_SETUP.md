# WAPPI Staging Environment Setup

**Version:** 1.0  
**Branch:** post-demo-improvements

> This document explains how to configure and validate the WAPPI integration before production.
> For step-by-step curl commands see [`WAPPI_REAL_STAGING_CHECKLIST.md`](./WAPPI_REAL_STAGING_CHECKLIST.md).

---

## Required Environment Variables

Copy `.env.example` to `.env` and fill in the WAPPI section:

```env
# ─── WAPPI / WhatsApp ──────────────────────────────────────────────────────
# Enable WAPPI integration
WAPPI_ENABLED=true

# Set to true for local testing without real WhatsApp delivery
# Set to false only when ready for real messages
WAPPI_DRY_RUN=false

# WAPPI credentials (from wappi.pro dashboard → Profile → API)
WAPPI_TOKEN=your_api_token_here_do_not_commit
WAPPI_PROFILE_ID=your_profile_id_here

# Webhook secret — any random string; must match what you enter in WAPPI dashboard
WAPPI_WEBHOOK_SECRET=some_random_secret_string_do_not_commit

# Optional: change only if using a self-hosted WAPPI instance
# WAPPI_API_BASE_URL=https://wappi.pro
```

> ⚠️ **NEVER commit** `WAPPI_TOKEN` or `WAPPI_WEBHOOK_SECRET` to the repository.  
> Keep secrets in `.env` (which is `.gitignored`) or in your hosting platform's secret manager.

---

## Example `.env` Without Real Secrets

```env
# ─── WAPPI (dry-run / staging) ──────────────────────────────────────────────
WAPPI_ENABLED=true
WAPPI_DRY_RUN=true
WAPPI_TOKEN=REPLACE_WITH_REAL_TOKEN
WAPPI_PROFILE_ID=REPLACE_WITH_REAL_PROFILE_ID
WAPPI_WEBHOOK_SECRET=REPLACE_WITH_RANDOM_SECRET
```

Start the server after editing:
```bash
npm run dev:server
```

---

## WAPPI Dashboard Configuration

1. Log in to [wappi.pro](https://wappi.pro)
2. Go to **Профили** → select your profile
3. Copy **API Token** → `WAPPI_TOKEN`
4. Copy **Profile ID** → `WAPPI_PROFILE_ID`
5. Go to **Уведомления (Notifications)**:
   - Paste your webhook URL (see below)
   - Paste your `WAPPI_WEBHOOK_SECRET`
   - Enable "Входящие сообщения" (incoming messages)
   - Enable "Статусы сообщений" (message statuses) if available on your plan

---

## Webhook URL Requirement

The CRM must be reachable from WAPPI servers via a **public HTTPS URL**.

The webhook endpoint is:
```
POST https://YOUR_PUBLIC_DOMAIN/api/webhooks/wappi
```

### Local Development — ngrok

```bash
# Install: https://ngrok.com/download
ngrok http 4000

# ngrok output will show something like:
# Forwarding  https://abc123.ngrok-free.app -> http://localhost:4000

# Your webhook URL:
# https://abc123.ngrok-free.app/api/webhooks/wappi
```

> ngrok free tier tunnels expire and change URL on restart. For persistent testing use a paid ngrok plan or cloudflared.

### Local Development — cloudflared

```bash
# Install: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/
cloudflared tunnel --url http://localhost:4000

# Your webhook URL:
# https://random-name.trycloudflare.com/api/webhooks/wappi
```

### Staging / VPS Server

If running on a VPS with a domain name, the webhook URL is:
```
https://crm.yourdomain.com/api/webhooks/wappi
```

Make sure your server has a valid SSL certificate (e.g., via Let's Encrypt / certbot).

---

## Verifying the Setup

### 1. Check CRM Settings

Go to **Настройки → Интеграции → WAPPI** in the CRM.

Expected status indicators:
- Dry-run mode: "Dry-run (без реальной отправки)"
- Real mode: "Активна" (if token + profile ID configured)

### 2. Test Connection Button

Click **"Проверить WAPPI"** in WAPPI settings.

- Dry-run: shows "Dry-run: симуляция ОК"
- Real mode: shows "Подключено к WAPPI. Статус профиля: active"

### 3. Test Incoming Webhook

```bash
WEBHOOK_SECRET="your_webhook_secret"
CRM_URL="http://localhost:4000"  # or your staging URL

curl -X POST "$CRM_URL/api/webhooks/wappi" \
  -H "Content-Type: application/json" \
  -H "x-wappi-signature: $WEBHOOK_SECRET" \
  -d '{
    "type": "message",
    "message": {
      "id": "stg-test-001",
      "from_me": false,
      "phone": "77010000001",
      "text": {"body": "Тест входящего сообщения"},
      "time": '$(date +%s)',
      "chat_id": "77010000001@s.whatsapp.net"
    }
  }'
```

Expected: `{ "ok": true, "leadId": ..., "contactId": ..., "conversationId": ..., "message": { ... } }`

---

## How to Rollback to Dry-Run

If real WAPPI causes issues at any point:

1. Edit `.env`: set `WAPPI_DRY_RUN=true`
2. Restart server: `npm run dev:server`
3. Click "Проверить WAPPI" — should show "Dry-run: симуляция ОК"

No data loss occurs. All existing messages and leads are preserved.

---

## Message Status Indicators (UI)

Once WAPPI status webhooks are configured, outgoing messages in **Чаты** will show:

| Symbol | Meaning |
|--------|---------|
| `✓` | Отправлено (sent to WAPPI) |
| `✓✓` (grey) | Доставлено (delivered to device) |
| `✓✓` (blue) | Прочитано (read by recipient) |
| `✗` | Ошибка доставки (delivery failed) |
| `⟳` | Только локально (WAPPI disabled) |

Status updates appear in the UI within the next 8-second polling cycle after WAPPI sends the status webhook to the CRM.

---

## Contact Phone Lookup Performance

Incoming WAPPI messages are matched to existing contacts by phone number.

**Priority (fast path, uses DB index on `contacts.phone`):**
1. Normalized phone (e.g., `77011234567`)
2. E.164 format (e.g., `+77011234567`)
3. Raw phone as received

**Fallback (slow path, for legacy AMO-imported contacts):**
- Scans all contact phone column values and normalizes in-memory
- Only triggers if no fast-path match is found

For best performance with many contacts, ensure new contacts are always stored with normalized phones (the CRM does this automatically for WAPPI-created contacts).

---

## Conversation Filters

The **Чаты** page has filters with server-computed counts:

| Filter | Shows |
|--------|-------|
| Все | All conversations |
| Непрочитанные | Conversations with `unreadCount > 0` |
| Требуют ответа | Conversations where last message was from client (incoming/client) — `needsReply=true` |
| Закрытые | `status = "closed"` conversations |

`needsReply` is computed server-side in `GET /api/chats` — no client-side message loading required.
