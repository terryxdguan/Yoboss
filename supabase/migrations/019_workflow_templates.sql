-- Migration 019: canonical workflow templates + cached demo runs
--
-- Gives every new signup a set of starter workflows with pre-recorded
-- successful output (including deliverable files stored in Supabase
-- Storage). See docs/plans/2026-04-14-default-workflows-design.md for
-- context.

-- Canonical template definitions. Only service_role writes; any
-- authenticated user can read.
CREATE TABLE public.workflow_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL UNIQUE,   -- UNIQUE so bootstrap script can UPSERT by name
  description     text,
  topic           text,                   -- default topic; used for cache-match comparison
  steps           jsonb NOT NULL DEFAULT '[]',
  sort_order      int NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.workflow_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read templates"
  ON public.workflow_templates FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Service role manages templates"
  ON public.workflow_templates FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- Cached run data, one row per template. step_results references Supabase
-- Storage paths, not Anthropic file IDs.
CREATE TABLE public.workflow_template_cached_runs (
  template_id        uuid PRIMARY KEY REFERENCES public.workflow_templates(id) ON DELETE CASCADE,
  step_results       jsonb NOT NULL,
  follow_up_messages jsonb,
  total_steps        int NOT NULL,
  duration_ms        int,
  recorded_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.workflow_template_cached_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read cached runs"
  ON public.workflow_template_cached_runs FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Service role manages cached runs"
  ON public.workflow_template_cached_runs FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- Link each user's workflow copy back to its source template. SET NULL so
-- retiring a template never destroys user data across the fleet.
ALTER TABLE public.workflows
  ADD COLUMN IF NOT EXISTS template_id uuid
  REFERENCES public.workflow_templates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_workflows_template_id
  ON public.workflows(template_id);
