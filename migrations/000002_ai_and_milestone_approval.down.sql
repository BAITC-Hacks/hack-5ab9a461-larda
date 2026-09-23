ALTER TABLE milestones DROP CONSTRAINT ck_milestones_approval, DROP COLUMN approved_at, DROP COLUMN approved_by, DROP COLUMN proposed_by;
DROP TABLE ai_jobs;
ALTER TABLE tasks DROP COLUMN ai_error, DROP COLUMN ai_status, DROP COLUMN evaluated_revision, DROP COLUMN revision, DROP COLUMN draft_evaluation;
