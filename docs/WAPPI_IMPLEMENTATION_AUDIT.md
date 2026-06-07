# WAPPI WhatsApp — Implementation Audit

**Date:** 2026-06-07  
**Branch:** post-demo-improvements

---

## 1. Pre-Implementation State

### Adapter (`backend/server/src/integrations/wappi.ts`)

Fully implemented:
- `getWappiConfig()` ✅ — reads env vars; **bug**: `apiBaseUrl` had no default (now fixed to `https://wappi.pro`)
- `publicWappiConfig()` ✅ — **bug**: `configured` required `apiBaseUrl` to be set explicitly; now only needs `token + profileId`
- `normalizePhone()` ✅
- `normalizeIncomingWebhook()` ✅ — resilient multi-field extraction with TODO comments
- `verifyWebhook()` ✅ — optional secret check
- `sendMessage()` ✅ — dry-run + real API with correct WAPPI endpoint: `POST /api/sync/message/send`

### Backend endpoints (all existed)

| Endpoint | Status | Notes |
|----------|--------|-------|
| `POST /api/leads/:id/messages` | ✅ | **Bug**: used `getBootstrap()` (loads all leads) — now fixed to direct DB join |
| `GET /api/leads/:id/messages` | ✅ | Returns messages + `wappi` config |
| `POST /api/webhooks/wappi` | ✅ | Duplicate prevention, auto contact/lead creation |
| `GET /api/chats` | ✅ | Returns conversations + all messages + wappi config |
| `GET /api/system/status` | ✅ | **Gap**: WAPPI section missing individual field flags |

### Data model (schema already complete)

- `messages` table — all fields present including `externalMessageId`, `rawJson`
- `chat_conversations` table — present with `phone`, `unreadCount`, `lastMessageAt`, `aiPaused`

### Backend helpers (all existed)

- `createWappiLead()` ✅ — creates lead + leadContact link, fires audit event
- `getOrCreateConversation()` ✅ — upserts `chat_conversations`
- `touchConversation()` ✅ — updates `unreadCount` and `lastMessageAt`
- `findContactByPhone()` ✅ — note: loads all contacts in memory; acceptable at current scale
- `findPrimaryLeadByContact()` ✅

### Frontend (all components existed)

| Component | Status | Notes |
|-----------|--------|-------|
| `sendWappiChatMessage()` | ✅ | **Gap**: did not handle `localOnly` response |
| `WappiStateBadge` | ✅ | Shown in deal detail + chats page |
| `MessageList` | ✅ | Renders chat bubbles; used in deal detail and chats |
| `ChatsPage` | ✅ | **Gap**: read-only, no send composer |
| WAPPI integration card | ✅ | **Gap**: "Настроить" navigated to system status, not WAPPI page |
| System status WAPPI section | ✅ | **Gap**: single `configured` flag, missing individual field flags |

---

## 2. Changes Made in This Phase

### Backend

| File | Change |
|------|--------|
| `wappi.ts` | Default `apiBaseUrl` = `https://wappi.pro`; `configured` now only requires `token + profileId` |
| `index.ts` | `POST /api/leads/:id/messages` — replaced `getBootstrap()` with direct lead+contact DB join |
| `index.ts` | `POST /api/leads/:id/messages` — explicit `WAPPI_ENABLED=false` path: status `local_only`, response `localOnly: true` |
| `index.ts` | `GET /api/system/status` — added `apiBaseUrlConfigured`, `profileIdConfigured`, `tokenConfigured`, `webhookSecretConfigured` to WAPPI section |

### Frontend

| File | Change |
|------|--------|
| `App.tsx` | `SystemStatus.wappi` type extended with new individual flag fields |
| `App.tsx` | `sendWappiChatMessage()` — handles `localOnly: true` response with correct Russian toast |
| `App.tsx` | New `WappiSettingsPage` component at `/settings/integrations/wappi` |
| `App.tsx` | Route added: `<Route path="/settings/integrations/wappi" element={<WappiSettingsPage />} />` |
| `App.tsx` | Integration card "Настроить" button for WAPPI navigates to `/settings/integrations/wappi` |
| `App.tsx` | `ChatsPage` — added send composer with `sendFromChats()` function |
| `App.tsx` | `SystemStatusPage` WAPPI section — individual field rows, `apiBaseUrlConfigured` shows "(По умолчанию)" when not explicitly set |

---

## 3. Endpoint Inventory

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/leads/:id/messages` | manager+ | Send outgoing WAPPI message; handles disabled/dry-run/real |
| `GET` | `/api/leads/:id/messages` | None | Message history + wappi config |
| `POST` | `/api/webhooks/wappi` | Webhook secret | Receive incoming WAPPI events |
| `GET` | `/api/chats` | None | All conversations + messages |

---

## 4. Environment Variables

```env
WAPPI_ENABLED=false          # true = enable sending (default false)
WAPPI_DRY_RUN=true           # true = save locally but don't call WAPPI API (default true)
WAPPI_API_BASE_URL=https://wappi.pro  # optional, has default
WAPPI_PROFILE_ID=            # Required for real sending
WAPPI_TOKEN=                 # Required for real sending
WAPPI_WEBHOOK_SECRET=        # Optional: verify incoming webhooks
```

---

## 5. Mode Behavior

| WAPPI_ENABLED | WAPPI_DRY_RUN | Behavior |
|---------------|---------------|----------|
| false | any | Message saved with `status=local_only`; response `{ localOnly: true }`; no API call |
| true | true | Message sent via `sendMessage()` which returns dry-run result; `externalMessageId=dry-run-xxx` |
| true | false | Real WAPPI API call to `/api/sync/message/send` |

---

## 6. Known Limitations

| # | Limitation | Impact | Resolution |
|---|-----------|--------|------------|
| 1 | `findContactByPhone()` loads all contacts | Scales poorly >10k contacts | Add DB index on `contacts.phone` or use `LIKE` query |
| 2 | No outgoing delivery status webhook handling | Status stays "sent" even if delivered/read | Implement status webhook handler if WAPPI supports it |
| 3 | Chats page loads ALL messages on mount | Scales poorly >10k messages | Paginate `GET /api/chats` response |
| 4 | `externalMessageId` uniqueness not enforced at DB level | Rare duplicate if webhook secret fails and sender retries | Add UNIQUE constraint in `ensureWappiSchema()` migration |
| 5 | No AI Manager connection | Incoming messages not processed by AI | Future phase |
| 6 | `ChatsPage` unread count not cleared on open | UX issue | Add `PATCH /api/conversations/:id/read` endpoint |
| 7 | Media messages only show URL text | Images/audio/video not rendered | Future phase with file preview |

---

## 7. Testing

### Dry-run manual test

1. Login as owner (`admin@bakha.kz` / `admin123`)
2. Open any deal with a phone number → Chat WAPPI tab
3. Type a message and click Send
4. Toast: "Dry-run: сообщение сохранено в CRM без реальной отправки."
5. Message appears as outgoing orange bubble

### Webhook manual test

```powershell
Invoke-WebRequest -Uri http://localhost:3000/api/webhooks/wappi `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"phone":"+77001112233","text":"Добрый день, интересует замер","id":"msg_test_001"}'
```

Expected: `200 { ok: true, leadId: N, contactId: N, message: {...} }`

### Duplicate webhook test

```powershell
# Second request with same id
Invoke-WebRequest -Uri http://localhost:3000/api/webhooks/wappi `
  -Method POST -ContentType "application/json" `
  -Body '{"phone":"+77001112233","text":"Добрый день","id":"msg_test_001"}'
```

Expected: `200 { ok: true, duplicate: true, message: {...} }`

### WAPPI disabled test

Set `WAPPI_ENABLED=false` in .env, restart server, send message from deal.  
Expected: toast "WAPPI не подключен. Сообщение сохранено локально в CRM."  
Message appears in feed with `status: local_only`.
