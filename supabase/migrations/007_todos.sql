-- TODO items
CREATE TABLE public.todos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  text text NOT NULL,
  tag text DEFAULT 'Work',
  completed boolean DEFAULT false,
  priority text DEFAULT 'medium',
  deadline text,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX idx_todos_user ON public.todos(user_id);
ALTER TABLE public.todos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own their todos" ON public.todos FOR ALL USING (auth.uid() = user_id);

-- TODO tags (categories)
CREATE TABLE public.todo_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  color text,
  is_default boolean DEFAULT false,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_todo_tags_user ON public.todo_tags(user_id);
ALTER TABLE public.todo_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own their tags" ON public.todo_tags FOR ALL USING (auth.uid() = user_id);
