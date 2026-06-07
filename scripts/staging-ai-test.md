# Bakha CRM — AI Manager Staging Test Script

> **Safe staging guide for: WAPPI incoming → CRM → AI Manager → draft suggestion → manager approval → WAPPI outgoing**

## Prerequisites

| Item | Value |
|------|-------|
| CRM backend | `http://localhost:3000` (adjust for your staging host) |
| Auth | Login via browser and copy the `session`/`sid` cookie, or use HTTP Basic/Bearer if configured |
| AI Manager | Must be deployed and reachable from CRM backend |
| WAPPI | Must be configured in `.env` or staging secrets |

### Required Environment Variables (server `.env`)

```
# AI Manager
AI_MANAGER_ENABLED=true
AI_MANAGER_DRY_RUN=true          # Set false ONLY after dry-run passes
AI_MANAGER_BASE_URL=https://your-ai-manager.example.com
AI_MANAGER_ENDPOINT=/api/incoming-message
AI_MANAGER_API_KEY=<your-ai-manager-key>   # NEVER commit real key
AI_MANAGER_AUTO_SEND=false        # Keep false during staging
AI_MANAGER_AUTO_ACTIONS=false     # Keep false during staging

# WAPPI
WAPPI_ENABLED=true
WAPPI_DRY_RUN=true               # Set false only when ready for real WhatsApp
WAPPI_API_URL=https://wappi.pro/api
WAPPI_API_TOKEN=<your-wappi-token>
WAPPI_PROFILE_ID=<your-profile-id>
WAPPI_WEBHOOK_SECRET=<your-webhook-secret>
```

### Session Cookie

Login via browser, open DevTools → Application → Cookies, copy the value of the `connect.sid` cookie (or whatever session cookie name your CRM uses). Use it as:

```bash
COOKIE="connect.sid=s%3A<your-session-value>"
```

---

## Step 1 — Verify AI Manager Config

```bash
# Check system status (includes AI Manager config)
curl -s -H "Cookie: $COOKIE" http://localhost:3000/api/system/status | jq .aiManager
```

Expected (dry-run mode):
```json
{
  "enabled": true,
  "dryRun": true,
  "baseUrlConfigured": true,
  "endpoint": "/api/incoming-message",
  "apiKeyConfigured": true,
  "autoSend": false,
  "autoActions": false
}
```

---

## Step 2 — Test AI Manager Connection

```bash
curl -s -X POST \
  -H "Cookie: $COOKIE" \
  http://localhost:3000/api/ai/test-connection | jq .
```

### Expected — dry-run success:
```json
{
  "ok": true,
  "dryRun": true,
  "status": "dry_run_success",
  "message": "Dry-run mode: AI call simulated locally. Set AI_MANAGER_DRY_RUN=false to test real AI.",
  "sampleRequest": { "conversationId": 0, "leadId": 0, "text": "[staging-test]", "recentMessages": [] },
  "normalizedResponse": { "replyText": "...", "confidence": 0.82 }
}
```

### Expected — real connection success:
```json
{
  "ok": true,
  "dryRun": false,
  "status": "connected",
  "message": "AI Manager responded successfully.",
  "normalizedResponse": { "replyText": "...", "confidence": 0.9 }
}
```

### If connection fails:
```json
{
  "ok": false,
  "status": "error",
  "message": "Ошибка: fetch failed — ECONNREFUSED",
  "error": "fetch failed"
}
```
→ Check `AI_MANAGER_BASE_URL` and that the AI Manager server is reachable from CRM.

---

## Step 3 — Simulate WAPPI Incoming Message

> Sends a fake WhatsApp webhook to trigger the full pipeline: contact/lead creation → AI call → draft suggestion.

```bash
# Use a test phone that won't conflict with real clients
TEST_PHONE="+79990000001"
WEBHOOK_SECRET="<your-webhook-secret-from-env>"

curl -s -X POST http://localhost:3000/api/webhooks/wappi \
  -H "Content-Type: application/json" \
  -H "x-wappi-signature: $WEBHOOK_SECRET" \
  -d "{
    \"type\": \"message\",
    \"message\": {
      \"id\": \"stg-test-001\",
      \"from_me\": false,
      \"phone\": \"$TEST_PHONE\",
      \"text\": {\"body\": \"Здравствуйте, интересует цена на натяжной потолок\"},
      \"time\": $(date +%s),
      \"chat_id\": \"${TEST_PHONE}@s.whatsapp.net\"
    }
  }" | jq .
```

### Expected response:
```json
{
  "ok": true,
  "leadId": 42,
  "contactId": 15,
  "conversationId": 8,
  "message": { "id": 120, "direction": "incoming", "senderType": "client" }
}
```

### Dedup test — send the same message again (same `id: "stg-test-001"`):
```bash
# Same curl as above — should return duplicate=true
```
Expected:
```json
{ "ok": true, "duplicate": true }
```

---

## Step 4 — Check AI Suggestion Was Created

```bash
# Replace LEAD_ID with the leadId from Step 3
LEAD_ID=42
curl -s -H "Cookie: $COOKIE" \
  "http://localhost:3000/api/ai/suggestions?leadId=$LEAD_ID&status=draft" | jq '.suggestions'
```

Expected:
```json
[
  {
    "id": 1,
    "conversationId": 8,
    "leadId": 42,
    "replyText": "Здравствуйте! Стоимость натяжного потолка...",
    "confidence": 0.82,
    "status": "draft",
    "createdAt": "2026-06-07T..."
  }
]
```

If `suggestions` is empty:
- Check AI event logs (Step 6) for the skip reason
- Check server logs for `[AI]` prefixed lines
- Check that `AI_MANAGER_ENABLED=true` in running process

---

## Step 5 — Check AI Event Logs

```bash
# Replace LEAD_ID with the leadId from Step 3
curl -s -H "Cookie: $COOKIE" \
  "http://localhost:3000/api/ai/events?leadId=$LEAD_ID&limit=10" | jq '.events'
```

Expected events (most recent first):
1. `direction: "response"`, `status: "completed"` → AI replied OK
2. `direction: "request"`, `status: "sent"` → CRM sent to AI

If you see `direction: "skipped"`:
- `reason: "ai_paused"` → conversation is paused, resume it first
- `reason: "duplicate_suggestion"` → webhook was replayed, suggestion already exists
- `reason: "ai_disabled"` → check `AI_MANAGER_ENABLED=true`
- `reason: "no_text"` → webhook payload had no text body

---

## Step 6 — Approve AI Suggestion

```bash
# Replace SUGGESTION_ID with the id from Step 4
SUGGESTION_ID=1
curl -s -X POST \
  -H "Cookie: $COOKIE" \
  "http://localhost:3000/api/ai/suggestions/$SUGGESTION_ID/approve" | jq .
```

Expected (WAPPI dry-run):
```json
{ "ok": true, "sent": true, "dryRun": true }
```

Expected (real WAPPI):
```json
{ "ok": true, "sent": true, "dryRun": false }
```

### Double-approve test (should fail cleanly):
```bash
curl -s -X POST \
  -H "Cookie: $COOKIE" \
  "http://localhost:3000/api/ai/suggestions/$SUGGESTION_ID/approve" | jq .
```
Expected:
```json
{ "error": "Suggestion is already sent" }
```

---

## Step 7 — Edit AI Suggestion Before Sending

```bash
SUGGESTION_ID=1
curl -s -X PATCH \
  -H "Cookie: $COOKIE" \
  -H "Content-Type: application/json" \
  -d '{"replyText": "Здравствуйте! Отредактированный ответ менеджера."}' \
  "http://localhost:3000/api/ai/suggestions/$SUGGESTION_ID" | jq .suggestion.replyText
```

Then approve the edited suggestion (Step 6).

---

## Step 8 — Reject AI Suggestion

```bash
SUGGESTION_ID=2  # use a different draft suggestion
curl -s -X POST \
  -H "Cookie: $COOKIE" \
  "http://localhost:3000/api/ai/suggestions/$SUGGESTION_ID/reject" | jq .
```

Expected:
```json
{ "ok": true }
```

---

## Step 9 — Pause / Resume AI

### Pause for 30 minutes:
```bash
CONVERSATION_ID=8
curl -s -X POST \
  -H "Cookie: $COOKIE" \
  -H "Content-Type: application/json" \
  -d '{"pauseMinutes": 30, "reason": "staging-test"}' \
  "http://localhost:3000/api/conversations/$CONVERSATION_ID/pause-ai" | jq .
```

### Send another webhook (same conversation) — should be skipped:
```bash
# Same as Step 3 but with a new message id
curl -s -X POST http://localhost:3000/api/webhooks/wappi \
  -H "Content-Type: application/json" \
  -H "x-wappi-signature: $WEBHOOK_SECRET" \
  -d "{
    \"type\": \"message\",
    \"message\": {
      \"id\": \"stg-test-002\",
      \"from_me\": false,
      \"phone\": \"$TEST_PHONE\",
      \"text\": {\"body\": \"Ещё одно сообщение\"},
      \"time\": $(date +%s),
      \"chat_id\": \"${TEST_PHONE}@s.whatsapp.net\"
    }
  }" | jq .
```

Check AI events — should show `direction: "skipped"`, `reason: "ai_paused"` or `"ai_paused_until"`.

### Resume AI:
```bash
curl -s -X POST \
  -H "Cookie: $COOKIE" \
  "http://localhost:3000/api/conversations/$CONVERSATION_ID/resume-ai" | jq .
```

---

## Step 10 — Verify No Duplicate WhatsApp Sends

After approving suggestion in Step 6, check the outgoing messages for the lead:

```bash
curl -s -H "Cookie: $COOKIE" \
  "http://localhost:3000/api/leads/$LEAD_ID/messages" | \
  jq '[.messages[] | select(.senderType == "ai" or .senderType == "manager") | {id, senderType, text, createdAt}]'
```

Confirm:
- Only ONE outgoing message exists per approval
- `senderType` is `"ai"` (approved AI suggestion) or `"manager"` (manual send)

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Test connection returns `disabled` | `AI_MANAGER_ENABLED` not `true` | Update `.env`, restart server |
| Test connection returns `misconfigured` | Missing `AI_MANAGER_BASE_URL` | Add `AI_MANAGER_BASE_URL` to `.env` |
| Webhook returns 401 | Wrong `WAPPI_WEBHOOK_SECRET` | Match secret in curl header and `.env` |
| No suggestion created | AI call failed or returned no `replyText` | Check AI event logs for direction=error |
| Approve returns 502 | WAPPI send failed | Check WAPPI config; in dry-run it should never 502 |
| Duplicate suggestion logged | Webhook replayed with same message id | Expected — dedup works correctly |

---

## Critical: Duplicate WhatsApp Send Risk

**If your AI Manager sends WhatsApp messages directly AND the CRM also sends on approval → clients receive 2 messages.**

Confirm with your AI Manager team:
- The AI Manager must **only return a reply text** to the CRM
- The AI Manager must **NOT send WhatsApp directly**  
- The CRM handles all WAPPI sending via `POST /api/ai/suggestions/:id/approve`

---

*Last updated: 2026-06-07 | Branch: post-demo-improvements*
