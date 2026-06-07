# Client Launch Checklist — BakhaCRM

**Project:** BakhaCRM — Stretch Ceiling Company CRM  
**Status:** Pre-launch checklist  
**Last updated:** 2026-06-07

---

## Phase 1: Core CRM (Required before any client use)

### Infrastructure
- [ ] Server provisioned with Node.js 20+ and SQLite
- [ ] HTTPS configured (required for WAPPI webhooks)
- [ ] `.env` file configured with production values
- [ ] `DATA_MODE=real` set in production
- [ ] AmoCRM import completed (`npm run db:import`) or data seeded

### Authentication
- [ ] Owner account created (`npm run db:seed`)
- [ ] Manager accounts created and passwords communicated securely
- [ ] Login page tested: correct credentials → dashboard
- [ ] Login rate limiting verified: 10 attempts / 15 min

### Core Data
- [ ] Pipelines and stages configured (sales + measurement)
- [ ] Leads imported from AmoCRM or entered manually
- [ ] Contacts linked to leads
- [ ] Custom fields verified

---

## Phase 2: WAPPI WhatsApp Integration

### Prerequisites
- [ ] WAPPI account registered at wappi.pro
- [ ] WhatsApp number connected in WAPPI account
- [ ] WAPPI Token and Profile ID obtained

### Configuration
- [ ] `.env` updated:
  ```
  WAPPI_ENABLED=true
  WAPPI_DRY_RUN=false
  WAPPI_TOKEN=<real_token>
  WAPPI_PROFILE_ID=<real_profile_id>
  WAPPI_WEBHOOK_SECRET=<random_secret>
  ```
- [ ] Server restarted after `.env` change
- [ ] Webhook URL configured in WAPPI dashboard:  
  `https://your-crm-domain.com/api/webhooks/wappi`
- [ ] Test incoming message received and linked to lead
- [ ] Test outgoing message sent from ChatsPage
- [ ] Test outgoing message sent from LeadDetailPage → Чат WAPPI tab
- [ ] WAPPI status shown as "Активна" in /settings/system

---

## Phase 3: AI Manager Bridge

### Prerequisites
- [ ] Confirm with AI Manager developer:
  - [ ] AI Manager server URL
  - [ ] API key / authentication scheme
  - [ ] Request/response format
  - [ ] Required context fields
  - [ ] Rate limits and timeout

### Dry-Run Testing
- [ ] `.env` configured:
  ```
  AI_MANAGER_ENABLED=true
  AI_MANAGER_DRY_RUN=true
  AI_MANAGER_BASE_URL=https://ai.yourdomain.com
  AI_MANAGER_API_KEY=<api_key>
  AI_MANAGER_AUTO_SEND=false
  AI_MANAGER_AUTO_ACTIONS=false
  AI_MANAGER_PAUSE_ON_MANAGER_REPLY=true
  AI_MANAGER_PAUSE_MINUTES=30
  AI_MANAGER_MIN_CONFIDENCE=0.75
  ```
- [ ] Send test WhatsApp message → AI suggestion card appears in ChatsPage
- [ ] Manager approves suggestion → outgoing message sent
- [ ] Manager rejects suggestion → suggestion dismissed
- [ ] Manager sends manual reply → AI paused for 30 minutes
- [ ] AI pause timer shown in ChatsPage
- [ ] AI resume button works
- [ ] AI events visible in deal feed (LeadDetailPage)
- [ ] System status page shows AI Manager section correctly
- [ ] No AI token visible in browser network tab / logs

### Real AI Testing
- [ ] Set `AI_MANAGER_DRY_RUN=false`
- [ ] Send test WhatsApp message
- [ ] Verify real AI Manager receives request (check AI server logs)
- [ ] Verify AI response appears as suggestion in CRM
- [ ] Manager approves → client receives reply on WhatsApp
- [ ] Check ai_events table: request + response recorded

### Auto-Send Testing (optional, requires client approval)
- [ ] Confirm with client that auto-send is acceptable
- [ ] Set `AI_MANAGER_AUTO_SEND=true`
- [ ] Set confidence threshold: `AI_MANAGER_MIN_CONFIDENCE=0.80`
- [ ] Test: high confidence reply → auto-sent
- [ ] Test: low confidence reply → saved as draft
- [ ] Test: manager reply → AI paused, no auto-send during pause window
- [ ] Revert to `AI_MANAGER_AUTO_SEND=false` if client is not ready

---

## Phase 4: Telephony (onlinePBX)

- [ ] onlinePBX account active
- [ ] `.env` configured:
  ```
  ONLINEPBX_ENABLED=true
  ONLINEPBX_DRY_RUN=false
  ONLINEPBX_DOMAIN=<subdomain>
  ONLINEPBX_API_KEY=<api_key>
  ONLINEPBX_WEBHOOK_SECRET=<random_secret>
  ```
- [ ] Manager extensions configured in /settings/integrations/telephony
- [ ] Test outgoing call from LeadDetailPage
- [ ] Incoming call creates activity in lead feed
- [ ] Call recordings linked (if configured)

---

## Security Checklist

- [ ] `.env` file not committed to git (check `.gitignore`)
- [ ] `WAPPI_TOKEN` never appears in browser network responses
- [ ] `AI_MANAGER_API_KEY` never appears in any API response or log
- [ ] `ONLINEPBX_API_KEY` never appears in API response
- [ ] Login rate limiting confirmed active
- [ ] Session cookies set to HttpOnly
- [ ] CORS configured for production domain only (`WEB_ORIGIN=https://your-domain.com`)
- [ ] Database file (`data/bakha-crm.sqlite`) backed up and not publicly accessible

---

## Performance Checklist

- [ ] AI Manager Bridge call is non-blocking (webhook returns immediately)
- [ ] AI timeout set to 15 seconds (configurable)
- [ ] Duplicate message dedup working (send same webhook twice → no duplicate)
- [ ] Database indexes confirmed for high-traffic tables

---

## Known Issues & Limitations

| Issue | Status | Mitigation |
|-------|--------|-----------|
| AI suggestions not real-time | Pending | Manager refreshes ChatsPage; future: polling/SSE |
| recentMessages empty in AI request | Pending | Load last 10 messages before AI call |
| Suggested CRM actions not executed | Pending | Stored in DB; future phase |
| Edit AI suggestion before send | Pending | Manager can copy text and send manually |
| AI controls not in LeadDetailPage | Pending | Only in ChatsPage; future phase |

---

## Support Contacts

- **CRM Developer:** Check `docs/` folder for architecture documentation
- **WAPPI Support:** support@wappi.pro
- **AI Manager Developer:** [Confirm contact]
- **onlinePBX Support:** [Confirm contact]

---

## Go-Live Sign-Off

| Item | Sign-off |
|------|---------|
| Core CRM tested by owner | ☐ |
| WAPPI send/receive tested | ☐ |
| AI dry-run verified | ☐ |
| Security review completed | ☐ |
| Database backup configured | ☐ |
| Manager training completed | ☐ |
| Client approved go-live | ☐ |
