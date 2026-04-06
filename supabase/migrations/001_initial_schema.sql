-- GoalWeek Phase 1 Schema
-- 6 tables + indexes + RLS policies

-- 1. Users (extends Supabase Auth)
CREATE TABLE public.users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL,
  display_name text,
  locale text DEFAULT 'en',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own profile" ON public.users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.users FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.users FOR INSERT WITH CHECK (auth.uid() = id);

-- 2. Goals
CREATE TABLE public.goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  description text,
  status text DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own goals" ON public.goals FOR ALL USING (auth.uid() = user_id);
CREATE INDEX idx_goals_user_id ON public.goals(user_id);

-- 3. Phases
CREATE TABLE public.phases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id uuid REFERENCES public.goals(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  description text,
  sort_order int NOT NULL,
  status text DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'active', 'completed')),
  estimated_weeks int,
  started_at timestamptz,
  completed_at timestamptz
);

ALTER TABLE public.phases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own phases" ON public.phases FOR ALL USING (auth.uid() = user_id);
CREATE INDEX idx_phases_goal_id ON public.phases(goal_id);
CREATE INDEX idx_phases_user_id ON public.phases(user_id);

-- 4. Weekly Plans
CREATE TABLE public.weekly_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id uuid REFERENCES public.phases(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  week_start date NOT NULL,
  ai_summary text,
  review_summary text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.weekly_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own weekly plans" ON public.weekly_plans FOR ALL USING (auth.uid() = user_id);
CREATE INDEX idx_weekly_plans_phase_id ON public.weekly_plans(phase_id);
CREATE INDEX idx_weekly_plans_user_id ON public.weekly_plans(user_id);
CREATE INDEX idx_weekly_plans_week_start ON public.weekly_plans(user_id, week_start);

-- 5. Daily Tasks
CREATE TABLE public.daily_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  weekly_plan_id uuid REFERENCES public.weekly_plans(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  day_of_week int NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  title text NOT NULL,
  description text,
  time_estimate_minutes int,
  completed boolean DEFAULT false,
  completed_at timestamptz,
  sort_order int NOT NULL,
  execution_type text DEFAULT 'user_action' CHECK (execution_type IN ('user_action', 'ai_executable', 'ai_assisted')),
  execution_status text CHECK (execution_status IN ('pending', 'running', 'completed', 'failed')),
  execution_result_url text
);

ALTER TABLE public.daily_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own daily tasks" ON public.daily_tasks FOR ALL USING (auth.uid() = user_id);
CREATE INDEX idx_daily_tasks_weekly_plan_id ON public.daily_tasks(weekly_plan_id);
CREATE INDEX idx_daily_tasks_user_id ON public.daily_tasks(user_id);

-- 6. Coaching Messages
CREATE TABLE public.coaching_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  goal_id uuid REFERENCES public.goals(id) ON DELETE CASCADE NOT NULL,
  role text DEFAULT 'coach',
  content text NOT NULL,
  trigger text NOT NULL CHECK (trigger IN ('daily_open', 'week_start', 'week_end', 'task_complete', 'manual')),
  tokens_used int,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.coaching_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own coaching messages" ON public.coaching_messages FOR ALL USING (auth.uid() = user_id);
CREATE INDEX idx_coaching_messages_user_goal ON public.coaching_messages(user_id, goal_id);

-- Auto-create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
