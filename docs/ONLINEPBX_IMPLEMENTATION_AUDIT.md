# onlinePBX Telephony — Implementation Audit

**Date:** 2026-06-07  
**Branch:** post-demo-improvements  
**Auditor:** Senior Full-Stack Engineer (AI)

---

## 1. Pre-Implementation State

### CallButton (frontend)

- Location: `frontend/apps/web/src/App.tsx` — `function CallButton()`
- Was passing `{ phone }` only; no session credentials.
- **Bug:** Missing `credentials: "include"` — session cookie was not sent, so backend saw unauthenticated request.
- **Bug:** No `crmUserId` sent to backend → extension lookup always returned `null` → dry-run extension `"dryrun_ext"` used even when a real mapping existed.
- `telFallback` response field was ignored; fallback did not open `tel:` link.

### POST /api/leads/:id/call

- Location: `backend/server/src/index.ts`
- Protected with `makeRequireAuth(MANAGER_UP)` ✅
- Extension lookup relied on `body.crmUserId`, which the client never sent → lookup always skipped.
- Used `actorFromLocals(res)` for audit log tracking ✅
- Created `calls` row and `messages` row for AmoFeed ✅
- Dry-run path fully functional ✅

### POST /api/webhooks/onlinepbx

- Location: `backend/server/src/index.ts`
- Secret verification: checks `x-onlinepbx-token`, `x-webhook-secret`, `authorization` headers ✅
- Payload normalized via `normalizeOnlinePbxWebhook()` ✅
- Existing call found by `externalCallId` ✅
- Phone → contact → lead matching ✅
- Call record create/update ✅
- AmoFeed message create/update ✅
- Missed call → callback task creation ✅
- **Bug:** No duplicate callback task prevention — sending multiple missed webhooks for the same call would create multiple "Перезвонить клиенту" tasks.

### AmoFeed (frontend)

- `call.outgoing`, `call.incoming`, `call.missed`, `call.completed` action titles defined ✅
- History events rendered as a single text line: `"timeStr · title"` — no rich UI for call events.
- **Gap:** `recordingUrl` in audit log payload was never rendered as a clickable link.

### System Status (GET /api/system/status)

- `onlinePbx` section returned: `{ enabled, dryRun, configured, domainMasked, requiredEnvVars }`.
- **Gap:** Missing `apiKeyConfigured`, `webhookSecretConfigured`, `mappingCount`.
- Frontend `SystemStatus` type and rendering matched the old API shape.

### Adapter (backend/server/src/integrations/onlinepbx.ts)

- `getOnlinePbxConfig()` ✅ — reads all env vars safely
- `publicOnlinePbxConfig()` ✅ — safe subset for frontend
- `startOutgoingCall()` ✅ — dry-run fully functional, real call with TODO marker
- `normalizeOnlinePbxWebhook()` ✅ — resilient field mapping with TODO for real payloads
- `verifyOnlinePbxWebhook()` ✅ — optional HMAC/secret check
- No API keys logged anywhere ✅

### Data Model

- `calls` table: full extended schema with `externalCallId`, `managerExtension`, `clientPhone`, `provider`, `rawPayloadJson`, `errorMessage`, `startedAt`, `answeredAt`, `endedAt` ✅
- `pbxUserMappings` table: `crmUserId`, `onlinepbxExtension`, `isActive` ✅
- Schema applied idempotently at server startup via `ensureTelephonySchema()` ✅

---

## 2. Changes Made in This Phase

### Backend

| Change | File | Detail |
|--------|------|--------|
| Extract `doOutgoingCall()` service | `index.ts` | Shared logic between both call endpoints. Extension lookup now uses `res.locals.currentUser.id` from session (not `body.crmUserId`). |
| Add `ONLINEPBX_ENABLED=false` short-circuit | `doOutgoingCall()` | When telephony is disabled: creates a failed `calls` row, returns `{ telFallback: true }`. No crash. |
| Add `POST /api/telephony/onlinepbx/call` | `index.ts` | Generic endpoint; accepts `dealId`, `contactId`, `taskId`, `phone`, `managerExtension`. Auth: `MANAGER_UP`. |
| Refactor `POST /api/leads/:id/call` | `index.ts` | Now delegates to `doOutgoingCall()`. Extension from session user. |
| Prevent duplicate callback tasks | `POST /api/webhooks/onlinepbx` | Before creating "Перезвонить клиенту": check for existing open task with same title on the same lead. |
| Enrich system status | `GET /api/system/status` | Added: `apiBaseUrlConfigured`, `domainConfigured`, `apiKeyConfigured`, `apiKeyMasked`, `webhookSecretConfigured`, `mappingCount`. Removed: legacy `domainMasked`, `configured` fields. |

### Frontend

| Change | File | Detail |
|--------|------|--------|
| `credentials: "include"` in `CallButton` | `App.tsx` | Session cookie now sent with every call request. |
| `telFallback` handling in `CallButton` | `App.tsx` | When telephony disabled: show toast + open `tel:` link. |
| Rich call event rendering in `AmoFeed` | `App.tsx` | Call history events (`call.*`) now render as card with Phone icon, status colour, and recording links. |
| Recording URL links in call cards | `App.tsx` | "Прослушать" + "Скачать" links shown when `recordingUrl` is present in audit log payload. |
| `dry-run` badge in call card | `App.tsx` | Amber "dry-run" label shown on call cards when `dryRun` flag is set. |
| Updated `SystemStatus` type | `App.tsx` | Matches new richer API shape. |
| Updated `SystemStatusPage` onlinePBX section | `App.tsx` | Shows domain, API key, webhook secret, and mapping count individually. |

---

## 3. Endpoint Inventory

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/telephony/config` | None | Public telephony config (no secrets) |
| GET | `/api/telephony/mappings` | None | All manager → extension mappings |
| POST | `/api/telephony/mappings` | owner/admin | Upsert extension mapping |
| POST | `/api/telephony/onlinepbx/call` | manager+ | Generic click-to-call |
| POST | `/api/leads/:id/call` | manager+ | Deal-centric click-to-call (delegates to service) |
| GET | `/api/leads/:id/calls` | None | Call history for a deal |
| POST | `/api/webhooks/onlinepbx` | Webhook secret | Receive call events from onlinePBX |

---

## 4. Environment Variables

```env
# --- onlinePBX Telephony ---
ONLINEPBX_ENABLED=false          # true = calls go to provider (or dry-run)
ONLINEPBX_DRY_RUN=true           # true = simulate calls, no real API hit
ONLINEPBX_API_BASE_URL=https://api2.onlinepbx.ru
ONLINEPBX_DOMAIN=                # e.g. yourcompany (domain prefix on onlinepbx.ru)
ONLINEPBX_API_KEY=               # API key from onlinePBX admin panel
ONLINEPBX_WEBHOOK_SECRET=        # Optional: shared secret for webhook verification
```

**Security rules:**
- `ONLINEPBX_API_KEY` is never returned to the frontend; only masked tail shown in system status.
- `ONLINEPBX_WEBHOOK_SECRET` is never returned to the frontend.

---

## 5. Known Limitations (MVP scope)

| # | Limitation | Impact | Resolution |
|---|-----------|--------|------------|
| 1 | Exact onlinePBX call endpoint URL is **TODO** | Real calls will fail gracefully; dry-run unaffected | Confirm `POST https://{domain}.onlinepbx.ru/call/create.json` with client |
| 2 | Webhook field names are **TODO** | Normalization may produce empty fields on real payloads | Capture a real webhook sample using onlinePBX test panel |
| 3 | Webhook secret header name is **TODO** | Webhooks accepted without secret if not configured | Confirm header from onlinePBX docs; check `x-onlinepbx-token` first |
| 4 | No session refresh for call state | Browser must reload to see timeline update | WebSocket or polling can be added later |
| 5 | No WebRTC / browser softphone | Calls go through desk phone / SIP handset | Explicit out-of-scope per requirements |
| 6 | `measurer`/`installer` roles denied click-to-call | Allowed for manager+ only | Reassess when business confirms they should call assigned clients |

---

## 6. Testing

### Dry-run manual test

1. Login as owner (`admin@bakha.kz` / `admin123`)
2. Open any deal with a phone number
3. Click "Позвонить" — should get toast "Dry-run: звонок создан без реального вызова onlinePBX"
4. Check deal timeline — call event card should appear
5. Check database: `SELECT * FROM calls ORDER BY id DESC LIMIT 1;`

### Webhook manual test

```powershell
# Simulated incoming missed call
Invoke-WebRequest -Uri http://localhost:3000/api/webhooks/onlinepbx `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"call_id":"test001","call_direction":"in","call_state":"noanswer","from_number":"+77001112233","to_number":"101","duration":0}'
```

Expected:
- `200 { ok: true }`
- New `calls` row with `status = "missed"` and `direction = "incoming"`
- New task "Перезвонить клиенту" linked to deal (if phone matches contact)
- Repeating the webhook — no duplicate task created

### Missing extension test

```powershell
# Login first, then:
Invoke-WebRequest -Uri http://localhost:3000/api/telephony/onlinepbx/call `
  -Method POST -ContentType "application/json" `
  -Headers @{"Cookie"="bakha_session=YOUR_SESSION"} `
  -Body '{"phone":"+77001112233"}'
```

With `ONLINEPBX_DRY_RUN=true` (default): proceeds with `dryrun_ext`, returns `{ dryRun: true }`.  
With `ONLINEPBX_DRY_RUN=false`: returns `422` if no extension mapping found for user.
