-- Add topic field to workflows (optional, for template-style workflows)
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS topic text;
