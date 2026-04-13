-- Add goal_id to todos for per-goal todo lists
ALTER TABLE todos ADD COLUMN IF NOT EXISTS goal_id uuid REFERENCES goals(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_todos_goal_id ON todos(goal_id);
