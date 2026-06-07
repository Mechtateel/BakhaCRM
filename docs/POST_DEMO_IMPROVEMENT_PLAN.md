# Post-Demo Improvement Plan — Bakha CRM

> Branch: `post-demo-improvements`  
> Audit date: 2026-06-07  
> Auditor: AI senior full-stack engineer

---

## 1. What is fully working (as of demo freeze)

| Feature | Status | Notes |
|---------|--------|-------|
| Login (demo fallback) | ✅ Working | admin@bakha.kz / admin123 |
| Dashboard KPIs, charts | ✅ Working | Live from DB or fallback data |
| Kanban pipeline (Sales, Measurement) | ✅ Working | DnD, stage change, optimistic updates |
| Lead card quick-select stage | ✅ Working | Inline select on kanban card |
| Lead detail page (3-column AmoCRM layout) | ✅ Working | All tabs functional |
| Stage change on deal detail | ✅ Working | PATCH /api/leads/:id/stage |
| Edit lead fields | ✅ Working | PATCH /api/leads/:id |
| Create task (from deal) | ✅ Working | POST /api/tasks |
| Complete task | ✅ Working | POST /api/tasks/:id/complete |
| Snooze task | ✅ Working | PATCH /api/tasks/:id |
| Task drag/drop (Tasks page) | ✅ Working | DnD between columns |
| Task detail modal | ✅ Working | Opens on card click, no redirect |
| Add note to deal | ✅ Working | POST /api/notes |
| WAPPI chat (dry-run) | ✅ Working | Messages stored, dry-run safe |
| Click-to-call (dry-run) | ✅ Working | onlinePBX dry-run safe |
| Chats page (WAPPI imBox) | ✅ Working | Conversations listed |
| Analytics page | ✅ Working | Tables and bar chart |
| Integrations settings page | ✅ Working | Cards with status |
| Telephony settings page | ✅ Working | Webhook URL, manager mappings |
| Users settings page | ✅ Working | User list |
| Horizontal floating scrollbar | ✅ Working | Kanban + Tasks |
| Drag-to-scroll kanban | ✅ Working | Both kanban boards |
| AmoCRM import UI (stats) | ✅ Working | Live stats from CLI |
| WAPPI webhook receiver | ✅ Working | Normalizes + stores messages |
| onlinePBX webhook receiver | ✅ Working | Normalizes + stores calls |

---

## 2. Demo-only / safe-mode behaviour

| Feature | Mode | Details |
|---------|------|---------|
| WAPPI send message | Dry-run | Stored in DB, no real WhatsApp delivery |
| Click-to-call | Dry-run | Stored in DB, no real PBX call |
| Auth | Client-side | Token is base64url, no server-side guard |
| DATA_MODE | demo | Only shows leads where amoId IS NULL |
| AmoCRM import run | Stub toast | Stats work, run blocked in UI |
| Global search (header) | Toast notification | No real search API |
| Period filter (header) | Toast notification | Dashboard has local period filter |

---

## 3. Placeholders found

### Client-visible placeholder toasts (before this phase)

| Location | Message | Decision |
|----------|---------|----------|
| PageHeader "Новая сделка" button | "Форма создания сделки будет активирована…" | **IMPLEMENTED** |
| Panel action (no href) | "функция будет активирована после финальной настройки" | Softened to "в разработке" |
| Analytics toolbar buttons | "demo-состояние", "следующей версии аналитики" | Softened |
| AppShell toolbar | "demo-режиме", "после реальных данных" | Softened |
| Integration cards "Настроить" | "настройки будут активированы после финальной настройки сервера" | **FIXED** — now navigates to system status |
| TaskDetailModal result textarea | No save action | **FIXED** — saves as note on lead |
| Notifications bell | "Центр уведомлений будет активирован после подключения всех интеграций" | Kept — accurate |
| Files "Прикрепить файл" | "Загрузка файлов будет подключена позже" | Kept — accurate |
| Lead detail search bar | "Поиск по ленте событий будет подключён позже" | Kept — accurate |

### Developer-language in client-facing areas

| Issue | Fix |
|-------|-----|
| "demo-состояние" in analytics toolbar | Removed |
| "финальной настройки сервера" on integration cards | Removed |
| "backend недоступен" shown to user in task complete | Kept (informative) |

---

## 4. Implemented in this phase (post-demo-improvements branch)

### P0 — Critical for real client launch

| Feature | Implementation |
|---------|---------------|
| **POST /api/leads** — create deal | Backend endpoint with contact dedup |
| **NewDealModal** — full form | From Dashboard + Kanban headers |
| Contact deduplication | Checks phone before creating new contact |
| Lead history on create | writeLeadHistory("lead.created") |
| POST /api/tasks/:id/reopen | Backend endpoint to reopen completed tasks |
| Task result saves as note | completeTaskWithResult() in TasksPage |
| GET /api/system/status | Safe env status endpoint (no secrets exposed) |
| SystemStatusPage | /settings/system route |
| Integration status from env | IntegrationsSettingsPage now reads real status |
| Integration check connection | Calls /api/system/status per integration |

### P1 — Important for daily use

| Feature | Implementation |
|---------|---------------|
| Task "Закрыть" button in modal | Added to TaskDetailModal footer |
| TaskDetailModal result → note | On complete with result text |
| Integration cards credential info | Shows required env var names per card |
| Clean placeholder messages | Softened/removed developer language |
| Navigation: Состояние системы | Added to sidebar nav |

---

## 5. Remaining placeholders (do not implement now)

| Feature | Priority | Reason to wait |
|---------|----------|---------------|
| Global search API | P1 | Needs full-text search on leads/contacts |
| Real WAPPI activation | P0 | Needs real credentials + webhook URL |
| Real onlinePBX activation | P0 | Needs real credentials + domain |
| File upload | P1 | Needs storage backend (S3 or local) |
| User CRUD | P1 | Needs route-level auth first |
| Permission system | P1 | Needs auth middleware |
| Notifications center | P2 | Needs websockets |
| Analytics period filters | P2 | Needs date-filtered API endpoints |
| AI Manager | P2 | Needs external service |
| Salesbot | P2 | Needs external service |
| Mobile menu (sidebar) | P1 | Needs responsive sidebar implementation |
| Real chart library | P2 | ChartPlaceholder is fake bars |

---

## 6. Priority matrix

### P0 — Must work before real client launch
- [x] Create deal (NewDealModal + POST /api/leads)
- [ ] Real WAPPI credentials + activation
- [ ] Real onlinePBX credentials + activation
- [ ] Backend auth middleware (protect routes)
- [ ] Production env setup (.env on server)
- [ ] AmoCRM import with real DB path
- [ ] DATA_MODE=real after import

### P1 — Important for daily use
- [x] Task result saves as note
- [x] Integration status from real env
- [x] System status page
- [ ] User management (add/edit/deactivate)
- [ ] Global search across leads + contacts
- [ ] File upload to deal
- [ ] Mobile responsive sidebar

### P2 — Nice to have
- [ ] Real analytics charts (Recharts or Chart.js)
- [ ] Analytics period + manager filters
- [ ] AI Manager integration
- [ ] Salesbot integration
- [ ] Webhook integrations
- [ ] Notifications center

---

## 7. Files changed in this phase

**Backend:**
- `backend/server/src/index.ts` — added POST /api/leads, POST /api/tasks/:id/reopen, GET /api/system/status

**Frontend:**
- `frontend/apps/web/src/App.tsx` — NewDealModal, SystemStatusPage, PageHeader onAction, IntegrationsSettingsPage improved, task result saves, TaskDetailModal Закрыть button

**Docs:**
- `docs/POST_DEMO_IMPROVEMENT_PLAN.md` — this file
- `docs/CLIENT_LAUNCH_CHECKLIST.md` — launch checklist
