# onlinePBX Integration Plan

**Project:** Bakha CRM  
**Updated:** 2026-06-07  
**Status:** Foundation complete — dry-run operational; real mode pending client credentials

---

## Overview

onlinePBX is the telephony provider used by the client in AmoCRM.  
This document describes how click-to-call, call logging, webhooks, and recording playback are implemented in Bakha CRM.

---

## Architecture

```
Frontend (React)
    └─ CallButton ──► POST /api/leads/:id/call
                      POST /api/telephony/onlinepbx/call
                           │
Backend (Express)          │
    └─ doOutgoingCall() ───┘
         │
         ├─ Lookup: pbx_user_mappings (session user → extension)
         ├─ Insert: calls row (status=initiated)
         ├─ Insert: messages row (AmoFeed placeholder)
         └─ startOutgoingCall() ──► onlinePBX REST API (or dry-run)
              │
              └─ Update: calls row + messages row with externalCallId

onlinePBX Admin Panel
    └─ POST webhook ──► POST /api/webhooks/onlinepbx
                             │
                             ├─ Normalize payload
                             ├─ Find/create calls row
                             ├─ Update: status, duration, recording
                             ├─ Update: messages row (AmoFeed body)
                             ├─ writeLeadHistory (timeline event)
                             └─ [missed] Create task "Перезвонить клиенту"
```

---

## Required Credentials (from client)

| Credential | Env Var | How to obtain |
|-----------|---------|---------------|
| onlinePBX domain | `ONLINEPBX_DOMAIN` | e.g. `mycompany` from URL `mycompany.onlinepbx.ru` |
| API key | `ONLINEPBX_API_KEY` | onlinePBX admin → API → Generate key |
| Webhook secret | `ONLINEPBX_WEBHOOK_SECRET` | Generate a random string; configure same value in onlinePBX webhook settings |
| Manager extensions | via UI | Settings → Интеграции → Телефония → enter extension per manager |

---

## Environment Variables

```env
ONLINEPBX_ENABLED=false          # Set true when ready for real calls
ONLINEPBX_DRY_RUN=true           # Set false only when ENABLED=true and domain/key configured
ONLINEPBX_API_BASE_URL=https://api2.onlinepbx.ru
ONLINEPBX_DOMAIN=                # Required for real calls
ONLINEPBX_API_KEY=               # Required for real calls
ONLINEPBX_WEBHOOK_SECRET=        # Recommended for production
```

---

## Mode Behavior

| ENABLED | DRY_RUN | Behavior |
|---------|---------|----------|
| false | any | `telFallback=true`; logs failed call; no API call |
| true | true | Simulates call; creates `dryrun_call_xxx` externalCallId; updates DB/timeline |
| true | false | Calls real onlinePBX API; updates DB with real externalCallId |

---

## Click-to-Call Flow

1. User clicks "Позвонить" in deal detail (or contact card)
2. Browser sends `POST /api/leads/:id/call` with `{ phone }` + session cookie
3. Backend:
   - Resolves manager extension from `pbx_user_mappings` for the session user
   - Creates `calls` row (`status=initiated`)
   - Creates `messages` row so call appears immediately in AmoFeed
   - Calls `startOutgoingCall()` via adapter (dry-run or real)
   - Updates `calls` + `messages` with `externalCallId`
   - Writes `call.outgoing` history event (appears in Timeline tab)
4. Frontend shows toast: "Звонок запущен" / "Dry-run: ..." / error message

**Extension missing (non-dry-run mode):**
Returns `422 { error: "Для пользователя не указан добавочный номер onlinePBX..." }`

---

## Webhook Flow

1. onlinePBX posts call event to `POST /api/webhooks/onlinepbx`
2. Backend verifies secret (if configured) — checked in headers: `x-onlinepbx-token`, `x-webhook-secret`, `authorization`
3. Payload normalized via `normalizeOnlinePbxWebhook()`
4. Existing call found by `externalCallId` (or new one created)
5. Contact and lead linked by client phone if not already known
6. `calls` row updated: status, duration, recording URL, timestamps
7. `messages` row updated: body text, mediaUrl (recording)
8. `writeLeadHistory` records `call.incoming` / `call.completed` / `call.missed`
9. If missed incoming: check for existing "Перезвонить клиенту" open task → create only if absent

**Missed call task:**
- Title: "Перезвонить клиенту"
- Due: now + 15 minutes
- Type: call
- Priority: high
- Linked to deal (if found by phone)

---

## Manager Extension Mapping

1. Open Settings → Интеграции → Телефония
2. Enter extension number per manager (e.g. `101`, `102`, `203`)
3. Click Save — saved to `pbx_user_mappings` table
4. Extension is resolved automatically from session user on every call

---

## Recording URLs

- Stored in `calls.recording_url` and `messages.media_url`
- Displayed in AmoFeed call cards as "Прослушать" and "Скачать" links
- Links open in new tab — no credentials embedded in URL
- If onlinePBX returns a signed/expiring URL, note: link may expire; store raw URL as fallback

---

## Local Testing with ngrok / cloudflared

Webhooks from onlinePBX require a public HTTPS URL. Options:

### ngrok
```bash
ngrok http 3000
# Copy the https URL: https://abc123.ngrok.io
# Set webhook in onlinePBX: https://abc123.ngrok.io/api/webhooks/onlinepbx
```

### cloudflared (free, no account)
```bash
cloudflared tunnel --url http://localhost:3000
# Copy the https URL and set in onlinePBX
```

### Simulate webhook locally (no tunnel needed)
```powershell
Invoke-WebRequest -Uri http://localhost:3000/api/webhooks/onlinepbx `
  -Method POST -ContentType "application/json" `
  -Body '{"call_id":"test001","call_direction":"in","call_state":"noanswer","from_number":"+77001112233","duration":0}'
```

---

## What Needs Confirmation from Client / onlinePBX

| # | Item | Status |
|---|------|--------|
| 1 | Exact call initiation endpoint | TODO — likely `POST https://{domain}.onlinepbx.ru/call/create.json` |
| 2 | Real request body fields (`from_number`, `to_number`, etc.) | TODO — confirm with onlinePBX support |
| 3 | Webhook event format and field names | TODO — use onlinePBX admin "Test webhook" to capture sample |
| 4 | Webhook secret header name | TODO — check `x-onlinepbx-token` or `x-webhook-secret` |
| 5 | Recording URL format and expiry | TODO — depends on onlinePBX account plan |

All TODOs are isolated in `backend/server/src/integrations/onlinepbx.ts`. Dry-run works fully without them.

---

## Production Checklist

- [ ] Obtain `ONLINEPBX_DOMAIN` and `ONLINEPBX_API_KEY` from client
- [ ] Generate and set `ONLINEPBX_WEBHOOK_SECRET` (random 32+ chars)
- [ ] Set `ONLINEPBX_ENABLED=true`
- [ ] Test dry-run (`ONLINEPBX_DRY_RUN=true`) with real credentials first
- [ ] Confirm call initiation endpoint (see TODOs in adapter)
- [ ] Deploy server to public HTTPS host
- [ ] Set webhook URL in onlinePBX admin panel
- [ ] Confirm webhook field names using test webhook from onlinePBX panel
- [ ] Set `ONLINEPBX_DRY_RUN=false`
- [ ] Map all manager extensions (Settings → Интеграции → Телефония)
- [ ] Test click-to-call from deal with real phone
- [ ] Test incoming call shows in AmoFeed
- [ ] Test missed call creates "Перезвонить клиенту" task
- [ ] Test recording URL appears as "Прослушать" link
