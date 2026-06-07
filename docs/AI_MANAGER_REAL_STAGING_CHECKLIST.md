# AI Manager — Real Staging Checklist

**Version:** 1.1  
**Branch:** post-demo-improvements  
**Purpose:** Step-by-step guide for connecting the real external AI Manager to Bakha CRM in staging.

> **Tip:** Full curl command script is in [`scripts/staging-ai-test.md`](../scripts/staging-ai-test.md)

---

## 1. Prerequisites

Before connecting the real AI Manager, verify the following:

- [ ] CRM server is running on staging (not production)
- [ ] WAPPI is working in dry-run mode (`WAPPI_DRY_RUN=true`) — no real WhatsApp messages will be sent
- [ ] `AI_MANAGER_AUTO_SEND=false` in `.env` (default — keep this way)
- [ ] `AI_MANAGER_AUTO_ACTIONS=false` in `.env` (default — keep this way)
- [ ] AI Manager developer has confirmed the API contract (see Section 5)
- [ ] AI Manager developer has confirmed: **AI Manager does NOT send WhatsApp itself** (see Section 6)

---

## 2. Required Environment Variables

Add to `.env` on the CRM server:

```env
# Enable AI Manager
AI_MANAGER_ENABLED=true

# Start in dry-run to test without real AI calls
AI_MANAGER_DRY_RUN=false

# External AI Manager URL (no trailing slash)
AI_MANAGER_BASE_URL=https://your-ai-manager.example.com

# Optional: custom endpoint path (default: /api/incoming-message)
AI_MANAGER_ENDPOINT=/api/incoming-message

# API key for AI Manager (Bearer token)
AI_MANAGER_API_KEY=your-secret-key-here

# Safety: keep auto-send OFF for staging
AI_MANAGER_AUTO_SEND=false

# Safety: keep auto-actions OFF
AI_MANAGER_AUTO_ACTIONS=false

# Pause AI when manager replies manually
AI_MANAGER_PAUSE_ON_MANAGER_REPLY=true
AI_MANAGER_PAUSE_MINUTES=30

# Minimum confidence to show suggestion (0.0–1.0)
AI_MANAGER_MIN_CONFIDENCE=0.75
```

After editing `.env`, restart the server: `npm run dev:server`

---

## 3. How to Test — Dry-Run First

### 3.1 Verify dry-run simulation

1. Set `AI_MANAGER_ENABLED=true`, `AI_MANAGER_DRY_RUN=true` in `.env`
2. Send a test WhatsApp message to the CRM from your test phone
3. Open CRM → Чаты or the lead detail page
4. Within a few seconds (polling every 8s): an **AI draft suggestion card** should appear
5. The card will show a locally simulated response (no real AI Manager called)
6. Try **Отправить**, **Редактировать**, **Отклонить**

### 3.2 Test the connection panel

1. Go to **Настройки → Интеграции**
2. Find the **AI Manager** card
3. Click **"Проверить подключение AI Manager"**
4. Expected result (dry-run): `Dry-run: симуляция прошла успешно`

### 3.3 Check system status

1. Go to **Настройки → Состояние системы**
2. Verify the **AI Manager Bridge** section:
   - Включён: Да
   - Dry-run режим: Активен (or Отключён for real mode)
   - Base URL: Настроен
   - API Key: Настроен
   - Авто-отправка: Выключена
   - Авто-действия: Выключены
3. Expand **Логи AI событий** and verify events appear after test messages

---

## 4. How to Test — Real AI Manager Connection

1. Set `AI_MANAGER_DRY_RUN=false` in `.env` and restart server
2. Click **"Проверить подключение AI Manager"** in Integrations settings
3. Expected result: `Соединение с AI Manager установлено`
4. Send a real WhatsApp test message
5. Verify a draft suggestion appears in CRM within the AI Manager response time
6. Check **Логи AI событий** in system status for `direction=request` + `direction=response` events
7. Manually approve one suggestion and verify WAPPI sends it (if WAPPI_DRY_RUN=false)

---

## 5. API Contract — CRM ↔ AI Manager

### CRM → AI Manager (POST request)

```
POST {AI_MANAGER_BASE_URL}{AI_MANAGER_ENDPOINT}
Authorization: Bearer {AI_MANAGER_API_KEY}
Content-Type: application/json
```

**Request body:**

```json
{
  "conversationId": 42,
  "leadId": 17,
  "contactId": 5,
  "messageId": 101,
  "clientPhone": "77012345678",
  "clientName": "Айгерим С.",
  "text": "Сколько стоит потолок?",
  "recentMessages": [
    {
      "role": "client",
      "direction": "incoming",
      "senderType": "client",
      "text": "Привет",
      "createdAt": "2026-06-07T09:55:00.000Z"
    },
    {
      "role": "manager",
      "direction": "outgoing",
      "senderType": "manager",
      "text": "Добрый день!",
      "createdAt": "2026-06-07T09:57:00.000Z"
    }
  ],
  "leadStage": "Новый лид",
  "source": "WhatsApp",
  "responsibleManager": "Алексей К."
}
```

**Field descriptions:**

| Field | Type | Description |
|---|---|---|
| `conversationId` | int | CRM conversation ID |
| `leadId` | int | CRM lead/deal ID |
| `contactId` | int | CRM contact ID |
| `messageId` | int | Current incoming message ID |
| `clientPhone` | string | Client phone number |
| `clientName` | string | Client name from CRM |
| `text` | string | Current incoming message text |
| `recentMessages` | array | Up to 10 prior messages (oldest→newest) |
| `recentMessages[].role` | "client"\|"manager"\|"ai" | Who sent this message |
| `recentMessages[].direction` | "incoming"\|"outgoing" | Message direction |
| `recentMessages[].senderType` | "client"\|"manager"\|"ai" | Sender type |
| `recentMessages[].text` | string | Message text |
| `recentMessages[].createdAt` | ISO 8601 | When it was sent |
| `leadStage` | string\|null | Current pipeline stage name |
| `source` | string\|null | Lead source |
| `responsibleManager` | string\|null | Responsible manager name |

### AI Manager → CRM (response)

The CRM adapter accepts several response formats:

**Preferred format:**

```json
{
  "replyText": "Здравствуйте! Стоимость зависит от площади...",
  "confidence": 0.92,
  "suggestedActions": [
    {
      "type": "create_task",
      "payload": { "title": "Уточнить площадь потолка" },
      "confidence": 0.85
    }
  ],
  "metadata": {}
}
```

**Alternative field names accepted by the adapter (`normalizeAIResponse`):**

| Category | Accepted field names (first match wins) |
|---|---|
| Reply text | `replyText`, `reply`, `message`, `answer`, `output`, `response`, `text` |
| Nested reply | `data.replyText`, `data.reply`, `data.message`, `data.answer`, `data.text` |
| Confidence | `confidence`, `score`, `probability`, `certainty`, `data.confidence`, `data.score` |
| Confidence scale | 0.0–1.0 **or** 0–100 (auto-normalised by dividing by 100) |
| Actions array | `suggestedActions`, `actions`, `tasks`, `recommendations`, `data.suggestedActions` |
| Action type field | `type` or `action` inside each action object |
| Action payload field | `payload`, `params`, or `data` inside each action object |

**AI Manager error signalling:**
- HTTP `4xx` / `5xx` → CRM records error, no suggestion saved
- HTTP `200` with `{ "error": "some error message" }` → CRM also treats as error (skips suggestion)
- HTTP `200` with no reply text → suggestion saved with `replyText: null` (manager sees empty card)

**Timeout:** CRM waits up to **15 seconds** for a response. The webhook returns `200` to WAPPI immediately regardless; the AI call is non-blocking.

---

## 6. Duplicate Message Risk — Critical

### The rule

> **AI Manager must NOT independently send WhatsApp messages.**
> Only the CRM sends WhatsApp via WAPPI when a manager approves a suggestion.

### Why this matters

If both the AI Manager AND the CRM send the same reply:
- Client receives the message **twice**
- Cannot be recalled
- Damages trust

### Current safeguards

1. `AI_MANAGER_AUTO_SEND=false` by default — CRM never auto-sends AI replies
2. Manager must click **Отправить** to approve each suggestion
3. Suggestion status guard: `status !== "draft"` → 409 error on second approve attempt
4. `UNIQUE INDEX` on `ai_suggestions(source_message_id)` — one suggestion per incoming message at DB level
5. Duplicate detection in `processIncomingMessageWithAI` logs a `skipped/duplicate_suggestion` event
6. WAPPI webhook dedup via `externalMessageId` — replayed webhook returns `{ duplicate: true }` without re-processing
7. System status shows warning banner if `AUTO_SEND=true`
8. Server startup logs `[AI] WARNING: AI_MANAGER_AUTO_SEND=true` if enabled

### Confirm with AI Manager developer

- [ ] AI Manager does NOT send WhatsApp, LINE, or any messaging channel directly
- [ ] AI Manager only returns a JSON response to the CRM
- [ ] AI Manager does not store WhatsApp session credentials

---

## 7. Sample `curl` for Testing

> See full staged curl script in [`scripts/staging-ai-test.md`](../scripts/staging-ai-test.md).

```bash
# Quick test: direct AI Manager call (bypassing CRM)
curl -X POST https://your-ai-manager.example.com/api/incoming-message \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "conversationId": 0,
    "leadId": 0,
    "contactId": null,
    "messageId": 0,
    "clientPhone": "77000000000",
    "clientName": "Test",
    "text": "Тест подключения",
    "recentMessages": [],
    "leadStage": null,
    "source": "test",
    "responsibleManager": null
  }'
```

Expected response — the CRM normalizer accepts **any** of these shapes:

```json
{ "replyText": "Ответ от AI", "confidence": 0.85 }
{ "reply": "Ответ от AI", "score": 0.85 }
{ "message": "Ответ от AI", "confidence": 85 }
{ "data": { "replyText": "Ответ от AI", "confidence": 0.85 } }
{ "answer": "Ответ от AI" }
```

Or use the CRM test panel: **Настройки → Интеграции → AI Manager → "Проверить подключение"**

---

## 8. Rollback Plan

If the real AI Manager causes issues:

1. Set `AI_MANAGER_ENABLED=false` in `.env` → restart server
2. All new WAPPI messages will be saved normally without AI processing
3. Existing draft suggestions remain in `ai_suggestions` table but won't appear after reload
4. WAPPI and all other CRM features are unaffected

No database changes needed for rollback. The AI bridge is purely additive.

---

## 9. Staging Test Checklist

| Test | Expected | Done |
|---|---|---|
| Set `AI_MANAGER_ENABLED=true`, `DRY_RUN=true` | Config visible in system status | [ ] |
| Test connection button → dry-run | "Симуляция ОК" | [ ] |
| Send WhatsApp test message | Draft suggestion appears in ≤ 8s | [ ] |
| Approve suggestion | Message sent via WAPPI, suggestion marked sent | [ ] |
| Reject suggestion | Card disappears, status=rejected | [ ] |
| Edit suggestion text before send | PATCH updates text, then approve sends edited | [ ] |
| Pause AI for conversation | No new suggestions for 30 min | [ ] |
| Manager reply auto-pauses AI | AI paused for 30 min after manual reply | [ ] |
| Set `DRY_RUN=false`, valid URL | Test connection → "Подключено" | [ ] |
| Real message → AI suggestion | Suggestion from real AI appears in CRM | [ ] |
| AI event log | Events visible in System Status → AI логи | [ ] |
| Rollback: set ENABLED=false | No AI calls, CRM works normally | [ ] |

---

## 10. Questions to Confirm with AI Manager Developer

1. **Request format:** Does the AI Manager accept all fields listed in Section 5? Which are required?
2. **Response format:** Which field name is used for the reply text (`replyText`, `reply`, `message`, etc.)?
3. **Confidence:** Is `confidence` (0.0–1.0) returned? Is `score` used instead?
4. **Actions format:** What action types are returned in `suggestedActions[]`?
5. **Authentication:** Is `Authorization: Bearer` the correct scheme?
6. **Timeout:** Can the AI Manager always respond within 15 seconds?
7. **Idempotency:** Does the AI Manager handle the same `messageId` sent twice (e.g., on retry)?
8. **Direct send:** **Confirmed: AI Manager does NOT send WhatsApp directly?** (critical)
9. **Outgoing messages:** Should the CRM inform the AI Manager when a manager sends a manual reply?
10. **Rate limits:** Are there rate limits on the AI Manager API?
11. **Health check:** Is there a health/ping endpoint (`GET /health` or similar)?
12. **Staging URL:** What is the staging base URL for initial testing?
