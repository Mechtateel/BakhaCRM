# Tasks Phase 2 — Audit Report

**Date:** June 7, 2026  
**Branch:** post-demo-improvements  
**Author:** AI Engineering Assistant

---

## 1. What Exists (Before Phase 2)

### 1.1 Database Schema (`db/schema/index.ts`)

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | Auto-increment |
| `amo_id` | INTEGER | Migration from AmoCRM |
| `lead_id` | INTEGER FK | Cascade delete |
| `title` | TEXT NOT NULL | |
| `description` | TEXT | Nullable |
| `due_at` | TEXT NOT NULL | ISO datetime string |
| `assignee_id` | INTEGER FK → users | Nullable |
| `type` | TEXT | Default: `call` |
| `priority` | TEXT | Default: `normal` |
| `status` | TEXT | Default: `open`; only `open`/`done` used |
| `completed_at` | TEXT | Set on complete |
| `raw_json` | TEXT | AmoCRM import raw data |
| `created_at` / `updated_at` | TEXT | Timestamps |

**Missing before Phase 2:** No recurrence fields, no calendar connection table.

### 1.2 Backend Endpoints (Before Phase 2)

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| `POST` | `/api/tasks` | MANAGER_UP | Create task |
| `PATCH` | `/api/tasks/:id` | MANAGER_UP | Update task |
| `POST` | `/api/tasks/:id/complete` | MANAGER_UP | Mark done |
| `POST` | `/api/tasks/:id/reopen` | MANAGER_UP | Reopen task |
| `GET` | `/api/leads/:id/tasks` | MANAGER_UP | Tasks for a lead |

Tasks loaded globally via bootstrap (`/api/bootstrap`), not via a dedicated `GET /api/tasks` endpoint.

### 1.3 Frontend (`TasksPage`)

- **View:** Kanban only — 5 date-bucket columns (Просроченные, Сегодня, Завтра, Будущие, Выполненные)
- **Drag-and-drop:** DND Kit with `PointerSensor`
- **Search:** Basic text search across id, title, description, leadId, leadTitle, client, assigneeName, type, priority, status
- **No view modes:** No list or calendar view
- **No advanced filters:** Only text search
- **No bulk actions**
- **No recurrence support**

### 1.4 Task Types System (from Phase 1)

- `task_types` table: code, label, icon, color, isActive, isSystem
- 7 default system types seeded: call, message, measurement, installation, quote, follow_up, other
- Admin API: `GET/POST/PATCH /api/task-types`
- Settings page: `/settings/task-types` (OWNER_ADMIN only)
- `CreateTaskModal` loads types dynamically from API

### 1.5 Task Automation Rules (from Phase 1)

- `task_automation_rules` table
- `task_automation_runs` deduplication table
- Triggers: `lead_created`, `lead_entered_stage`
- 6 seeded rules for Bakha Potolok (inactive by default)
- Settings page: `/settings/automation`

### 1.6 Notifications

- Notification on task assignment (including self-assignment)
- Due-time reminder scheduler
- Deduplication using `dedupeKey`

---

## 2. What Was Missing (Phase 2 Goals)

| Feature | Status Before Phase 2 |
|---------|----------------------|
| Recurring / follow-up tasks | ❌ Missing |
| Task list view | ❌ Missing |
| Task calendar view (month) | ❌ Missing |
| Advanced filter bar | ❌ Missing (text search only) |
| Bulk task actions | ❌ Missing |
| Google Calendar sync architecture | ❌ Missing |
| Calendar settings page | ❌ Missing |
| Week / Day calendar views | ❌ Missing |

---

## 3. What Was Implemented in Phase 2

### 3.1 Recurring Tasks

**DB changes:**
- Added 3 columns to `tasks` via `ensureTaskRecurrenceSchema()` (idempotent ALTER TABLE):
  - `repeat_enabled INTEGER NOT NULL DEFAULT 0`
  - `repeat_mode TEXT` — values: `daily`, `weekly`, `monthly`, `yearly`, `custom_days`, `none`
  - `repeat_interval INTEGER NOT NULL DEFAULT 1`

**Backend:**
- `computeNextDue(oldDue, mode, interval)` — calculates next task due date
- `POST /api/tasks/:id/complete` — now checks `repeat_enabled`; if true, creates a new task with shifted due date, writes audit log, sends notification
- `POST /api/tasks` and `PATCH /api/tasks/:id` — accept repeat fields

**Frontend:**
- `CreateTaskModal` — added "После выполнения создать следующую задачу" checkbox
- When enabled: repeat mode select (Каждый день / неделю / месяц / год / Через N дней)
- Custom days input for `custom_days` mode
- Repeat config sent to backend on create

### 3.2 Task List View

- New `TaskListView` component — table layout
- Columns: Дата, Задача, Сделка/Клиент, Тип, Ответственный, Статус, Выполнить
- Checkbox per row for bulk selection
- Overdue rows highlighted in red
- Click row → opens `TaskDetailModal`

### 3.3 Task Calendar View (Month)

- New `TaskCalendarMonthView` component — no external library
- Month grid with Пн–Вс columns
- Navigation: ← Prev / Today / Next →
- Today date highlighted in orange
- Tasks shown as color-coded mini cards:
  - Green = done
  - Red = overdue
  - Orange = upcoming
- Up to 3 tasks per day cell, with "+N ещё" overflow
- Click task card → opens `TaskDetailModal`

### 3.4 View Mode Switcher

- Added to `TasksPage`: Канбан | Список | Календарь buttons
- Persisted in `localStorage` (`bakha:tasksViewMode`)
- `data-testid="view-mode-switcher"`, `view-kanban`, `view-list`, `view-calendar`

### 3.5 Filter Bar

- `data-testid="tasks-filter-bar"` — always visible below view switcher
- **Text search** — existing, now integrated into filter chain
- **Мои задачи** — filter by `currentUser.id === task.assigneeId`
- **Просроченные** — filter by `status !== done AND dueAt < now`
- **Статус** — All / В работе / Выполненные
- **Тип** — All or specific task type
- **Ответственный** — filter by specific user
- **Сбросить** — resets all filters
- Note: Filter state NOT persisted in localStorage (avoids stale filter confusion on page reload)

### 3.6 Bulk Actions

- List view: checkbox per row
- When ≥1 selected: `data-testid="bulk-action-bar"` appears
- **Выполнить выбранные** — calls `POST /api/tasks/bulk-complete`
- Bulk complete also respects recurrence (auto-creates next tasks for recurring ones)
- Backend: `POST /api/tasks/bulk-assign` also added for reassignment

### 3.7 Google Calendar Sync (Shell)

**DB:** `calendar_connections` table:
- `user_id`, `provider` (default: google), `email`, `status`, `access_token`, `refresh_token`, `expires_at`, `last_sync_at`

**Backend endpoints:**
- `GET /api/calendar/status` — returns connection status, `googleConfigured` flag, helpful message
- `POST /api/calendar/google/connect-start` — returns OAuth URL if `GOOGLE_CLIENT_ID` set; error if not
- `GET /api/calendar/google/callback` — returns 501 (not implemented)
- `POST /api/calendar/google/disconnect` — removes connection record
- `POST /api/calendar/google/sync-now` — returns informative message that full sync is not yet implemented

**Frontend:**
- `/settings/calendar` route → `CalendarSettingsPage`
- Shows: connection status, email, last sync time
- Connect button (disabled if no Google credentials in .env)
- Disconnect button
- Configuration instructions with required .env vars
- Limitations warning box

---

## 4. What Requires External Credentials

| Feature | Requirement |
|---------|-------------|
| Real Google Calendar OAuth | `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` in `.env` |
| `/api/calendar/google/callback` | Full implementation + token storage |
| Actual task sync to Google Calendar | Token refresh logic + Google Calendar API calls |
| Webhook-based bi-directional sync | Google push notifications setup |

**Important:** Deleting a task in CRM does NOT automatically delete it in Google Calendar. This must be handled explicitly in a future implementation phase.

---

## 5. Known Limitations

| Limitation | Notes |
|-----------|-------|
| Week / Day calendar views | Not implemented — planned for next phase |
| Tasks without leads | Recurrence works, but no lead linking |
| Calendar sync | MVP shell only — no real OAuth flow |
| Filter persistence | Not saved to localStorage (deliberate for now) |
| contact_created automation trigger | Not implemented — backend structure allows it via `task_automation_rules` but no UI |
| Bulk reassignment UI | Backend endpoint exists; no UI in current phase |
| Mobile calendar view | Basic grid, not optimized for mobile |
