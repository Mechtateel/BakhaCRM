# Tasks Phase 2 — Implementation Plan

**Date:** June 7, 2026  
**Branch:** post-demo-improvements

---

## Overview

This document records the implementation plan for upgrading the Tasks module to AmoCRM-like functionality.

---

## Phase 2 — Implemented Features

### ✅ STEP 1 — AUDIT
- Conducted full audit of backend schema, endpoints, frontend components
- Created `docs/TASKS_PHASE2_AUDIT.md`

### ✅ STEP 2 — RECURRING / FOLLOW-UP TASKS

**Approach:** Safe ADD COLUMN migration (never drops data).

```
repeat_enabled INTEGER NOT NULL DEFAULT 0
repeat_mode    TEXT  (daily | weekly | monthly | yearly | custom_days | none)
repeat_interval INTEGER NOT NULL DEFAULT 1
```

**Behavior on complete:**
1. Mark current task `done`
2. If `repeat_enabled = true` and `repeat_mode != none`:
   - Calculate `nextDue = computeNextDue(oldDue, mode, interval)`
   - Insert new task with same: `leadId`, `title`, `description`, `assigneeId`, `type`, `priority`
   - Set `status = "open"`, `dueAt = nextDue`
   - Copy `repeatEnabled`, `repeatMode`, `repeatInterval` → new task also repeats
   - Write audit log: `task.auto_created` with `reason: "recurrence"`
   - Send notification to `assigneeId` (if set)
3. Return `{ task: completedTask, nextTask }` in response

**Frontend:**
- Checkbox in `CreateTaskModal`: "После выполнения создать следующую задачу"
- Repeat mode select with 5 options
- Custom interval input for N days

### ✅ STEP 3 — TASK TYPES MANAGEMENT (already done in Phase 1)

Completed in Phase 1:
- `task_types` DB table + API
- `TaskTypesSettingsPage` at `/settings/task-types`
- `CreateTaskModal` loads types dynamically from API

### ✅ STEP 4 — TASKS PAGE VIEW MODES

Added top switcher: **Канбан | Список | Календарь**

- **Канбан** = existing DND kanban with date bucket columns
- **Список** = `TaskListView` — sortable table with checkboxes
- **Календарь** = `TaskCalendarMonthView` — month grid, no external library

View mode saved in `localStorage` (`bakha:tasksViewMode`).

### ✅ STEP 5 — FILTERS AND SEARCH

Filter bar always visible in TasksPage. Supports:
- Text search (id, title, description, leadId, leadTitle, client, assigneeName, type, priority, status)
- Мои задачи (filter by current user assigneeId)
- Просроченные (dueAt < now AND status != done)
- Статус (all / open / done)
- Тип задачи (all or specific type)
- Ответственный (all or specific user)
- Reset all filters button

### ✅ STEP 6 — BULK ACTIONS (List view)

- Checkbox per task row in list view
- Bulk action bar appears when ≥1 selected
- **Выполнить выбранные** — `POST /api/tasks/bulk-complete`
  - Respects recurrence (auto-creates next tasks for repeating ones)
- **Снять выбор** button

Backend also has `POST /api/tasks/bulk-assign` for future UI.

### ✅ STEP 7 — CALENDAR VIEW (Month)

`TaskCalendarMonthView` — custom implementation:
- Month grid (Пн–Вс)
- ← / Today / → navigation
- Today highlighted in orange circle
- Task mini-cards color-coded:
  - Green = done
  - Red = overdue  
  - Orange = upcoming
- Max 3 per day cell + overflow count
- Click card → `TaskDetailModal`

### ✅ STEP 8 — GOOGLE CALENDAR SYNC (SAFE MVP SHELL)

`calendar_connections` table added to DB.

Backend API shell:
- `GET /api/calendar/status` — status + configured flag
- `POST /api/calendar/google/connect-start` — OAuth URL or error
- `GET /api/calendar/google/callback` — 501 stub
- `POST /api/calendar/google/disconnect` — removes connection
- `POST /api/calendar/google/sync-now` — informational response

Frontend: `CalendarSettingsPage` at `/settings/calendar`
- Shows connection status, last sync time
- Connect/Disconnect buttons
- Config instructions
- Limitations notice

---

## Phase 3 — Remaining / Future Work

### STEP 7b — Week and Day Calendar Views

**Approach:** Add `viewType: "month" | "week" | "day"` state to `TaskCalendarMonthView`.

Week view:
- 7-column time grid (00:00–23:00)
- Tasks positioned by hour if time is set
- All-day tasks at top

Day view:
- Vertical timeline
- Exact time positioning

### STEP 8b — Full Google Calendar OAuth

Requires:
- Real `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
- Implement `/api/calendar/google/callback` with code exchange
- Token refresh logic
- Task → Google Event mapping
- Bidirectional sync (CRM → Google, optionally Google → CRM)
- Handle deletion: Bakha CRM deletion does NOT auto-delete from Google Calendar

### STEP 9 — Contact Import Auto-Task

**contact_created trigger:**
- Add `contact_created` to `task_automation_rules.trigger_type` enum
- Hook into `POST /api/contacts` or import flow
- If task can exist without lead, allow it; otherwise attach to newest active lead

**Example admin rule:**
```
name: "Новый контакт → первичный звонок"
trigger_type: contact_created
delay_minutes: 0
task_type_code: call
title_template: "Первичный звонок: {contact_name}"
assignee_mode: responsible
```

### STEP 10 — Pipeline Integration

Tasks already linkable to leads and visible in:
- Lead detail page
- Kanban card (task count badge)
- Notifications

Future enhancement: Filter tasks by pipeline stage directly in TasksPage.

### STEP 11 — Advanced Notifications

- Recurrence auto-create notification ✅ (done in Phase 2)
- Bulk reassignment notifications ✅ (done in Phase 2 backend)
- Due reminder scheduler ✅ (done in Phase 1)

---

## Safe Constraints Maintained

- ✅ No destructive DB changes (only ADD COLUMN)
- ✅ Auth/RBAC not touched
- ✅ Lead detail page not broken
- ✅ WAPPI / onlinePBX / AI manager not touched
- ✅ Existing task creation and notifications preserved
- ✅ No placeholder UI (all features functional or clearly documented as future)
- ✅ Tests added for all new features
