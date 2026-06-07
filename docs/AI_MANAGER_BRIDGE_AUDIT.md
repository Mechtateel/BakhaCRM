# AI Manager Bridge — Audit Report

**Date:** 2026-06-07  
**Branch:** post-demo-improvements  
**Auditor:** Senior Full-Stack Engineer

---

## 1. Current WAPPI Incoming Message Flow

```
POST /api/webhooks/wappi
  │
  ├── verifyWebhook() — secret header check
  ├── normalizeIncomingWebhook() — phone/text/media extraction
  ├── Duplicate check — messages.external_message_id unique index
  ├── findContactByPhone() — or create new contact
  ├── findPrimaryLeadByContact() — or createWappiLead()
  ├── getOrCreateConversation() — chat_conversations (aiPaused=true)
  ├── db.insert(messages) — direction=incoming, senderType=client
  ├── touchConversation() — update unread_count, last_message_at
  ├── writeLeadHistory() — audit_log: message.incoming
  └── res.json({ ok, leadId, contactId, conversationId, message })
```

**Webhook response:** Always returns 200 OK (even on errors: returns 500 on exception).

**AI Bridge hook point:** After `db.insert(messages)` and `touchConversation()`, before `res.json()`. Must be non-blocking (fire-and-forget) to avoid delaying webhook response.

---

## 2. Where Incoming Messages Are Saved

**Table:** `messages`  
**Key columns:**
- `direction = 'incoming'`
- `sender_type = 'client'`
- `external_message_id` — unique, used for dedup
- `lead_id`, `contact_id` — linked entities
- `text`, `body` — message content
- `status = 'received'`

**Related table:** `chat_conversations`  
- `ai_paused` (INTEGER, default 1 = true) — per-conversation AI pause flag
- Currently **no** `ai_paused_until`, `ai_pause_reason` columns

---

## 3. Where AI Should Be Called

**Primary hook:** Line ~945 in `backend/server/src/index.ts`, immediately after message insert in the WAPPI webhook handler.

**Secondary hook:** Manager outgoing message handler (`POST /api/leads/:id/messages`), where `aiPaused = true` is currently set permanently. This should be changed to timed pause using `aiPausedUntil`.

**Conditions for calling AI:**
1. `AI_MANAGER_ENABLED=true` (env var)
2. Message `direction = 'incoming'` and `senderType = 'client'`
3. `conversation.aiPaused = false` (AI not paused for this conversation)
4. `conversation.aiPausedUntil` is null OR in the past
5. No existing `ai_suggestion` for this `sourceMessageId` (duplicate prevention)
6. Message is not media-only (no text) — configurable
7. `message.senderType` is not `'ai'`, `'manager'`, `'system'`

---

## 4. Current Conversation Pause Support

**DB field:** `chat_conversations.ai_paused` (BOOLEAN, default true)

**Current behavior:**
- Every new conversation starts with `aiPaused = true` (AI off by default)
- When manager sends outgoing message: `aiPaused` is set to `true` (permanent)
- No time-based pause (no `aiPausedUntil`)
- No reason stored (no `aiPauseReason`)
- No API endpoints to toggle pause
- Frontend has `ChatConversation.aiPaused` type field but it's not used in the UI

**Missing for bridge:**
- `ai_paused_until TEXT` — datetime until which AI is paused
- `ai_pause_reason TEXT` — reason for pause (e.g. "manager_reply")
- API: `POST /api/conversations/:id/ai/pause`
- API: `POST /api/conversations/:id/ai/resume`
- UI: AI toggle and pause controls in ChatsPage

---

## 5. Duplicate Reply Risks

### WAPPI webhook duplicates
- **Existing protection:** `external_message_id` unique index on `messages` table
- If same webhook is received twice, the duplicate check catches it and returns early
- **AI protection needed:** Unique index on `ai_suggestions(source_message_id)` prevents duplicate AI suggestion for same incoming message

### AI auto-send loop prevention
- **Risk:** If AI sends a WhatsApp message via WAPPI, WAPPI may send that outgoing message back as an incoming webhook
- **Protection needed:** 
  1. Outgoing AI messages saved with `senderType = 'ai'`
  2. `shouldCallAI()` must reject messages where `senderType != 'client'`
  3. AI outgoing messages get an `externalMessageId`; if WAPPI reflects them back, the duplicate check catches it

### Manager send during AI processing
- **Risk:** Manager sends reply while AI is still processing → AI suggestion becomes irrelevant
- **Protection:** AI creates suggestion as `draft`, manager must manually approve. Auto-send checks `aiPausedUntil` before sending.

---

## 6. Existing AI-Related Code

| Location | Status |
|----------|--------|
| `chat_conversations.ai_paused` | EXISTS — default true |
| `integrations/aiManager.ts` | Stub only — not imported by backend |
| `GET /api/system/status` aiManager section | Minimal — only `AI_MANAGER_URL` check |
| Frontend `ChatConversation.aiPaused` type | Defined but unused in UI |
| Frontend AI Manager integration card | EXISTS — shows basic status |
| `messages.senderType` values | `'client'`, `'manager'` — no `'ai'` yet |

---

## 7. Safe Integration Plan

### Phase A — Foundation (implemented in this PR)
1. **Migration 0005:** Add `ai_events`, `ai_suggestions`, `ai_action_logs` tables; add `ai_paused_until`, `ai_pause_reason` to `chat_conversations`
2. **Adapter:** `backend/server/src/integrations/ai-manager.ts` — isolated, testable
3. **WAPPI hook:** Non-blocking AI call after message save; `AI_MANAGER_ENABLED=false` by default
4. **Draft suggestions:** Save AI reply as `ai_suggestions.status='draft'`; manager approves manually
5. **API endpoints:** Suggestions CRUD, pause/resume
6. **UI:** Suggestion card in ChatsPage, AI controls, AI events in deal feed
7. **Env vars:** All AI config via env, secrets never exposed to frontend

### Phase B — Production (requires confirmation with AI Manager developer)
1. Set `AI_MANAGER_ENABLED=true` after testing dry-run
2. Confirm AI Manager API format and authentication
3. Test auto-send flow end-to-end with real WAPPI
4. Enable `AI_MANAGER_AUTO_SEND=true` after client approval

### Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| AI fails → breaks webhook | AI called in try/catch, webhook always returns 200 |
| Duplicate AI suggestions | Unique index on `ai_suggestions(source_message_id)` |
| AI loop (outgoing reflected back) | `shouldCallAI` checks `senderType === 'client'` |
| AI auto-sends during manager takeover | `aiPausedUntil` prevents AI for N minutes after manager reply |
| Secret leakage | API keys never in API response; masked in status |
| AI formats change | All AI I/O isolated in `ai-manager.ts` adapter |
| AI crashes CRM | Full try/catch; AI call is non-blocking fire-and-forget |

---

## 8. Files to Create/Modify

| File | Action |
|------|--------|
| `db/migrations/0005_ai_manager.sql` | CREATE — new tables + ALTER columns |
| `db/schema/index.ts` | MODIFY — add Drizzle table definitions |
| `backend/server/src/integrations/ai-manager.ts` | CREATE — adapter |
| `backend/server/src/index.ts` | MODIFY — import adapter, add routes, hook webhook |
| `frontend/apps/web/src/App.tsx` | MODIFY — types, ChatsPage, AmoFeed, settings |
| `.env.example` | MODIFY — add AI Manager env vars |
| `docs/AI_MANAGER_BRIDGE_PLAN.md` | CREATE — architecture plan |
| `docs/CLIENT_LAUNCH_CHECKLIST.md` | CREATE — launch checklist |
