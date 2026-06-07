ALTER TABLE users ADD COLUMN amo_id INTEGER;
ALTER TABLE users ADD COLUMN raw_json TEXT;

ALTER TABLE pipelines ADD COLUMN amo_id INTEGER;
ALTER TABLE pipelines ADD COLUMN raw_json TEXT;

ALTER TABLE stages ADD COLUMN amo_id INTEGER;
ALTER TABLE stages ADD COLUMN raw_json TEXT;

ALTER TABLE contacts ADD COLUMN amo_id INTEGER;
ALTER TABLE contacts ADD COLUMN raw_json TEXT;

ALTER TABLE leads ADD COLUMN amo_id INTEGER;
ALTER TABLE leads ADD COLUMN closest_task_at TEXT;
ALTER TABLE leads ADD COLUMN measurer_name TEXT;
ALTER TABLE leads ADD COLUMN installer_name TEXT;
ALTER TABLE leads ADD COLUMN raw_json TEXT;

ALTER TABLE custom_fields ADD COLUMN amo_id INTEGER;
ALTER TABLE custom_fields ADD COLUMN raw_json TEXT;

ALTER TABLE tasks ADD COLUMN amo_id INTEGER;
ALTER TABLE tasks ADD COLUMN raw_json TEXT;

ALTER TABLE notes ADD COLUMN amo_id INTEGER;
ALTER TABLE notes ADD COLUMN raw_json TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS users_amo_id_idx ON users(amo_id) WHERE amo_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS pipelines_amo_id_idx ON pipelines(amo_id) WHERE amo_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS stages_amo_id_idx ON stages(amo_id) WHERE amo_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS contacts_amo_id_idx ON contacts(amo_id) WHERE amo_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS leads_amo_id_idx ON leads(amo_id) WHERE amo_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS custom_fields_amo_entity_idx ON custom_fields(amo_id, entity_type) WHERE amo_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS tasks_amo_id_idx ON tasks(amo_id) WHERE amo_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS notes_amo_id_idx ON notes(amo_id) WHERE amo_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS lead_custom_values_lead_field_idx ON lead_custom_values(lead_id, custom_field_id);
