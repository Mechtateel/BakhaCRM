# Bakha CRM — Client Launch Checklist

**Target client:** Bakha Potolok (stretch ceiling company)  
**Migration from:** AmoCRM  
**Date:** June 2026

---

## Internal CRM Features (Ready Without External Credentials)

### ✅ Core Business Workflow
- [x] Login / RBAC (owner, admin, manager, measurer, installer)
- [x] Sales pipeline (kanban drag-and-drop)
- [x] Lead/deal creation, editing, stage movement
- [x] Deal detail page (three-column independent scroll layout)
- [x] Lead timeline/feed (notes, messages, calls, stage changes, tasks, AI events)
- [x] Tasks system: create, complete, reopen, postpone
- [x] Task types (system: call, message, measurement, installation, КП, повторная связь, другое)
- [x] Custom task types (admin-only creation via Settings → Типы задач)
- [x] Due date presets (+15min, +30min, +1h, today, tomorrow, week, month)
- [x] Remembered last preset (localStorage)
- [x] "Нет задачи" / "Просрочена" indicators on kanban cards
- [x] "Без задач" filter in Sales kanban
- [x] Stage-change no-task suggestion banner in deal detail
- [x] "Поставить задачу" button in deal detail (pre-filled with deal + responsible user)
- [x] Notification center (bell, unread count, mark read, mark all read)
- [x] Task assignment notifications (to self and others)
- [x] Due-time reminder notifications (every 60s check)
- [x] Global search (leads, contacts, tasks)
- [x] Measurements module (Замер pipeline)
- [x] Reserve module (material reservation)
- [x] Installations module (Монтаж pipeline)
- [x] Analytics page
- [x] User management (Settings → Пользователи)
- [x] System status page

### ✅ Task Automation (MVP)
- [x] `task_automation_rules` table and engine
- [x] Stage-change trigger: when deal enters stage → auto-create task
- [x] Lead-creation trigger: when new deal created → auto-create task
- [x] Automation rules settings UI (Settings → Автоматизация)
- [x] 6 default Bakha Potolok rules seeded (inactive by default)
- [x] Dedupe: same rule cannot fire twice for same lead+stage
- [x] Automation task toast in kanban + deal detail
- [x] Notification to assignee for automation-created tasks

### ✅ Tests
- 70+ smoke tests passing
- TypeScript typecheck passing
- Vite build passing

---

## Pre-Activation Steps (Before Going Live)

### Step 1 — Admin Account Setup
- [ ] Change default owner password
- [ ] Create accounts for each manager (Aliya and others)
- [ ] Set correct roles: owner for Baкha, admin or manager for staff
- [ ] Verify each user can log in

### Step 2 — Pipeline Configuration
- [ ] Verify stage names match Bakha Potolok actual pipeline
- [ ] Adjust stage names if needed (currently seeded from AmoCRM export)
- [ ] Test drag-and-drop stage movement for a test deal

### Step 3 — Task Automation Rules
- [ ] Go to Settings → Автоматизация
- [ ] Review 6 pre-seeded rules
- [ ] Adjust delay times to match actual Bakha workflow
- [ ] Activate rules one by one (toggle "Вкл")
- [ ] Test by moving a deal through stages and verifying tasks are auto-created

### Step 4 — Custom Task Types (Optional)
- [ ] Go to Settings → Типы задач
- [ ] Review 7 system types
- [ ] Add any custom types needed (e.g., "Доставка материала")

### Step 5 — Data Import
- [ ] Import AmoCRM deals/contacts (requires AmoCRM API token + import tool)
- [ ] Verify imported deals have correct stages and responsible users
- [ ] Verify imported contacts have phone numbers (needed for WAPPI matching)

---

## External Integrations (Require Real Credentials)

### WAPPI (WhatsApp)
- [ ] Obtain WAPPI account: https://wappi.pro
- [ ] Add to `backend/server/.env`:
  ```
  WAPPI_ENABLED=true
  WAPPI_DRY_RUN=true  # Set to false for real sends
  WAPPI_PROFILE_ID=<from WAPPI dashboard>
  WAPPI_TOKEN=<from WAPPI settings>
  WAPPI_WEBHOOK_SECRET=<random string>
  ```
- [ ] Test connection: POST /api/wappi/test-connection
- [ ] Configure webhook URL in WAPPI dashboard: `https://your-domain.kz/api/webhooks/wappi`
- [ ] Set `WAPPI_DRY_RUN=false` to enable real WhatsApp sends
- [ ] Test incoming message flow
- [ ] See: `docs/WAPPI_REAL_STAGING_CHECKLIST.md`

### onlinePBX (Phone calls)
- [ ] Obtain onlinePBX credentials
- [ ] Add to backend `.env`:
  ```
  ONLINEPBX_ENABLED=true
  ONLINEPBX_DOMAIN=<your-pbx-domain>
  ONLINEPBX_API_KEY=<key>
  ONLINEPBX_WEBHOOK_SECRET=<secret>
  ```
- [ ] Map CRM users to PBX extensions in Settings → Integrations → Телефония

### AI Manager (External)
- [ ] AI Manager server running on separate server
- [ ] Add to backend `.env`:
  ```
  AI_MANAGER_ENABLED=true
  AI_MANAGER_DRY_RUN=true  # Set to false for production
  AI_MANAGER_URL=http://your-ai-server:port
  AI_MANAGER_TOKEN=<token>
  AI_MANAGER_AUTO_SEND=false  # Keep false until tested
  ```
- [ ] Test AI connection: POST /api/ai/test
- [ ] Test suggestion flow (incoming WAPPI → AI → CRM suggestion → manager approval)
- [ ] Enable `AI_MANAGER_AUTO_SEND=true` only after thorough testing

---

## Production Deployment

### Server Requirements
- Node.js 20+
- 1GB+ RAM (SQLite is lightweight)
- SSL certificate (for WAPPI webhooks HTTPS is required)
- Port 3001 (backend) + 5173 or static serve (frontend)

### Build and Start
```bash
# Build frontend
cd frontend/apps/web
npm run build

# Start backend
cd backend/server
npm start

# Or with PM2
pm2 start npm --name "bakha-crm-api" -- start
```

### Environment Variables Required
```env
# Required
NODE_ENV=production
DATABASE_URL=./bakha.db  # or absolute path
SESSION_SECRET=<random 64-char string>
PORT=3001

# Optional external integrations
WAPPI_ENABLED=false
WAPPI_DRY_RUN=true
ONLINEPBX_ENABLED=false
AI_MANAGER_ENABLED=false
```

### Backup Strategy
- SQLite file: `bakha.db` — back up daily
- Use `sqlite3 bakha.db ".backup 'backup-YYYY-MM-DD.db'"` for safe hot backup

---

## Known Limitations Before Launch

| Feature | Status | Notes |
|---------|--------|-------|
| WAPPI real WhatsApp | Requires credentials | Safe dry-run available |
| onlinePBX real calls | Requires credentials | Safe dry-run available |
| AI Manager real AI | Requires credentials | Safe dry-run available |
| AmoCRM data import | Manual step | Import tool available |
| Mobile responsive | Desktop-first | Works on tablet, limited mobile |
| Multi-pipeline automation | MVP | Only sales pipeline stages seeded |
| Automation re-trigger | Blocked by dedupe | Document to client |
| Contact-created automation | Schema ready | UI/hook not implemented |
| Email notifications | Not implemented | Future phase |
| File attachments | Schema ready | Upload UI not implemented |
| Custom fields in deal creation | Schema ready | UI limited |
