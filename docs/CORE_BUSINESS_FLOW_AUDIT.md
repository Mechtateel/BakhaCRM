# Core Business Flow Audit

**Date:** 2026-06-07  
**Branch:** `post-demo-improvements`  
**Purpose:** Honest audit of each internal CRM module — what works, what is incomplete, and what priority fixes are needed.

---

## 1. Dashboard / Рабочий стол

### What Works
- KPI cards: Просроченные задачи, Выполненные задачи, Сделки без задач, Прогноз продаж
- Period filter: Сегодня / Вчера / Неделя / Месяц (local)
- Manager filter
- "Задачи на контроле" panel — shows urgent/overdue tasks with lead links
- "Прогноз продаж" bar by pipeline stage
- "Источники сделок" donut
- "Сделки по менеджерам" ranking
- "Новая сделка" button opens modal

### Incomplete / Confusing
- "Звонки: 18" is hardcoded (no real telephony data yet)
- "Средний чек" is hardcoded (no real calculation)
- "Последние события" shows only completed tasks, not all events
- Period filter does not filter the KPI cards (only cosmetic)
- Manager dropdown is wired but filters only leads, not tasks KPI

### P0 (blocking)
- None — works as a day-view for managers

### P1 (important polish)
- Real period filtering across all KPIs
- Real "Средний чек" from bootstrap leads
- Show today's measurements count on dashboard

### P2 (nice to have)
- Real call count from telephony
- Notification bell integration

---

## 2. Sales Pipeline / Отдел продаж

### What Works
- Full kanban view with drag-and-drop between stages
- Optimistic card moves with rollback on failure
- Search by name, phone, amo_id, address, source
- Filters by manager, source, stage
- Lead card shows: client, phone, budget, source, responsible, next task
- Overdue task indicator on card
- New deal modal creates lead + contact
- KPI cards: ✅ Added in Phase 5 — total, назначен замер, без задач, просроченные

### Incomplete / Confusing
- "Добавить сделку" modal does not allow setting a pipeline (always saves to sales)
- No ability to edit a lead from the kanban (must go to lead detail)
- No way to bulk-assign or bulk-move leads
- "Плотный kanban" / "Автоширина колонок" chips do nothing

### P0
- None — kanban is functional

### P1
- Inline stage change from lead detail ← already works
- Edit lead from kanban card (quick drawer)

### P2
- Bulk operations
- Collapse empty kanban columns

---

## 3. Measurements / Замер

### What Works
- Kanban view for measurement pipeline at `/measurements`
- KPI cards: Сегодня замеров (now uses real date), Провели замер, Конверсия в предоплату, Просроченные задачи
- Filters by manager, source, stage
- Lead card shows measurement date, measurer, area, sum, payment, repair stage
- Role-scoped: measurer role sees only their leads

### Incomplete / Confusing
- "Сегодня замеров" KPI now fixed to use real current date (was hardcoded `"2026-06-01"`)
- No list/calendar view — only kanban. Daily schedule needs a list view.
- No "Сегодня" quick tab
- Measurer cannot see assigned time next to each task easily

### P0
- Fixed: `todayMeasurements` now uses `new Date().toISOString().slice(0,10)`

### P1
- Add a "Список на сегодня" list view mode for measurer role
- Show measurement time prominently on kanban cards

### P2
- Calendar view for measurements
- SMS/WhatsApp reminder integration (requires WAPPI)

---

## 4. Reserve / Резерв

### What Works (NEW in Phase 5)
- `/reserve` route with dedicated `ReservePage`
- Nav link fixed from broken `/sales?reserve=1` to `/reserve`
- Shows all leads in measurement pipeline stages: Предоплата, Сделан перерасчёт, Установка, Полная оплата, Остаток долг
- Clickable stage KPI cards as filters
- Search by client/address/phone
- Filter by stage + installer
- Table view with client, address, measurement date, installer, payment status, task count
- Proper empty state: "Нет сделок в резерве"
- Nav badge showing count of reserve deals

### Incomplete / Confusing
- No ability to create "reserve items" (materials) directly — reserved as concept only
- "Монтажник" may be null for many deals (field optional)
- No material/product list — only lead-level tracking

### P0
- None — works as a filtered view of existing data

### P1
- Allow setting installer directly from the reserve table row
- Add payment status quick-update from list

### P2
- Add material/product reservation tracking (requires new DB table `reserve_items`)
- Barcode/article number support

---

## 5. Installations / Монтаж

### What Works (NEW in Phase 5)
- `/installations` route with dedicated `InstallationsPage`
- New sidebar nav item "Монтаж" with `Hammer` icon and live count badge
- Shows leads in "Установка" stage
- KPI cards: total, сегодня, монтажников, открытые задачи
- Date filter (calendar picker)
- Installer filter
- Search
- Table view with client, address, date, installer, task count
- Proper empty state: "Нет монтажей"
- Role-scoped: installer role sees only their installations

### Incomplete / Confusing
- Date filter uses `measurementAt` field (no separate installation date)
- No status update from this page — must open lead detail
- No "В работе" / "Завершён" / "Перенесён" status management

### P0
- None — works as a schedule view

### P1
- Add inline status change (Назначен / В работе / Завершён / Перенесён)
- Use a separate `installationAt` date field (currently reusing `measurementAt`)

### P2
- Installer-specific mobile-friendly view
- Photo upload for completed installations

---

## 6. Lead Detail / Карточка сделки

### What Works
- 3-column AmoCRM-style layout
- Stage selector with inline PATCH
- Left panel: deal info, contact, measurement date, address, area, payment status, installer, measurer
- Edit mode for deal fields
- Center: AmoFeed event timeline (notes, tasks, messages, history, AI suggestions)
- Bottom composer: WAPPI chat (dry-run), notes, task creation
- Right panel: next action, quick buttons (call, WhatsApp, task, note), tasks list, finances panel, files placeholder
- Back navigation to sales/measurements kanban
- AI suggestion cards with approve/reject (dry-run mode)

### Incomplete / Confusing
- WhatsApp / phone buttons show toast in dry-run (expected)
- "Файлы" section shows placeholder PDFs, not real uploads
- History feed does not show stage change events yet
- "Открыть клиента" button missing (no separate contacts page)

### P0
- None — functional for daily manager use

### P1
- Add stage change events to AmoFeed
- Allow editing contact info from lead detail
- Add "Открыть в WAPPI" deep link when WAPPI is enabled

### P2
- Real file upload
- Stage change audit log in feed
- Signature/document tracking

---

## 7. Tasks / Задачи

### What Works
- Kanban columns: Просроченные, Сегодня, Завтра, Будущие, Выполненные
- Click task → opens in-place detail modal (no navigation away)
- Complete / Reopen task
- Postpone task with date picker
- Drag-and-drop between time buckets
- Search by title, description, client, lead, assignee
- KPI row: Просроченные, Сегодня, Выполнено, Высокий приоритет
- "Назначить замер" toolbar shortcut

### Incomplete / Confusing
- Toolbar buttons (Позвонить, Написать, Назначить замер) open toasts — not real actions
- No way to reassign task from task page
- No filter by type (Звонок / Замер / КП / Монтаж)
- No way to create a task from this page (only from lead detail)

### P0
- None — task management is functional

### P1
- Add type filter (Звонок / Замер / КП / Монтаж)
- Add "Создать задачу" button that opens creation form

### P2
- Assignee re-assignment from task detail
- Bulk complete/reassign

---

## 8. Global Search

### What Works (NEW in Phase 5)
- Top nav search bar is now wired to real client-side search
- Searches across: leads (title, leadNumber, contactName, contactPhone, address, source), tasks (title, description, client)
- Results appear as dropdown below search bar
- Grouped sections: "Сделки", "Задачи"
- Clicking a lead result navigates to `/leads/:id`
- Clicking a task result navigates to `/tasks`
- Closes on Escape key or outside click
- "Ничего не найдено" empty state
- Backend endpoint `GET /api/search?q=` added for programmatic use

### Incomplete / Confusing
- No contacts search result group yet (backend has it, frontend doesn't use it)
- Search is client-side (fast, but only searches loaded data)
- No search result pagination / "show all" page

### P0
- None — search is functional

### P1
- Add contacts section to results
- Add keyboard navigation (arrow keys, Enter to navigate)

---

## 9. Analytics / Аналитика

### What Works
- KPI cards: Сделки в продажах, Сделки в замере, Всего задач, Конверсия в замер
- Chart placeholder (animated bar chart)
- Table by managers (deal count, sum, share %)
- Table by sources (deal count, sum, share %)
- Task status breakdown

### Incomplete / Confusing
- "Продажи по этапам" shows a decorative placeholder bar chart with hardcoded data
- Period / manager filter buttons show toasts — not functional
- "Оплаты" filter not functional

### P0
- None — informational only

### P1
- Wire up period and manager filters
- Replace decorative chart with real stage distribution data

### P2
- Export to CSV
- Real revenue chart by day/week

---

## 10. Chats / Чаты

### What Works
- Conversation list with unread badges
- Paginated message loading
- Last message preview in sidebar
- `needsReply` badge and filter
- "Требуют ответа" / "Непрочитанные" / "Закрытые" filters
- Message status indicators (✓ sent, ✓✓ delivered/read, ✗ failed)
- AI suggestion cards with approve/reject
- Reply from chat input (dry-run mode)
- Unread count clears on conversation open

### Incomplete / Confusing
- All in dry-run mode — no real WhatsApp messages without real WAPPI credentials
- Status updates require 8s polling cycle to appear
- No real-time push (WebSocket/SSE not in scope)

### P0
- None in dry-run — functional as a UI scaffold

### P1 (requires real WAPPI credentials)
- Confirm real WAPPI payload shapes
- Test incoming message → AI suggestion → approval flow

---

## 11. Settings & Integrations

### What Works
- WAPPI test-connection (dry-run returns success)
- AI Manager test-connection (dry-run)
- OnlinePBX settings panel
- User management (create, edit roles)
- System status page (admin only, masked secrets)

### Incomplete
- WAPPI_TOKEN / WAPPI_PROFILE_ID not configured (dry-run only)
- AI Manager credentials not configured
- OnlinePBX SIP credentials not configured

---

## Summary Table

| Module | Status | P0 Issues | External Credentials Needed |
|--------|--------|-----------|----------------------------|
| Dashboard | ✅ Working | None | No |
| Отдел продаж | ✅ Working | None | No |
| Замер | ✅ Working | Date bug fixed | No |
| Резерв | ✅ New — Working | None | No |
| Монтаж | ✅ New — Working | None | No |
| Карточка сделки | ✅ Working | None | No |
| Задачи | ✅ Working | None | No |
| Глобальный поиск | ✅ New — Working | None | No |
| Чаты (WAPPI) | 🟡 Dry-run | None (dry-run) | WAPPI for real messages |
| AI Manager | 🟡 Dry-run | None (dry-run) | AI Manager credentials |
| OnlinePBX | 🟡 Dry-run | None (dry-run) | OnlinePBX credentials |
| Аналитика | 🟡 Partial | None | No |
