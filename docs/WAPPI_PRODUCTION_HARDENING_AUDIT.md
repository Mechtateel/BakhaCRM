# WAPPI Production Hardening Audit

**Version:** 1.0  
**Branch:** post-demo-improvements  
**Date:** 2026-06-07

---

## 1. Current WAPPI Send Flow

```
Manager clicks "Отправить" in ChatsPage or LeadDetailPage
  → POST /api/leads/:id/messages (requires MANAGER_UP auth)
  → Resolves contact phone from lead_contacts JOIN contacts
  → getWappiConfig() → branch:
      WAPPI disabled: insert message(status=local_only), return { localOnly: true }
      WAPPI dry-run:  sendMessage() returns { dryRun: true, externalMessageId: "dry-run-{ts}" }
      WAPPI real:     sendMessage() → POST wappi.pro/api/sync/message/send
  → Insert outgoing message into messages table
  → pause AI for conversation (aiPaused=true, aiPausedUntil=+30min)
  → touchConversation() — update lastMessageAt, no unreadCount bump for outgoing
  → writeLeadHistory() — log outgoing event
  → return { message, dryRun, wappi }
```

**Authorization header:** `Bearer {WAPPI_TOKEN}` — sent only in the outgoing HTTP request to wappi.pro. Never returned to client. Never logged.

---

## 2. Current WAPPI Webhook Flow (Incoming Messages)

```
WAPPI POSTs to /api/webhooks/wappi
  → verifyWebhook(): compare x-wappi-signature or x-webhook-secret header to WAPPI_WEBHOOK_SECRET
  → detectWebhookType(body): classify as "message" | "status" | "unknown"
  
  If "status" (delivery/read receipt):
    → normalizeStatusWebhook(body) → { externalMessageId, status, errorMessage }
    → find message by externalMessageId
    → update message.status (only advance: sent→delivered→read; never regress)
    → if status=failed: writeLeadHistory() "message.delivery_failed"
    → return { ok, statusUpdated, messageId, status }
  
  If "message" (new incoming):
    → normalizeIncomingWebhook(body) → { phone, text, externalMessageId, mediaUrl, ... }
    → if phone or text missing: 400
    → DEDUP: if externalMessageId → SELECT messages WHERE external_message_id=?
        → if exists: return { ok: true, duplicate: true }
    → findContactByPhone(phone) — normalizes phone digits
    → if no contact: insert contacts (name="WhatsApp {phone}", source="WAPPI")
    → findPrimaryLeadByContact(contact.id):
        * fetches ALL linked leads with JOIN
        * prefers: active (score=2) > neutral (1) > won/lost/archived (0)
        * tie-breaks: isPrimary DESC, updatedAt DESC
    → if no lead: createWappiLead() — insert lead + leadContact + history
    → getOrCreateConversation(leadId, contactId, phone)
    → insert message (direction=incoming, senderType=client, externalMessageId=...)
    → touchConversation() — unreadCount++
    → writeLeadHistory() "message.incoming"
    → Fire-and-forget: processIncomingMessageWithAI()
    → return { ok, leadId, contactId, conversationId, message }
```

---

## 3. Database Tables

### `messages`

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | Auto-increment |
| `lead_id` | INTEGER | FK → leads |
| `contact_id` | INTEGER | FK → contacts |
| `channel` | TEXT | "wappi" |
| `direction` | TEXT | "incoming" \| "outgoing" |
| `sender_type` | TEXT | "client" \| "manager" \| "ai" |
| `text` | TEXT | Message body |
| `body` | TEXT NOT NULL | Same as text for WAPPI |
| `external_message_id` | TEXT | WAPPI message ID (nullable) |
| `external_id` | TEXT | Duplicate of external_message_id (legacy) |
| `status` | TEXT | "received" \| "sent" \| "delivered" \| "read" \| "failed" \| "local_only" |
| `raw_json` | TEXT | Raw WAPPI payload (never returned to frontend via conversation messages endpoint) |

**Unique index (added in hardening):** `messages_ext_id_unique_idx ON messages(external_message_id) WHERE external_message_id IS NOT NULL`  
→ DB-level enforcement; app-level dedup check also kept as defense-in-depth.

### `chat_conversations`

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | |
| `lead_id` | INTEGER | FK → leads |
| `contact_id` | INTEGER | FK → contacts |
| `phone` | TEXT NOT NULL | Client phone |
| `channel` | TEXT | "wappi" |
| `status` | TEXT | "open" \| "closed" |
| `unread_count` | INTEGER | Incremented on incoming; reset to 0 via POST /read |
| `last_message_at` | TEXT | ISO timestamp |
| `ai_paused` | BOOLEAN | AI suggestion generation paused |
| `ai_paused_until` | TEXT | ISO timestamp (timed pause) |
| `ai_pause_reason` | TEXT | "manager_reply" \| "manual_off" etc |

---

## 4. Duplicate Prevention (Multi-Layer)

| Layer | Mechanism | Status |
|-------|-----------|--------|
| App-level (webhook) | `SELECT messages WHERE external_message_id=?` before insert → returns `{duplicate:true}` | ✅ Exists |
| DB-level (new) | `UNIQUE INDEX ON messages(external_message_id) WHERE external_message_id IS NOT NULL` | ✅ Added in hardening |
| AI suggestions | `UNIQUE INDEX ON ai_suggestions(source_message_id)` + pre-check | ✅ Exists |
| Approve endpoint | `status !== "draft"` guard → 409 on second approve | ✅ Exists |
| Status webhook | `normalizeStatusWebhook` + status rank check (no regression) | ✅ Added in hardening |

---

## 5. Unread Count Behavior

**Before hardening:**
- Incremented: `touchConversation(convId, ts, 1)` on each incoming message
- Never decremented: no endpoint existed to clear the count

**After hardening:**
- `POST /api/conversations/:id/read` — sets `unread_count = 0`
- ChatsPage calls this endpoint optimistically when a conversation is selected
- UI badge clears immediately (optimistic state update) without a full reload

---

## 6. Pagination (Before vs After)

**Before:**  
`GET /api/chats` fetched ALL messages from the `messages` table in one query. For large databases this could be hundreds of MB.

**After:**  
- `GET /api/chats` returns `messages: []` (deprecated field, kept for backward compat)
- New: `GET /api/conversations/:id/messages?limit=50&before=<messageId>` 
  - Returns at most 50 messages per call in ascending order (oldest→newest)
  - `hasMore: true` → "Загрузить ещё" button appears in ChatsPage
  - `before=X` fetches messages older than message ID X (cursor-based pagination)
  - Does not return `raw_json` field to the frontend

---

## 7. Delivery/Read Status Webhook Support

**Added:** `detectWebhookType(payload)` heuristic classifier in `wappi.ts`  
**Added:** `normalizeStatusWebhook(payload)` in `wappi.ts`

Supported detection patterns:
- Explicit `type` field: `"message_status"`, `"ack"`, `"status_update"`, `"delivery"`, `"delivery_receipt"`, `"read_receipt"`
- Top-level `status` object with `id` field (no `message` wrapper)
- `message` with `from_me=true` + `status` field but no text body

Status normalisation:
- WAPPI ack codes: `"1"→sent`, `"2"→delivered`, `"3"→read`
- String names: `"server"→sent`, `"device"→delivered`, `"seen"→read`, `"error"→failed`
- Status never regresses: read > delivered > sent

**TODO:** Confirm exact real WAPPI status payload shape with WAPPI support team.

---

## 8. Phone Normalisation / Lead Matching

**Phone normalisation** (`normalizePhone`):
- Strips non-digits
- 10 digits: prepend `7` (Kazakhstan mobile)
- 11 digits starting with `8`: replace leading `8` with `7`
- Otherwise: keep digits as-is

**Lead matching** (`findPrimaryLeadByContact`):  
**Before:** returned first lead ordered by `isPrimary DESC, createdAt DESC` — could return a won/archived lead  
**After:** joins with `leads` table, scores by status (`active=2 > other=1 > won/lost/archived=0`), then by `isPrimary`, then by `updatedAt DESC`

---

## 9. WAPPI Settings / Test Panel

**`POST /api/wappi/test-connection`** (added):
- WAPPI disabled → `{ ok: false, status: "disabled", message: "..." }`
- WAPPI dry-run → `{ ok: true, status: "dry_run_success", configured: bool }`
- WAPPI real → calls `GET /api/sync/profile/status` on wappi.pro (10s timeout)
  - Success: `{ ok: true, status: "connected", profileStatus: "..." }`
  - Failure: `{ ok: false, status: "error", message: "Ошибка: ..." }`
- Token never exposed in response

**`WappiSettingsPage` updated:**
- "Проверить WAPPI" button → calls `/api/wappi/test-connection`
- Color-coded result panel shows status, message, profileStatus, configured flag
- Old behavior (checking `/api/system/status`) replaced with the dedicated endpoint

---

## 10. Known Risks / Limitations

| Risk | Status | Mitigation |
|------|--------|-----------|
| Real WAPPI status payload shape unknown | ⚠️ TODO | Flexible heuristic normalizer; test with real WAPPI |
| Phone normalizer may not cover all global formats | ⚠️ Limited | Works for Kazakhstan +7 mobile; add patterns per need |
| `findContactByPhone` loads ALL contacts for comparison | ⚠️ Performance | Acceptable for <10k contacts; add DB index for scale |
| outgoing messages from manager can include `raw_json` with WAPPI response | ✅ Safe | Never returned via conversation messages endpoint |
| No real WAPPI read-receipt API called | ✅ By design | Only CRM-internal unread count cleared; avoids WAPPI rate limits |
| Status delivery webhooks with unknown `externalMessageId` | ✅ Handled | Returns `{ ok: true, statusUpdated: false, reason: "message_not_found" }` |

---

## 11. Recommended Next Steps

1. Confirm real WAPPI webhook payload shapes (message + status) with WAPPI support
2. Add DB index on `contacts.phone` for faster lookups at scale
3. Add media download / proxy endpoint for WAPPI `mediaUrl` images
4. Consider WebSocket or SSE for real-time chat updates instead of 8s polling
5. Add outgoing message status display in ChatsPage (show "delivered", "read" indicators)
