-- AI Manager Bridge — migration 0005
-- Adds AI event log, suggestion, and action log tables.
-- Extends chat_conversations with timed pause fields.
-- Safe: all ALTER TABLE use ADD COLUMN (idempotent via ensureAiSchema).

-- Extend chat_conversations with timed AI pause support
-- (ALTER TABLE ADD COLUMN is handled idempotently in ensureAiSchema at runtime)

-- AI event log: every AI call request/response/error/skip is recorded here.
CREATE TABLE IF NOT EXISTS ai_events (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id  INTEGER REFERENCES chat_conversations(id),
  lead_id          INTEGER REFERENCES leads(id),
  contact_id       INTEGER REFERENCES contacts(id),
  message_id       INTEGER REFERENCES messages(id),
  direction        TEXT NOT NULL DEFAULT 'request',  -- request | response | error | skipped
  status           TEXT NOT NULL DEFAULT 'pending',  -- pending | sent | completed | failed | skipped
  reason           TEXT,
  request_json     TEXT,
  response_json    TEXT,
  error_message    TEXT,
  created_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ai_events_conversation_idx ON ai_events(conversation_id);
CREATE INDEX IF NOT EXISTS ai_events_lead_idx         ON ai_events(lead_id);
CREATE INDEX IF NOT EXISTS ai_events_message_idx      ON ai_events(message_id);

-- AI suggestions: draft replies and action hints created by the AI Manager.
CREATE TABLE IF NOT EXISTS ai_suggestions (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id       INTEGER REFERENCES chat_conversations(id),
  lead_id               INTEGER REFERENCES leads(id),
  contact_id            INTEGER REFERENCES contacts(id),
  source_message_id     INTEGER REFERENCES messages(id),
  reply_text            TEXT,
  confidence            REAL,
  status                TEXT NOT NULL DEFAULT 'draft', -- draft | approved | rejected | sent | failed
  suggested_actions_json TEXT,
  reviewed_by_user_id   INTEGER REFERENCES users(id),
  created_at            TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at            TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Unique: one suggestion per source message (prevents duplicate AI replies).
CREATE UNIQUE INDEX IF NOT EXISTS ai_suggestions_source_msg_idx
  ON ai_suggestions(source_message_id)
  WHERE source_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ai_suggestions_conversation_idx ON ai_suggestions(conversation_id);
CREATE INDEX IF NOT EXISTS ai_suggestions_lead_idx         ON ai_suggestions(lead_id);
CREATE INDEX IF NOT EXISTS ai_suggestions_status_idx       ON ai_suggestions(status);

-- AI action log: records each suggested CRM action and its outcome.
CREATE TABLE IF NOT EXISTS ai_action_logs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  suggestion_id   INTEGER REFERENCES ai_suggestions(id),
  lead_id         INTEGER REFERENCES leads(id),
  conversation_id INTEGER REFERENCES chat_conversations(id),
  action_type     TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending', -- pending | applied | rejected | failed
  payload_json    TEXT,
  error_message   TEXT,
  created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS ai_action_logs_suggestion_idx ON ai_action_logs(suggestion_id);
CREATE INDEX IF NOT EXISTS ai_action_logs_lead_idx       ON ai_action_logs(lead_id);
