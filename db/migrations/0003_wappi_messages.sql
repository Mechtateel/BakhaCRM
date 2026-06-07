ALTER TABLE messages ADD COLUMN sender_type TEXT NOT NULL DEFAULT 'client';
ALTER TABLE messages ADD COLUMN text TEXT;
ALTER TABLE messages ADD COLUMN media_url TEXT;
ALTER TABLE messages ADD COLUMN media_type TEXT;
ALTER TABLE messages ADD COLUMN external_message_id TEXT;
ALTER TABLE messages ADD COLUMN status TEXT NOT NULL DEFAULT 'received';
ALTER TABLE messages ADD COLUMN raw_json TEXT;

UPDATE messages SET text = body WHERE text IS NULL;
UPDATE messages SET external_message_id = external_id WHERE external_message_id IS NULL AND external_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS messages_external_message_id_idx ON messages(external_message_id) WHERE external_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS messages_lead_created_idx ON messages(lead_id, created_at);
CREATE INDEX IF NOT EXISTS messages_contact_created_idx ON messages(contact_id, created_at);

CREATE TABLE IF NOT EXISTS chat_conversations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE,
  contact_id INTEGER REFERENCES contacts(id),
  phone TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'wappi',
  status TEXT NOT NULL DEFAULT 'open',
  unread_count INTEGER NOT NULL DEFAULT 0,
  last_message_at TEXT,
  ai_paused INTEGER NOT NULL DEFAULT 1,
  raw_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS chat_conversations_lead_idx ON chat_conversations(lead_id);
CREATE INDEX IF NOT EXISTS chat_conversations_phone_idx ON chat_conversations(phone, channel);
