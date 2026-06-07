# WAPPI Real Staging Checklist

**Version:** 2.0
**Branch:** post-demo-improvements
**Updated:** 2026-06-07
**Purpose:** Safe step-by-step guide for connecting real WAPPI credentials to Bakha CRM.

> **Security rules — read before proceeding:**
> - NEVER paste WAPPI credentials into source code.
> - NEVER commit `backend/server/.env`.
> - NEVER log token or password values.
> - NEVER enable `AI_MANAGER_AUTO_SEND=true` without explicit review.
> - NEVER enable `WAPPI_DRY_RUN=false` until dry-run tests pass.

---

## 0. Where credentials go

### Which file does the backend read?

```
backend/server/.env        ← this is the ONLY file the backend reads
```

The backend runs `tsx watch src/index.ts` from the `backend/server/` directory.
`import "dotenv/config"` loads `.env` from the current working directory.

**This file is gitignored and must be created manually.**

### Copy the template:

```bash
# Linux/macOS
cp backend/server/.env.example backend/server/.env

# Windows (PowerShell)
copy backend\server\.env.example backend\server\.env
```

Then edit `backend/server/.env` to fill in your real values.

---

## 1. Where to find WAPPI credentials

### WAPPI_TOKEN (API token)

1. Log in at [https://wappi.pro](https://wappi.pro)
2. Go to your account/profile → **API** or **Access tokens**
3. Copy the long alphanumeric token (e.g. `abc123xyz...`)
4. Paste into `backend/server/.env` as `WAPPI_TOKEN=abc123xyz...`

**Do NOT store the token in any source file or commit.**

### WAPPI_PROFILE_ID (WhatsApp profile identifier)

Your WAPPI.pro account can have multiple WhatsApp profiles (numbers). Each profile has a unique `profile_id`.

1. Log in at [https://wappi.pro](https://wappi.pro)
2. Go to **Profiles** (or similar section)
3. Click your WhatsApp profile (the number you want to use for this CRM)
4. Open the **API** or **Integration** tab within that profile
5. Look for the field labelled **Profile ID** or **profile_id**

> **Important:** The numeric or UUID ID shown in the browser URL (e.g. `/profiles/12345`) may OR may not be the `profile_id` used in API calls. Confirm from the API/Integration tab, not just the URL.

6. Paste into `backend/server/.env` as `WAPPI_PROFILE_ID=<value>`

### WAPPI_WEBHOOK_SECRET (optional)

If WAPPI.pro allows you to configure a webhook verification secret:

1. Generate a random secret: `openssl rand -hex 32`
2. Set it in the WAPPI dashboard under webhook settings
3. Set the same value in `backend/server/.env` as `WAPPI_WEBHOOK_SECRET=<generated>`

If WAPPI does not use a secret, leave this blank — all webhooks are accepted.

---

## 2. Staging Step 1 — Dry-run with real credentials

Edit `backend/server/.env`:

```env
WAPPI_ENABLED=true
WAPPI_DRY_RUN=true
WAPPI_API_BASE_URL=https://wappi.pro
WAPPI_PROFILE_ID=<paste from WAPPI dashboard>
WAPPI_TOKEN=<paste from WAPPI dashboard>
WAPPI_WEBHOOK_SECRET=<optional — only if set in WAPPI dashboard>
```

Restart the backend:

```bash
npm run dev:server
```

Check the server log. You should see:

```
[WAPPI] Dry-run mode. Configured: token=✓, profile=✓. Messages saved locally only.
```

If you see `✗` for token or profile, the env var is not loading. Double-check the file path.

### Test the connection:

```bash
curl -s -X POST http://localhost:4000/api/wappi/test-connection \
  -H "Cookie: bakha_session=<your session cookie>"
```

Expected response (dry-run, configured):
```json
{
  "ok": true,
  "status": "dry_run_success",
  "dryRun": true,
  "configured": true,
  "message": "Dry-run режим: токен и профиль настроены. Установите WAPPI_DRY_RUN=false для реального подключения."
}
```

If `configured: false`, the token or profileId is not set.

---

## 3. Staging Step 2 — Send a dry-run message

From the CRM Chats page, find or create a conversation and send a message.

Expected behavior (dry-run mode):
- Message is saved to the database with `channel=wappi`, `direction=outgoing`
- No real WhatsApp message is sent
- Logs show dry-run send

---

## 4. Staging Step 3 — Enable real sends (one test only)

Only after Step 1 and Step 2 pass cleanly:

Edit `backend/server/.env`:

```env
WAPPI_DRY_RUN=false
```

Restart the backend.

Check server log:

```
[WAPPI] REAL mode active. Profile ID: abc123... Base: https://wappi.pro
```

**Send one test message to your own phone number only:**

From the CRM Chats page, find the conversation with your own number and send a short text like "Тест CRM".

Confirm the message arrives on your phone.

Do NOT send real messages to clients during staging.

---

## 5. Staging Step 4 — Configure webhook (incoming messages)

For the CRM to receive incoming WhatsApp messages, configure the webhook URL in your WAPPI.pro dashboard.

### Webhook URL:

```
https://YOUR_DOMAIN/api/webhooks/wappi
```

For local development, expose your local server using ngrok:

```bash
ngrok http 4000
```

Then set the webhook URL in the WAPPI dashboard to:
```
https://<ngrok-id>.ngrok.io/api/webhooks/wappi
```

### Optional: Verify webhook signature

If you set `WAPPI_WEBHOOK_SECRET`, the CRM will check the `x-wappi-signature` or `x-webhook-secret` header on each incoming request. Set the same secret in the WAPPI dashboard.

---

## 6. Staging Step 5 — Test incoming message

1. From your personal phone, send a WhatsApp message to the business number connected to WAPPI
2. The CRM backend should receive the webhook
3. Check the backend logs for `[WAPPI] incoming webhook received`
4. Open the CRM Chats page — the conversation and message should appear

---

## 7. Staging Step 6 — Verify duplicate prevention

Replay the same webhook payload:

```bash
curl -s -X POST http://localhost:4000/api/webhooks/wappi \
  -H "Content-Type: application/json" \
  -d '{"id": "test-msg-123", "phone": "77012345678", "text": "Test duplicate", "timestamp": "..."}'
```

Send the same `id` twice. Confirm:
- Second POST does not create a duplicate message in the DB
- The endpoint returns OK (idempotent)

---

## 8. Safety Checklist

Before going live (production):

- [ ] `WAPPI_DRY_RUN=false` only after all staging tests pass
- [ ] Real token confirmed working via test-connection endpoint
- [ ] Webhook URL returns 200 for real WAPPI payloads
- [ ] Duplicate prevention confirmed (Step 6)
- [ ] `AI_MANAGER_AUTO_SEND=false` (remains off unless explicitly reviewed)
- [ ] `backend/server/.env` is gitignored and not committed
- [ ] Server logs do NOT print the full WAPPI token
- [ ] System status page does NOT expose credentials (confirm in browser)

---

## 9. Rollback

To safely disable WAPPI at any time:

```env
WAPPI_ENABLED=false
```

Restart backend. No messages will be sent or processed until re-enabled.

---

## 10. Known WAPPI API notes

- API base URL: `https://wappi.pro`
- Send message: `POST /api/sync/message/send` with `Authorization: Bearer {token}`
- Profile status: `GET /api/sync/profile/status?profile_id={id}` with `Authorization: Bearer {token}`
- The profile_id in API calls may differ from the numeric ID in the dashboard URL
- WAPPI webhook payload shape may vary — the CRM uses flexible normalisation

---

## Quick Reference

| Variable | Source | Note |
|---|---|---|
| `WAPPI_TOKEN` | WAPPI dashboard → API/Token | Long alphanumeric string |
| `WAPPI_PROFILE_ID` | WAPPI dashboard → Profiles → [profile] → API tab | May be UUID or short name |
| `WAPPI_WEBHOOK_SECRET` | Self-generated or WAPPI dashboard | Optional; `openssl rand -hex 32` |
| `WAPPI_ENABLED` | `true` / `false` | Start `false`, enable when ready |
| `WAPPI_DRY_RUN` | `true` / `false` | Always start `true` |
