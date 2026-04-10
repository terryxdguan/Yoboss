-- Add follow-up chat messages to workflow runs
ALTER TABLE public.workflow_runs ADD COLUMN IF NOT EXISTS follow_up_messages jsonb DEFAULT NULL;
