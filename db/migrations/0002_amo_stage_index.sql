DROP INDEX IF EXISTS stages_amo_id_idx;
CREATE INDEX IF NOT EXISTS stages_amo_id_idx ON stages(amo_id) WHERE amo_id IS NOT NULL;
