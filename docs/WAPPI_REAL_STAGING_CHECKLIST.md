# WAPPI Real Staging Checklist

**Version:** 1.0  
**Branch:** post-demo-improvements  
**Purpose:** Step-by-step guide for connecting the real WAPPI integration to Bakha CRM in staging.

> **Full curl script:** [`scripts/staging-ai-test.md`](../scripts/staging-ai-test.md) (includes AI staging)

---

## 1. Prerequisites

- [ ] CRM backend running on staging (not production)
- [ ] A real WAPPI.pro account with a connected WhatsApp number
- [ ] WAPPI token and Profile ID from the WAPPI.pro dashboard
- [ ] A publicly accessible HTTPS URL for the CRM webhook endpoint (see Section 3 for ngrok/cloudflared)
- [ ] `WAPPI_DRY_RUN=true` initially — switch to `false` only after dry-run passes

---

## 2. Required Environment Variables

```env
# Enable WAPPI
WAPPI_ENABLED=true

# Start in dry-run first (no real WhatsApp messages sent)
WAPPI_DRY_RUN=true

# WAPPI credentials (from wappi.pro dashboard)
WAPPI_TOKEN=your_api_token_here
WAPPI_PROFILE_ID=your_profile_id_here

# Webhook security (any random string you choose — set the same in WAPPI dashboard)
WAPPI_WEBHOOK_SECRET=your_random_webhook_secret

# Optional: custom API base URL (default is https://wappi.pro)
# WAPPI_API_BASE_URL=https://wappi.pro
```

After editing `.env`, restart the server: `npm run dev:server`

> **Never commit** `WAPPI_TOKEN` or `WAPPI_WEBHOOK_SECRET` to the repository.

---

## 3. Webhook URL Setup

The CRM listens for incoming WAPPI webhooks at:

```
POST {YOUR_PUBLIC_CRM_URL}/api/webhooks/wappi
```

You must configure this URL in the WAPPI.pro dashboard under **Уведомления (Notifications)**.

### Local Development with ngrok

```bash
# Install ngrok if not already installed
# https://ngrok.com/download

# Expose local port 4000
ngrok http 4000

# ngrok will show: https://abc123.ngrok.io
# Your webhook URL: https://abc123.ngrok.io/api/webhooks/wappi
```

### Local Development with cloudflared

```bash
cloudflared tunnel --url http://localhost:4000
# Your webhook URL: https://random-name.trycloudflare.com/api/webhooks/wappi
```

### Staging Server

If running on a VPS, the webhook URL is: `https://your-domain.com/api/webhooks/wappi`

Configure in CRM Settings → Интеграции → WAPPI → copy the webhook URL displayed there.

---

## 4. How to Test — Dry-Run First

### 4.1 Verify dry-run in WAPPI settings

1. Go to **Настройки → Интеграции → WAPPI**
2. Verify status shows "Dry-run (без реальной отправки)"
3. Click **"Проверить WAPPI"**
4. Expected: green panel "Dry-run: симуляция ОК"

### 4.2 Simulate incoming webhook

```bash
WEBHOOK_SECRET="your_random_webhook_secret"

# Send a fake incoming WhatsApp message
curl -X POST http://localhost:4000/api/webhooks/wappi \
  -H "Content-Type: application/json" \
  -H "x-wappi-signature: $WEBHOOK_SECRET" \
  -d '{
    "type": "message",
    "message": {
      "id": "test-msg-001",
      "from_me": false,
      "phone": "77011234567",
      "text": {"body": "Добрый день, интересует потолок"},
      "time": 1717757400,
      "chat_id": "77011234567@s.whatsapp.net"
    }
  }'
```

Expected response:
```json
{ "ok": true, "leadId": 1, "contactId": 1, "conversationId": 1, "message": { ... } }
```

### 4.3 Verify contact/lead was created

Go to **Сделки** in CRM — a new lead "WhatsApp 77011234567" should appear.

### 4.4 Dedup test — same message ID

Send the same webhook again (same `id: "test-msg-001"`):
```bash
# Same curl as above — should return duplicate=true
```
Expected: `{ "ok": true, "duplicate": true }`

---

## 5. How to Test — Real WAPPI Connection

### 5.1 Switch to real mode

1. Set `WAPPI_DRY_RUN=false` in `.env`
2. Restart server
3. Click **"Проверить WAPPI"** in Settings → WAPPI
4. Expected: green panel "Подключено к WAPPI. Статус профиля: active"

### 5.2 Send a real incoming message

From your personal WhatsApp, send a message to the WhatsApp number connected in WAPPI.

Check:
- Message appears in CRM → Чаты within a few seconds (after WAPPI sends webhook)
- Lead is created or found by phone
- Unread count badge appears on conversation

### 5.3 Send reply from CRM

1. Go to **Чаты**, find the conversation
2. Type a reply and click "Отправить"
3. On the real WhatsApp number, the reply should arrive
4. Response should show: `{ "dryRun": false, "message": { "status": "sent" } }`

---

## 6. Delivery/Read Status Webhook Test

Configure WAPPI to also send status webhooks (if supported by your WAPPI plan).

### Sample status webhook (delivery confirmation)

```bash
curl -X POST http://localhost:4000/api/webhooks/wappi \
  -H "Content-Type: application/json" \
  -H "x-wappi-signature: $WEBHOOK_SECRET" \
  -d '{
    "type": "message_status",
    "status": {
      "id": "wamid.xxx",
      "status": "delivered"
    }
  }'
```

Expected: `{ "ok": true, "statusUpdated": true, "status": "delivered" }`

If message ID not found: `{ "ok": true, "statusUpdated": false, "reason": "message_not_found" }`

### Sample read receipt

```bash
curl -X POST http://localhost:4000/api/webhooks/wappi \
  -H "Content-Type: application/json" \
  -H "x-wappi-signature: $WEBHOOK_SECRET" \
  -d '{
    "type": "message_status",
    "status": {
      "id": "wamid.xxx",
      "status": "read"
    }
  }'
```

---

## 7. Pagination Test

After sending several messages to a conversation, test pagination:

```bash
COOKIE="connect.sid=s%3A<your-session>"

# Get first page (50 most recent messages)
curl -s -H "Cookie: $COOKIE" \
  "http://localhost:4000/api/conversations/1/messages?limit=50" | jq '{count: (.messages | length), hasMore}'

# Load older messages (pass oldest message ID from previous result)
curl -s -H "Cookie: $COOKIE" \
  "http://localhost:4000/api/conversations/1/messages?limit=50&before=25" | jq '{count: (.messages | length), hasMore}'
```

In the UI, the **"Загрузить ещё"** button should appear when `hasMore: true`.

---

## 8. Unread Count Test

1. Send an incoming message (via webhook curl above)
2. Go to **Чаты** — the conversation should show an orange badge with the unread count
3. Click the conversation — badge should disappear immediately (optimistic UI update)
4. Verify the backend was called: `POST /api/conversations/1/read`

---

## 9. Lead Matching Test — Active Lead Preference

If a contact has both an active and a closed lead:

1. Create a contact with two leads — one active, one won
2. Send an incoming message from that contact's phone
3. Verify the message is attached to the **active** lead (not the won one)
4. Check CRM → Сделки → the active lead should show the incoming message

---

## 10. Rollback Plan

If real WAPPI causes issues:

1. Set `WAPPI_DRY_RUN=true` → restart server — switches to simulation immediately
2. Or set `WAPPI_ENABLED=false` → no WAPPI processing at all
3. Existing messages and leads are preserved (no data loss)
4. WAPPI is purely additive — disabling it doesn't affect other CRM features

---

## 11. Questions to Confirm with WAPPI Support

Before staging with real credentials:

1. **Incoming message payload:** What is the exact JSON structure for an incoming WhatsApp message?
2. **Status webhook payload:** What is the exact JSON for delivery/read receipts? Does your WAPPI plan include status webhooks?
3. **Webhook verification:** Is `x-wappi-signature` the correct header name? Is it the raw secret or HMAC-SHA256?
4. **Send endpoint:** Is `/api/sync/message/send` the correct endpoint? What fields are required?
5. **Send response:** What does the response JSON look like? Is the message ID in `id` or `message_id`?
6. **Profile status endpoint:** Is `/api/sync/profile/status?profile_id=...` the correct health check URL?
7. **Rate limits:** Are there send rate limits (messages/minute)?
8. **Media:** How are incoming media (images, documents) delivered — URL or base64?
9. **Multiple numbers:** Does one profile ID support multiple WhatsApp numbers?

---

## 12. Staging Checklist

| Test | Expected | Done |
|------|---------|------|
| `WAPPI_DRY_RUN=true`, check connection panel | "Dry-run: симуляция ОК" | [ ] |
| Simulate incoming webhook (dry-run) | Contact+lead created, message saved | [ ] |
| Dedup: send same webhook twice | Second returns `{duplicate: true}` | [ ] |
| Status webhook: deliver/read | Message.status updated, no new message | [ ] |
| Unread badge appears after incoming | Badge shows count | [ ] |
| Unread badge clears on open | Badge disappears | [ ] |
| Reply from ChatsPage (dry-run) | `{dryRun: true}` response, message saved | [ ] |
| AI suggestion appears (if AI enabled) | Draft card in ChatsPage ≤8s | [ ] |
| Approve AI suggestion (dry-run) | Message marked sent, no real WhatsApp | [ ] |
| `WAPPI_DRY_RUN=false`, real incoming | Message from real WhatsApp appears | [ ] |
| Reply from CRM to real WhatsApp | Client receives message | [ ] |
| `Загрузить ещё` button | Appears when >50 messages in conversation | [ ] |
| Active lead preference | Message attaches to active, not won lead | [ ] |
| WAPPI test-connection: real | Panel shows "Подключено", profile status | [ ] |
| Rollback: `DRY_RUN=true` | CRM still works, no real messages sent | [ ] |
| **UI Phase 5 checks:** | | |
| Outgoing message shows `✓` (sent) | Status indicator visible under bubble | [ ] |
| Status webhook "delivered" → `✓✓` | Updates within 8s polling cycle | [ ] |
| Status webhook "read" → `✓✓` (blue) | Updates within 8s polling cycle | [ ] |
| Status webhook "failed" → `✗ ошибка` | Red bubble + ✗ indicator | [ ] |
| Conversation list shows last message preview | 1-line truncated text in sidebar | [ ] |
| `needsReply` badge shows "ответ" | When last message is incoming/client | [ ] |
| "Требуют ответа" filter | Shows only conversations with `needsReply=true` | [ ] |
| "Непрочитанные" filter with count badge | Orange badge with number | [ ] |
| Fast contact lookup (no full-scan logged) | Server log: no "loading all contacts" | [ ] |
