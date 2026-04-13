-- Store Managed Agent session_id on workflow runs for context continuity
ALTER TABLE workflow_runs ADD COLUMN IF NOT EXISTS session_id text;
