-- Migration 020: extend handle_new_user() to seed default workflows
--
-- Combines (a) the random username generation logic introduced in
-- migration 003 and (b) the new workflow seeding step. Both have to be
-- restated in the same function body because CREATE OR REPLACE FUNCTION
-- clobbers the entire definition; we cannot incrementally append a new
-- step. Future migrations that touch handle_new_user() must keep the
-- random username LOOP intact for the same reason.
--
-- Workflow seeding: every new signup also gets their own editable copies
-- of every row in workflow_templates, linked back via template_id. The
-- new workflow row's topic column is intentionally left NULL — the UI
-- uses NULL to mean "show the TopicInputModal with a placeholder hint"
-- (the hint text comes from a hardcoded TOPIC_PLACEHOLDERS map in
-- workflows/page.tsx). Cache matching reads workflow_templates.topic via
-- the template_id join, not the user's row, so the per-user topic must
-- stay NULL for the modal to render.
--
-- If workflow_templates is empty when this runs (e.g., migration applied
-- before bootstrap script), the SELECT returns zero rows and the
-- workflow seeding step is a harmless no-op. New users still get their
-- profile + streak + random username.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
  random_name text;
  name_exists boolean;
BEGIN
  -- From migration 003: generate a unique random username as a fallback
  -- when the user metadata doesn't include full_name or name.
  LOOP
    random_name := 'user_' || substr(md5(random()::text), 1, 8);
    SELECT EXISTS(SELECT 1 FROM public.users WHERE display_name = random_name) INTO name_exists;
    EXIT WHEN NOT name_exists;
  END LOOP;

  -- User profile (display_name uses the random fallback if no metadata).
  INSERT INTO public.users (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      random_name
    )
  );

  INSERT INTO public.streaks (user_id) VALUES (NEW.id);

  -- NEW in migration 020: seed default workflows from templates.
  -- topic stays NULL on the user row so UI shows the TopicInputModal.
  INSERT INTO public.workflows (user_id, name, description, steps, topic, template_id, status)
  SELECT NEW.id, t.name, t.description, t.steps, NULL, t.id, 'ready'
  FROM public.workflow_templates t
  ORDER BY t.sort_order;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
