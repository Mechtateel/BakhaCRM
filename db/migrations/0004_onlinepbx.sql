-- Migration 0004: onlinePBX telephony integration
-- Extends the calls table with onlinePBX tracking fields and
-- creates the pbx_user_mappings table for manager extension mapping.
--
-- SQLite does not support ALTER TABLE ADD COLUMN IF NOT EXISTS.
-- The server applies these statements idempotently via ensureTelephonySchema()
-- on startup (catching "duplicate column" errors silently).
--
-- To run manually: npx tsx db/migrate.ts

ALTER TABLE calls ADD COLUMN external_call_id TEXT;
ALTER TABLE calls ADD COLUMN manager_extension TEXT;
ALTER TABLE calls ADD COLUMN client_phone TEXT;
ALTER TABLE calls ADD COLUMN provider TEXT NOT NULL DEFAULT 'onlinepbx';
ALTER TABLE calls ADD COLUMN raw_payload_json TEXT;
ALTER TABLE calls ADD COLUMN error_message TEXT;
ALTER TABLE calls ADD COLUMN started_at TEXT;
ALTER TABLE calls ADD COLUMN answered_at TEXT;
ALTER TABLE calls ADD COLUMN ended_at TEXT;

CREATE TABLE IF NOT EXISTS pbx_user_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  crm_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  onlinepbx_extension TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
