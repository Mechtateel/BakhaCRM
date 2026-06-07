# AI Manager Bridge — Architecture & Plan

**Version:** 2.0  
**Branch:** post-demo-improvements  
**Status:** Hardened — recentMessages context, LeadDetailPage AI cards, edit-before-send, polling

---

## Architecture Overview

```
Client (WhatsApp)
      │
      ▼
  WAPPI Server ─── POST /api/webhooks/wappi ──► BakhaCRM
                                                    │
                                          ┌─────────┘
                                          │
                                   [Message saved]
                                          │
                                 [AI Bridge call]
                                  (non-blocking)
                                          │
                          ┌───────────────┼───────────────┐
                          │               │               │
                    AI disabled      AI skipped       AI called
                   (log skipped)   (paused/media)         │
                                                    [External AI
                                                      Manager]
                                                          │
                                                   [Normalize
                                                    response]
                                                          │
                                              ┌───────────┘
                                              │
                                      ┌───────┴────────┐
                                      │                │
                                AUTO_SEND=true   AUTO_SEND=false
                                (confidence≥min)    (default)
                                      │                │
                               [Send via WAPPI]   [Save as draft
                               [Save AI message]   suggestion]
                               [ai.sent event]    [ai.suggestion
                                                    event]
                                                       │
                                                  [Manager sees
                                                   suggestion card
                                                   in ChatsPage]
                                                       │
                                               ┌───────┴───────┐
                                               │               │
                                          [Approve]       [Reject]
                                               │               │
                                        [Send via WAPPI] [Mark rejected]
                                        [Mark sent]      [ai.rejected]
                                        [ai.approved]
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AI_MANAGER_ENABLED` | `false` | Master switch. `false` = no AI calls |
| `AI_MANAGER_DRY_RUN` | `true` | `true` = realistic local simulation |
| `AI_MANAGER_BASE_URL` | (empty) | External AI Manager base URL |
| `AI_MANAGER_ENDPOINT` | `/api/incoming-message` | Endpoint path |
| `AI_MANAGER_API_KEY` | (empty) | Bearer token. **Never exposed to frontend** |
| `AI_MANAGER_AUTO_SEND` | `false` | `false` = draft; `true` = auto-send if confident |
| `AI_MANAGER_AUTO_ACTIONS` | `false` | CRM actions require approval by default |
| `AI_MANAGER_PAUSE_ON_MANAGER_REPLY` | `true` | Pause AI when manager replies manually |
| `AI_MANAGER_PAUSE_MINUTES` | `30` | Duration of auto-pause after manager reply |
| `AI_MANAGER_MIN_CONFIDENCE` | `0.75` | Minimum confidence for auto-send (0.0–1.0) |

---

## AI Manager API Request Format

```json
POST {AI_MANAGER_BASE_URL}{AI_MANAGER_ENDPOINT}
Authorization: Bearer {AI_MANAGER_API_KEY}
Content-Type: application/json

{
  "conversationId": 42,
  "leadId": 17,
  "contactId": 5,
  "messageId": 101,
  "clientPhone": "77012345678",
  "clientName": "Айгерим С.",
  "text": "Сколько стоит натяжной потолок?",
  "recentMessages": [
    { "role": "client",  "direction": "incoming", "senderType": "client",  "text": "Привет",      "createdAt": "2026-06-07T09:55:00Z" },
    { "role": "manager", "direction": "outgoing", "senderType": "manager", "text": "Добрый день!", "createdAt": "2026-06-07T09:57:00Z" },
    { "role": "client",  "direction": "incoming", "senderType": "client",  "text": "Цена?",        "createdAt": "2026-06-07T10:00:00Z" }
  ],
  "leadStage": "Новый лид",
  "source": "WhatsApp",
  "responsibleManager": "Алексей К."
}
```

### recentMessages rules

- Up to **10** prior messages are loaded from the DB before calling AI.
- Only messages with non-empty text are included (media-only messages are excluded).
- Sorted **oldest → newest** so AI reads the conversation naturally.
- The **current incoming message** is excluded from `recentMessages` (it is sent as `text`).
- Each entry carries `role` (`client` | `manager` | `ai`), plus raw `direction` and `senderType` for the AI to use.
- If no prior messages exist, `recentMessages: []` is sent.
- No secrets, raw payloads, or internal IDs are included.

---

## AI Manager API Response Format

The adapter (`ai-manager.ts`) accepts several response shapes:

```json
{
  "reply": "Здравствуйте! Стоимость зависит от площади...",
  "confidence": 0.85,
  "actions": [
    {
      "type": "add_note",
      "payload": { "note": "Клиент спросил о цене" },
      "confidence": 0.9
    }
  ]
}
```

Alternative accepted shapes:
- `replyText` instead of `reply`
- `message` or `text` instead of `reply`
- `score` instead of `confidence`
- `suggestedActions` instead of `actions`

---

## Dry-Run Mode

When `AI_MANAGER_DRY_RUN=true` (default), the adapter simulates a realistic AI response locally based on keywords:

- **"цена" / "сколько"** → price inquiry response
- **"замер"** → measurement scheduling response
- **"привет"** → greeting response
- **"спасибо"** → acknowledgment response
- **Other** → generic contact response

Dry-run returns confidence `0.82` and one suggested action (add_note).

---

## Suggestion Approval Flow

1. Incoming client message → WAPPI webhook saves it
2. AI bridge called non-blocking after message save
3. AI returns `replyText` with confidence score
4. If `AUTO_SEND=false` (default): suggestion saved as `draft`
5. Manager sees suggestion card in ChatsPage:
   - Purple card: "AI предложил ответ"
   - Shows reply text + confidence %
   - Buttons: "Отправить" / "Отклонить"
6. Manager clicks "Отправить":
   - `POST /api/ai/suggestions/:id/approve`
   - Sends via existing WAPPI sendMessage()
   - Creates outgoing message with `senderType='ai'`
   - Suggestion status → `sent`
   - Audit log: `ai.approved_and_sent`
7. Manager clicks "Отклонить":
   - `POST /api/ai/suggestions/:id/reject`
   - Suggestion status → `rejected`
   - Audit log: `ai.rejected`

---

## Auto-Send Flow (when AUTO_SEND=true)

Auto-send only triggers if ALL conditions are met:
1. `AI_MANAGER_AUTO_SEND=true`
2. `confidence >= AI_MANAGER_MIN_CONFIDENCE`
3. `replyText` is not empty
4. Conversation is not paused
5. No existing suggestion for this message (dedup)

If auto-send fails (WAPPI error), suggestion is saved as draft and manager is notified.

---

## Safe vs. Dangerous Actions

### Safe (auto-applicable if AUTO_ACTIONS=true)
- Create manager task
- Add note
- Tag lead (if tag system exists)
- Set early funnel stages: Новый лид, На связи, Запись на замер

### Dangerous (always require approval)
- Close deal as won/lost
- Change budget/price
- Confirm payment
- Schedule installation
- Delete/archive anything
- Assign installer
- Send contract
- Give discount

In current implementation, all suggested actions are stored in `suggestedActionsJson` for future implementation. They are never applied automatically.

---

## AI Pause Behavior

| Trigger | Behavior |
|---------|----------|
| New conversation | `aiPaused=true` (AI off by default until activated) |
| Manager sends message | `aiPaused=true` for `AI_MANAGER_PAUSE_MINUTES` (30 min) |
| Timed pause expires | AI auto-resumes on next incoming message |
| Manager clicks "Пауза 30 мин" | `aiPausedUntil = now + 30m` |
| Manager clicks "Выкл" | `aiPaused=true`, no timeout |
| Manager clicks "Включить AI" | `aiPaused=false`, clears timeout |

---

## Duplicate Prevention

| Risk | Prevention |
|------|-----------|
| Same WAPPI webhook twice | `messages.external_message_id` unique index |
| Duplicate AI suggestion | `ai_suggestions(source_message_id)` unique index |
| AI reply reflected back by WAPPI | `senderType='ai'` — `shouldCallAI` rejects non-client messages |
| AI called during paused state | `shouldCallAI` checks `aiPaused` + `aiPausedUntil` |

---

## Database Tables Added

### `ai_events`
Logs every AI call (request, response, error, skipped).

| Column | Type | Description |
|--------|------|-------------|
| `conversation_id` | INTEGER | Linked conversation |
| `lead_id` | INTEGER | Linked lead |
| `message_id` | INTEGER | Source message that triggered AI |
| `direction` | TEXT | `request \| response \| error \| skipped` |
| `status` | TEXT | `pending \| sent \| completed \| failed \| skipped` |
| `reason` | TEXT | Skip reason or error category |
| `request_json` | TEXT | Request body (masked) |
| `response_json` | TEXT | Normalized response (no secrets) |
| `error_message` | TEXT | Error if call failed |

### `ai_suggestions`
Draft reply suggestions from AI, awaiting manager review.

| Column | Type | Description |
|--------|------|-------------|
| `source_message_id` | INTEGER UNIQUE | Prevents duplicate suggestions |
| `reply_text` | TEXT | Suggested reply |
| `confidence` | REAL | AI confidence score (0.0–1.0) |
| `status` | TEXT | `draft \| approved \| rejected \| sent \| failed` |
| `suggested_actions_json` | TEXT | JSON array of suggested CRM actions |
| `reviewed_by_user_id` | INTEGER | Manager who approved/rejected |

### `ai_action_logs`
Records each AI-suggested CRM action outcome.

### `chat_conversations` additions
- `ai_paused_until TEXT` — ISO datetime until which AI is paused
- `ai_pause_reason TEXT` — Why AI was paused

---

## API Endpoints

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /api/ai/suggestions` | manager+ | Focused suggestions: filters by conversationId, leadId, status, since |
| `POST /api/ai/suggestions/:id/approve` | manager+ | Approve and send |
| `POST /api/ai/suggestions/:id/reject` | manager+ | Reject suggestion |
| `PATCH /api/ai/suggestions/:id` | manager+ | Edit replyText of a draft suggestion before sending |
| `POST /api/conversations/:id/ai/pause` | manager+ | Pause AI (30m, until_manual, off) |
| `POST /api/conversations/:id/ai/resume` | manager+ | Resume AI |
| `GET /api/ai/events` | owner/admin | Recent AI events for staging debug (no raw JSON) |
| `POST /api/ai/test-connection` | owner/admin | Test AI Manager connectivity (dry-run or real) |
| `GET /api/chats` | open | Includes `aiSuggestions[]` per conversation + `aiManager` status |
| `GET /api/leads/:id` | open | Includes `aiSuggestions[]` + `conversation` (AI pause state) |
| `GET /api/system/status` | owner/admin | Full AI Manager status + autoSendWarning + AI event log |

### `GET /api/ai/suggestions` query parameters

| Param | Type | Description |
|---|---|---|
| `conversationId` | int | Filter by conversation |
| `leadId` | int | Filter by lead |
| `status` | string | `draft` (default), `sent`, `rejected`, `failed`, `all` |
| `since` | ISO 8601 | Only return suggestions created at or after this timestamp |

### `POST /api/ai/test-connection` response

```json
{
  "ok": true,
  "dryRun": true,
  "status": "dry_run_success",
  "message": "Dry-run: симуляция прошла успешно.",
  "sampleRequest": { "...": "safe test payload, no real client data" },
  "normalizedResponse": {
    "replyText": "Симулированный ответ",
    "confidence": 0.82,
    "actionsCount": 1
  }
}
```

---

## Edit-Before-Send Flow

Manager can refine the AI reply before it reaches the client:

1. AI draft suggestion appears in ChatsPage or LeadDetailPage card.
2. Manager clicks **Редактировать** → inline `<textarea>` opens with the current reply text.
3. Manager edits, clicks **Сохранить** → `PATCH /api/ai/suggestions/:id` with `{ replyText }`.
4. Backend validates: suggestion must be `status=draft`; empty text rejected.
5. Manager clicks **Отправить** → `POST /api/ai/suggestions/:id/approve` sends the edited text.

Rules:
- Sent/rejected suggestions cannot be edited.
- Empty `replyText` is rejected (HTTP 400).
- Raw AI response (`rawJson`) is never altered.
- Edit is logged via `reviewedByUserId` in the suggestions row.

---

## Polling Behavior

Both **ChatsPage** and **LeadDetailPage** poll the backend every **8 seconds** when the browser tab is visible:

- ChatsPage: polls `GET /api/chats` — refreshes conversation list, messages, and `aiSuggestions[]`.
- LeadDetailPage: polls `GET /api/leads/:id` — refreshes messages, `aiSuggestions[]`, and AI pause state.
- Polling is paused when `document.visibilityState !== "visible"` (tab is hidden or minimized).
- Polling restarts immediately when the tab becomes visible again.
- No SSE or WebSocket needed at this stage.
- Each poll replaces local state; no diff/merge required.

---

## Suggested CRM Actions Display

If `ai_suggestions.suggestedActionsJson` is set, a read-only preview is shown below the reply text:

```
AI предложил действия:
• Задача: «Уточнить адрес замера»
• Этап → «Запись на замер»
Будет доступно для применения после настройки правил
```

**No actions are auto-applied.** Action buttons will be added in a future phase when the backend supports safe action execution with audit logs.

Supported action types for display:
- `create_task` — shows `payload.title`
- `set_stage` — shows `payload.stage`
- `add_note` — shows `payload.note`
- `add_tag` — shows `payload.tag`
- Anything else: displayed as its raw `type` string

---

## Questions to Confirm with AI Manager Developer

1. **Request format:** Does the AI Manager accept the payload format described above? What fields are required vs. optional?
2. **Response format:** Does it return `reply`, `replyText`, `message`, or `text`? What about confidence?
3. **Authentication:** Is `Authorization: Bearer {key}` the correct auth scheme?
4. **Timeout:** Is 15 seconds sufficient? Does the AI Manager support async callbacks?
5. **Idempotency:** Does the AI Manager handle duplicate messageIds gracefully?
6. **Actions format:** What action types does the AI Manager return in `actions[]`?
7. **Context:** What additional context fields does the AI Manager need beyond what's sent?
8. **Outgoing messages:** Does the AI Manager need to be informed when a manager sends a manual reply (to update its context)?
9. **Conversation history:** How many recent messages does the AI Manager need for context?
10. **Rate limits:** Are there rate limits on the AI Manager API?

---

## Known Limitations (Current Phase)

1. **Suggested actions not applied:** `suggestedActionsJson` is stored and displayed read-only. Actual action execution is a future phase.
2. **No SSE / WebSocket:** New suggestions appear within ~8 seconds (polling), not instantly.
3. **No webhook retry queue:** If the AI Manager is temporarily unavailable during a WAPPI webhook, the suggestion is silently skipped.
4. **Polling loads full lead/chats payload:** No focused diff endpoint exists yet. Acceptable at current load levels.
5. **recentMessages only from same lead:** Context is scoped to messages for the same `leadId`. Cross-lead history is not sent.

---

## Next Recommended Phase

1. Safe action execution: create tasks / move stage with audit log and undo
2. Focused polling endpoint `GET /api/ai/suggestions?conversationId=X` to reduce payload
3. SSE or WebSocket for instant suggestion delivery
4. Multi-language AI reply support
3. Implement safe action execution (add note, create task)
4. Add polling/SSE for real-time suggestion notifications
5. Add manager notification (push/toast) when new AI suggestion arrives
6. Configure AI Manager URL in settings UI (save to DB)
7. Test auto-send end-to-end with real WAPPI in staging
