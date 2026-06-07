# WAPPI WhatsApp Integration Plan

**Project:** Bakha CRM  
**Updated:** 2026-06-07  
**Status:** Foundation complete — dry-run operational; real mode requires client credentials

---

## Overview

WAPPI is the WhatsApp messaging provider integrated into Bakha CRM.  
It enables managers to send/receive WhatsApp messages directly inside deal cards and the Chats page.

---

## Architecture

```
Frontend (React)
    └─ Deal detail composer ──► POST /api/leads/:id/messages
    └─ ChatsPage composer ────► POST /api/leads/:id/messages

Backend (Express)
    └─ POST /api/leads/:id/messages
         │
         ├─ Resolve lead + primary contact phone (direct DB join)
         ├─ [disabled] Save as local_only → return { localOnly: true }
         ├─ [enabled]  sendMessage() ──► WAPPI REST API (or dry-run)
         ├─ Insert messages row
         ├─ getOrCreateConversation → chat_conversations
         └─ writeLeadHistory → audit_logs

WAPPI Provider
    └─ Incoming message ──► POST /api/webhooks/wappi
                                 │
                                 ├─ Verify WAPPI_WEBHOOK_SECRET
                                 ├─ normalizeIncomingWebhook()
                                 ├─ Deduplicate by externalMessageId
                                 ├─ findContactByPhone → create if new
                                 ├─ findPrimaryLeadByContact → createWappiLead if new
                                 ├─ Insert messages row (incoming, senderType=client)
                                 ├─ touchConversation (unreadCount+1)
                                 └─ writeLeadHistory
```

---

## Required Credentials

| Credential | Env Var | How to obtain |
|-----------|---------|---------------|
| WAPPI token | `WAPPI_TOKEN` | wappi.pro → Profile → API Token |
| WAPPI profile ID | `WAPPI_PROFILE_ID` | wappi.pro → Profile → Profile ID |
| Webhook secret | `WAPPI_WEBHOOK_SECRET` | Generate random string; set same in WAPPI webhook settings |

---

## Environment Variables

```env
WAPPI_ENABLED=false          # Set true when ready
WAPPI_DRY_RUN=true           # Set false only when ENABLED=true and credentials set
WAPPI_API_BASE_URL=https://wappi.pro   # Has default; only set to override
WAPPI_PROFILE_ID=            # Required for real sending
WAPPI_TOKEN=                 # Required for real sending
WAPPI_WEBHOOK_SECRET=        # Recommended for production
```

**Security:**
- `WAPPI_TOKEN` is never exposed to frontend
- Masked tail shown in system status only
- Never logged

---

## Mode Behavior

| WAPPI_ENABLED | WAPPI_DRY_RUN | Frontend toast | DB status |
|---------------|---------------|----------------|-----------|
| false | any | "WAPPI не подключен. Сообщение сохранено локально." | `local_only` |
| true | true | "Dry-run: сообщение сохранено в CRM без реальной отправки." | `sent` (dry-run-xxx ID) |
| true | false | "Сообщение отправлено через WhatsApp." | `sent` (real ID) |

---

## Outgoing Message Flow

1. Manager types message in deal detail (Chat WAPPI tab) or ChatsPage
2. `POST /api/leads/:id/messages` with `{ text }` + session cookie
3. Backend:
   - Resolves primary contact phone via direct DB join (not full bootstrap)
   - Normalizes phone
   - Creates or finds conversation in `chat_conversations`
   - [disabled] Saves with `status=local_only`; no API call
   - [dry-run] Calls `sendMessage()` which returns `dry-run-{timestamp}` as externalMessageId
   - [real] Calls WAPPI `POST /api/sync/message/send`
   - Saves `messages` row
   - Writes audit log
4. Frontend shows toast; reloads messages

---

## Incoming Webhook Flow

1. WAPPI posts event to `POST /api/webhooks/wappi`
2. Backend verifies signature (`x-wappi-signature` or `x-webhook-secret` header)
3. `normalizeIncomingWebhook()` extracts: phone, text, externalMessageId, mediaUrl, timestamp
4. Duplicate check: if `externalMessageId` already in DB → return `{ duplicate: true }`
5. Contact lookup by normalized phone:
   - Found → use existing
   - Not found → create new contact `{ name: "WhatsApp {phone}", source: "WAPPI" }`
6. Lead lookup:
   - Found via leadContacts → use existing
   - Not found → `createWappiLead()`: creates lead in first stage with `source: "WAPPI"`
7. Conversation: `getOrCreateConversation()`
8. Insert `messages` row: `direction=incoming`, `senderType=client`, `status=received`
9. `touchConversation()`: `unreadCount+1`, `lastMessageAt=now`
10. `writeLeadHistory()`: `action=message.incoming`

---

## Duplicate Prevention

- Before inserting incoming message, check `messages.externalMessageId`
- If found → skip insert and return `{ ok: true, duplicate: true }`
- This prevents duplicate messages when WAPPI resends on timeout or retry
- Outgoing messages do not have duplicate prevention (different `externalMessageId` per send attempt)

---

## Auto-Lead Creation from WhatsApp

When an incoming message arrives from an unknown phone:
1. Contact created: `name="WhatsApp {phone}"`, `source="WAPPI"`
2. Lead created in first available pipeline stage
3. Lead title: `"WhatsApp {phone}"`
4. `source: "WAPPI"`
5. Lead linked to contact via `leadContacts` (primary)
6. Audit event: `lead.created_from_wappi`

All messages then flow to this auto-created deal's timeline.

---

## Contact/Deal Matching by Phone

Phone normalization: strips non-digits, normalizes length:
- 10 digits → prefix `7` (Kazakhstan mobile)
- 11 digits starting with `8` → replace with `7`
- Other → use as-is

`findContactByPhone()` loads all contacts, compares normalized phones.  
Suitable for <5k contacts; for larger datasets add DB-level phone index.

---

## Local Testing with ngrok / cloudflared

WAPPI webhooks require a public HTTPS URL.

### ngrok
```bash
ngrok http 3000
# Set in WAPPI account: https://abc123.ngrok.io/api/webhooks/wappi
```

### cloudflared
```bash
cloudflared tunnel --url http://localhost:3000
```

### Simulate webhook locally
```powershell
Invoke-WebRequest -Uri http://localhost:3000/api/webhooks/wappi `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"phone":"+77001112233","text":"Привет, хочу замер","id":"local_test_001"}'
```

---

## WAPPI API Details

**Send message endpoint:**
```
POST https://wappi.pro/api/sync/message/send
Authorization: Bearer {WAPPI_TOKEN}
Content-Type: application/json

{
  "profile_id": "{WAPPI_PROFILE_ID}",
  "phone": "77001112233",
  "body": "Текст сообщения"
}
```

**Note:** The send endpoint is confirmed based on WAPPI documentation pattern. Verify exact field names with current WAPPI docs if errors occur.

**Webhook verification:**  
WAPPI sends signature in header `x-wappi-signature` or `x-webhook-secret`.  
Value compared to `WAPPI_WEBHOOK_SECRET`.

---

## Production Checklist

- [ ] Obtain `WAPPI_TOKEN` from client's wappi.pro account
- [ ] Obtain `WAPPI_PROFILE_ID` from wappi.pro account
- [ ] Generate and set `WAPPI_WEBHOOK_SECRET` (random 32+ chars)
- [ ] Test dry-run first: `WAPPI_ENABLED=true, WAPPI_DRY_RUN=true`
  - Send a message from deal → check message appears in timeline
  - POST test webhook → check incoming message appears
- [ ] Deploy server to public HTTPS host (or configure ngrok/cloudflared tunnel)
- [ ] Set webhook URL in WAPPI account: `https://your-domain.com/api/webhooks/wappi`
- [ ] Set webhook secret in WAPPI account to match `WAPPI_WEBHOOK_SECRET`
- [ ] Set `WAPPI_DRY_RUN=false` and `WAPPI_ENABLED=true`
- [ ] Test real outgoing message from deal
- [ ] Test incoming message from WhatsApp → appears in CRM
- [ ] Test duplicate message prevention (resend same webhook twice)
- [ ] Test new contact/lead auto-creation from unknown number

---

## Next Phase

After WAPPI is live in production:
1. **AI Manager integration** — forward incoming WAPPI messages to AI for draft response suggestions
2. **Outgoing status webhooks** — update message status from `sent` to `delivered`/`read`
3. **Media message preview** — render images/audio/video in feed
4. **Pagination** — paginate `GET /api/chats` for large message volumes
5. **Unread reset** — clear unread count when manager opens conversation
