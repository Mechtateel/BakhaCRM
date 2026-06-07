# Task Assignment & Due-Reminder Notification — Manual Test Guide

**Branch:** `post-demo-improvements`
**Updated:** 2026-06-07

---

## Background

The CRM sends internal notifications for two task events:

| Event | Type | Who receives |
|---|---|---|
| Task created or reassigned | `task.assigned` | The task assignee (including self) |
| Task past its due time | `task.due` | The task assignee |

Notifications appear in the **bell icon** in the top header. The bell shows an unread badge count. Clicking a notification marks it read and navigates to the linked deal or task.

Notifications are **deduplicated** via a unique `dedupe_key` so refreshing or retrying never creates duplicates.

---

## Test A — Self-Assignment Notification

**Scenario:** A manager creates a task assigned to themselves.

### Steps

1. Login: `aliya@bakha.kz` / `demo123`
2. Navigate to **Задачи** → click **Поставить задачу**
3. Fill in:
   - Название: `Позвонить клиенту Асель`
   - Тип: Звонок
   - Дата и время: today + 30 minutes
   - Ответственный: **Алия Менеджер** (herself)
4. Click **Создать задачу**

### Expected result

- Task appears in the Tasks board under the correct column
- **Bell icon shows unread badge** (count increases by 1)
- Open the bell → see notification:
  - Title: **"Вы поставили себе задачу"**
  - Body: `Позвонить клиенту Асель — {date}`
  - Link navigates to `/tasks`
- Clicking the notification marks it read (badge decreases)

### Verify no duplicate

- Refresh the page
- Re-open the bell
- Confirm **same notification appears only once**, not duplicated

---

## Test B — Cross-User Assignment Notification

**Scenario:** Admin assigns a task to Aliya.

### Steps

1. Login as admin: `admin@bakha.kz` / `demo123` (or `bakha@bakha.kz`)
2. Navigate to **Задачи** → click **Поставить задачу**
3. Fill in:
   - Название: `Подготовить КП для Нурлана`
   - Тип: КП
   - Дата и время: tomorrow at 10:00
   - Ответственный: **Алия Менеджер**
4. Click **Создать задачу**

5. **Logout** and login as `aliya@bakha.kz` / `demo123`

### Expected result

- Bell shows unread badge
- Open bell → see notification:
  - Title: **"Вам поставили задачу"**
  - Body: `Подготовить КП для Нурлана — {date}`
- Clicking navigates to tasks page

---

## Test C — Due-Time Reminder Notification

**Scenario:** A task reaches its due time and the server scheduler fires a reminder.

### Steps

1. Login as `aliya@bakha.kz` / `demo123`
2. Create a task:
   - Название: `Замер у клиента Бек`
   - Ответственный: Алия Менеджер
   - Дата и время: **1–2 minutes from now**
3. Click **Создать задачу**
4. Wait 1–2 minutes (or until due time passes)

> **Note:** The server runs `scheduleDueReminders()` on startup and every 60 seconds. If the server was running before the task was created, the next cycle (within 60 s) will trigger the reminder.

5. Refresh the page or wait for the next 30-second notification poll

### Expected result

- Bell shows **new unread notification** (in addition to the self-assignment one)
- Open bell → see due reminder:
  - Title: **"Время выполнить задачу"**
  - Body: `Замер у клиента Бек — {date time}`
  - Link navigates to `/tasks`

### Verify no duplicate

1. Refresh the page
2. Re-open the bell
3. Confirm the due reminder appears **exactly once**
4. Create a second tab — open bell — same count

---

## Test D — Completed Task Does Not Get Due Reminder

**Scenario:** Task is marked done before its due time.

### Steps

1. Create a task with due time 2 minutes from now
2. Immediately click **Выполнить** on the task card
3. Wait 2+ minutes for the due time to pass
4. Check notification bell

### Expected result

- **No "Время выполнить задачу" notification appears** for the completed task
- The scheduler skips tasks with `status = 'done'`

---

## Test E — Reassignment Notification

**Scenario:** Admin reassigns a task from themselves to Aliya.

### Steps

1. Login as admin
2. Find an open task that belongs to admin
3. Edit the task → change **Ответственный** to **Алия Менеджер** → save
4. Logout → login as Aliya

### Expected result

- Bell shows notification:
  - Title: **"Вам назначили задачу"**
  - Body: task title

---

## Dedupe Key Reference

| Event | Dedupe key pattern |
|---|---|
| Task created, assignee notified | `task.assigned:{taskId}:{assigneeId}:created` |
| Task reassigned (new assignee notified) | `task.reassigned:{taskId}:{newAssigneeId}:{YYYY-MM-DDTHH:mm}` |
| Task past due — reminder | `task.due:{taskId}:{dueAt}` |

- The unique index on `dedupe_key` ensures no duplicate rows regardless of how many times the scheduler runs.
- If `dueAt` is updated (task postponed), the new `dueAt` creates a new unique key — a fresh reminder fires at the new time.

---

## Known Limitations

1. **Due reminders only fire if the server is running.** If the server was offline when the task became due, the reminder fires at the next server restart (within 60 s).
2. **Frontend polling is every 30 s.** There may be up to 30 s delay between the reminder being created and appearing in the bell.
3. **No email or WhatsApp notifications** — these are internal CRM-only notifications.
4. **No per-user notification preferences** yet (e.g., opt-out of reminders). All assignees receive reminders.
