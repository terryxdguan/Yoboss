-- Goal Notes: one note per goal per user (markdown/text content)
CREATE TABLE public.goal_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id uuid REFERENCES public.goals(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  content text DEFAULT '' NOT NULL,
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX idx_goal_notes_goal_user ON public.goal_notes(goal_id, user_id);
ALTER TABLE public.goal_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own notes" ON public.goal_notes
  FOR ALL USING (auth.uid() = user_id);

-- Goal Deliverables: files/links produced during goal work
CREATE TABLE public.goal_deliverables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id uuid REFERENCES public.goals(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  url text,
  file_type text,
  source text DEFAULT 'manual',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.goal_deliverables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own deliverables" ON public.goal_deliverables
  FOR ALL USING (auth.uid() = user_id);
CREATE INDEX idx_goal_deliverables_goal ON public.goal_deliverables(goal_id);
