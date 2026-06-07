# Task Automation System — Audit & Implementation Record

**Date:** June 2026  
**Branch:** post-demo-improvements

---

## 1. What Existed Before This Phase

### Task Model (`tasks` table)
- `id`, `title`, `description`, `dueAt`, `assigneeId`, `type` (plain text), `priority`, `status`, `leadId`, `completedAt`
- Task type was a free-text field — no central registry, no icons, no colors
- Hardcoded type labels in frontend: call, message, measurement, installation, commercial_offer, follow_up, other

### Existing APIs
- `POST /api/tasks` — create task (auth: manager+)
- `PATCH /api/tasks/:id` — update/complete/reopen task (auth: manager+)
- `GET /api/bootstrap` — returns all tasks along with leads/users/stages

### Frontend
- `CreateTaskModal` — used hardcoded `TASK_TYPES` constant (array of `{ value, label, emoji }`)
- `DUE_PRESETS` — preset time buttons (15m, 30m, 1h, today, tomorrow, week, month)
- `localStorage` key `bakha:lastTaskDuePreset` — remembered last preset
- `LeadDetailPage` — "Поставить задачу" button opens modal pre-filled with lead
- `LeadCard` (kanban) — showed "Нет задачи" badge and overdue marker
- `KanbanPage` — "Без задач" filter chip

### Missing Before This Phase
- No `task_types` DB table — types were unconstrained strings
- No admin UI to manage task types
- No automation rules table
- No automation engine (no automatic task creation on stage change)
- No dedupe protection for automation
- Stage changes did not trigger any task creation
- Lead creation did not trigger any task creation

---

## 2. What Was Implemented

### Database Schema (idempotent, no destructive changes)

#### `task_types` table
```sql
CREATE TABLE IF NOT EXISTS task_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'check',
  color TEXT NOT NULL DEFAULT 'gray',
  is_active INTEGER NOT NULL DEFAULT 1,
  is_system INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

7 system types seeded on startup (idempotent via `INSERT OR IGNORE`):
- `call` → Звонок / phone / blue
- `message` → Сообщение / message / blue
- `measurement` → Замер / calendar / orange
- `installation` → Монтаж / tool / purple
- `commercial_offer` → КП / document / green
- `follow_up` → Повторная связь / repeat / red
- `other` → Другое / check / gray

#### `task_automation_rules` table
```sql
CREATE TABLE IF NOT EXISTS task_automation_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 0,
  trigger_type TEXT NOT NULL DEFAULT 'lead_entered_stage',
  stage_id INTEGER,
  source TEXT,
  delay_minutes INTEGER NOT NULL DEFAULT 0,
  task_type_code TEXT NOT NULL DEFAULT 'call',
  title_template TEXT NOT NULL,
  comment_template TEXT,
  assignee_mode TEXT NOT NULL DEFAULT 'responsible',
  fixed_user_id INTEGER,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

Trigger types: `lead_created` | `lead_entered_stage` | `contact_created` (UI only, not yet implemented)

#### `task_automation_runs` table (dedupe log)
```sql
CREATE TABLE IF NOT EXISTS task_automation_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id INTEGER NOT NULL,
  lead_id INTEGER,
  stage_id INTEGER,
  dedupe_key TEXT NOT NULL UNIQUE,
  created_task_id INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

Dedupe key format:
- Stage trigger: `automation:{ruleId}:lead:{leadId}:stage:{stageId}`
- Lead created: `automation:{ruleId}:lead:{leadId}:trigger:lead_created`

### Backend APIs

| Endpoint | Auth | Description |
|----------|------|-------------|
| `GET /api/task-types` | Any authenticated | Active task types for CreateTaskModal |
| `GET /api/task-types/all` | Owner/Admin | All task types including inactive |
| `POST /api/task-types` | Owner/Admin | Create custom task type |
| `PATCH /api/task-types/:id` | Owner/Admin | Update label/icon/color/isActive |
| `GET /api/task-automation-rules` | Owner/Admin | List all automation rules with stage names |
| `POST /api/task-automation-rules` | Owner/Admin | Create rule (inactive by default) |
| `PATCH /api/task-automation-rules/:id` | Owner/Admin | Update rule fields including isActive |

### Automation Engine (`runAutomationRules()`)

Called at two points:
1. `PATCH /api/leads/:id/stage` — after stage change, triggers `lead_entered_stage` rules
2. `POST /api/leads` — after lead creation, triggers `lead_created` rules

Response includes `automationTasks: [{ id, title, type }]` so the frontend can show toasts.

Behavior:
1. Find active rules matching trigger type + stage
2. Check dedupe table — skip if already ran
3. Create task with `dueAt = now + delayMinutes`
4. Record run in `task_automation_runs`
5. Create notification for assignee via existing `createNotification()`

### Default Seeded Rules (inactive)
6 Bakha Potolok-specific rules seeded on startup via `INSERT OR IGNORE`:
- Новый лид — позвонить (lead_created, +15 min, call)
- НДЗ — перезвонить (stage: НДЗ, +1 hour, call)
- Согласование — followup (stage: Согласование, +1 day, follow_up)
- Назначил замер — подтвердить (stage: Назначил замер, +1 day, measurement)
- Замер проведён — отправить расчёт (stage: Замер проведён, immediately, commercial_offer)
- Предоплата — подготовить резерв (stage: Предоплата, immediately, other)

### Frontend Changes

#### `CreateTaskModal`
- Now loads task types from `GET /api/task-types` on open
- Falls back to hardcoded `TASK_TYPES` if API fails
- Includes emoji mapping from icon codes: `phone→📞, message→💬, calendar→📐, tool→🔨, document→📄, repeat→🔄, check→📌, flag→🚩, fire→🔥`

#### Settings Navigation (admin-only)
- New sidebar items: "Типы задач" (Tag icon) and "Автоматизация" (Zap icon)
- Routes: `/settings/task-types` and `/settings/automation`

#### `TaskTypesSettingsPage`
- Table view of all task types
- Shows icon emoji, label, code, color, system/custom badge, active status
- Admin can activate/deactivate any type
- Admin can create custom type with name, code, icon, color

#### `AutomationSettingsPage`
- List view of all automation rules with status indicator
- Shows trigger type, stage name, delay, task title template
- Admin can toggle active/inactive
- Admin can create new rule with full form: trigger, stage, delay, task type, title template, assignee mode

#### Stage Change Toasts
- `KanbanPage.changeLeadStage()` — if automation creates tasks, shows toasts per task: `Создана задача: «{title}»`
- `LeadDetailPage.changeStage()` — same behavior
- "Этап сделки сохранён." always shown regardless of automation

---

## 3. Where Automations Hook In

```
POST /api/leads
  └─ runAutomationRules("lead_created", leadId, null, responsibleId)
       └─ active rules with trigger_type = 'lead_created'
       └─ dedupe: automation:{ruleId}:lead:{leadId}:trigger:lead_created

PATCH /api/leads/:id/stage
  └─ runAutomationRules("lead_entered_stage", leadId, newStageId, responsibleId)
       └─ active rules with trigger_type = 'lead_entered_stage' AND stage_id = newStageId
       └─ dedupe: automation:{ruleId}:lead:{leadId}:stage:{stageId}
```

---

## 4. Known Limitations

| Limitation | Status |
|-----------|--------|
| `contact_created` trigger not yet implemented | Documented, backend table ready |
| Source filter for rules (WAPPI/Instagram/etc.) | Schema has `source` column, UI not implemented |
| Rule editing (only toggle active, not full edit) | MVP — create new rule instead |
| Re-trigger when deal re-enters stage | Currently blocked by dedupe — document for client |
| Task type custom icon upload | Not implemented — predefined list only |
| Automation rule test/preview | Future improvement |
| Delay implementation is at-creation time (not scheduled) | MVP — task created immediately with future dueAt |

---

## 5. Safe MVP Plan (Completed)

- [x] DB schema for task_types (idempotent)
- [x] DB schema for task_automation_rules (idempotent)  
- [x] DB schema for task_automation_runs (dedupe, idempotent)
- [x] Seed 7 system task types
- [x] Seed 6 Bakha Potolok rules (inactive)
- [x] REST APIs for task types (admin CRUD)
- [x] REST APIs for automation rules (admin CRUD)
- [x] Stage change trigger → automation engine
- [x] Lead creation trigger → automation engine
- [x] Frontend task type loading from API
- [x] Admin task types settings UI
- [x] Admin automation rules settings UI
- [x] Stage change automation toast in frontend
- [x] Dedupe prevention via unique key
- [x] Notification creation for automated tasks
- [x] Smoke tests (70+ passing)
