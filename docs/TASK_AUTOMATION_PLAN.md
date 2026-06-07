# Bakha CRM — Plan задачной автоматизации

## Текущее состояние (Июнь 2026)

Задачи работают вручную:
- Менеджер открывает карточку сделки
- Нажимает «Поставить задачу»
- Выбирает тип, срок, ответственного
- Задача создаётся и отображается в воронке и на странице задач

Помощники уже реализованы:
- Подсказка «Запланируйте следующее действие» при смене этапа без активной задачи
- Пресеты срока (+15 мин, +30 мин, +1 час, Сегодня, Завтра, Конец недели, Через неделю)
- Запоминание последнего пресета в `localStorage`
- Индикатор «Нет задачи» на карточке воронки
- Фильтр «Без задач» в воронке продаж

---

## Планируемая автоматизация (не реализована)

### Концепт правила автоматизации

```
Когда сделка переходит в этап X,
создать задачу типа Y для ответственного,
через Z минут/часов/дней.
```

### Предлагаемая схема таблицы `task_automation_rules`

```sql
CREATE TABLE task_automation_rules (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  pipeline_id INTEGER NOT NULL REFERENCES pipelines(id),
  stage_id    INTEGER NOT NULL REFERENCES stages(id),   -- триггерный этап
  task_type   TEXT    NOT NULL DEFAULT 'call',          -- тип создаваемой задачи
  task_title  TEXT    NOT NULL,                         -- шаблон названия (будущее: {{contact_name}})
  delay_minutes INTEGER NOT NULL DEFAULT 0,             -- отсрочка создания
  assign_to   TEXT    NOT NULL DEFAULT 'responsible',   -- 'responsible' | 'specific_user'
  assign_user_id INTEGER,                               -- если assign_to = 'specific_user'
  is_active   INTEGER NOT NULL DEFAULT 1,
  created_by  INTEGER,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
```

### Примеры правил для Bakha Potolok

| Этап | Задача | Тип | Срок |
|------|--------|-----|------|
| Неразобранное | Позвонить клиенту | call | сразу |
| В работе / 1-й звонок | Повторная связь | follow_up | +1 день |
| НДЗ / Не дозвонились | Перезвонить | call | +1 час |
| Назначил замер | Подтвердить замер | follow_up | день до замера |
| Замер проведён | Отправить расчёт | quote | сразу |
| Согласование | Повторная связь | follow_up | +1 день |
| Предоплата / договор | Подготовить резерв | other | сразу |
| Монтаж назначен | Подтвердить монтаж | follow_up | день до монтажа |

### Архитектура реализации

1. **Backend scheduler** — расширение `scheduleDueReminders()` или отдельный `scheduleTaskAutomation()`
2. **Триггер** — при `PATCH /api/leads/:id/stage` проверить правила для нового этапа
3. **Deduplication** — `dedupeKey = task_automation:{ruleId}:{leadId}:{stageChangeAt}`
4. **API** — `GET/POST/PATCH/DELETE /api/task-automation-rules` (admin only)
5. **UI** — раздел «Автоматизация задач» в Настройках (admin/owner)

### Текущий placeholder в настройках

В Settings → Tasks добавлен задизейбленный placeholder:
> «Автоматизация задач будет доступна после настройки правил»

Активация — только после реализации схемы выше.

---

## Безопасность

- Автоматически созданные задачи помечаются `source: 'automation'`
- Менеджер может закрыть/изменить автозадачу
- Повторные правила не создают дублей
- Логика работает только для этапов текущего pipeline

---

## Следующий шаг

1. Создать `task_automation_rules` table в `db/schema/index.ts`
2. Реализовать `ensureTaskAutomationSchema()` идемпотентно
3. Добавить endpoint `POST /api/task-automation-rules`
4. Подключить триггер при смене этапа
5. Добавить UI в Settings (admin only)
