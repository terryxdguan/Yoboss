export type GoalStatus = "active" | "completed" | "archived";
export type PhaseStatus = "upcoming" | "active" | "completed";
export type ExecutionType = "user_action" | "ai_executable" | "ai_assisted";
export type ExecutionStatus = "pending" | "running" | "completed" | "failed";
export type CoachingTrigger =
  | "daily_open"
  | "week_start"
  | "week_end"
  | "task_complete"
  | "manual";
export type CoachingRole = "coach" | "researcher" | "creator" | "challenger";

export interface User {
  id: string;
  email: string;
  display_name: string | null;
  timezone: string;
  created_at: string;
}

export interface Goal {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  status: GoalStatus;
  created_at: string;
  updated_at: string;
}

export interface Phase {
  id: string;
  goal_id: string;
  title: string;
  description: string | null;
  sort_order: number;
  status: PhaseStatus;
  estimated_weeks: number | null;
  started_at: string | null;
  completed_at: string | null;
}

export interface WeeklyPlan {
  id: string;
  phase_id: string;
  user_id: string;
  week_start: string;
  ai_summary: string | null;
  review_summary: string | null;
  created_at: string;
}

export interface DailyTask {
  id: string;
  weekly_plan_id: string;
  day_of_week: number;
  title: string;
  description: string | null;
  time_slot: string | null;
  time_estimate_minutes: number | null;
  completed: boolean;
  completed_at: string | null;
  sort_order: number;
}

export interface CoachingMessage {
  id: string;
  user_id: string;
  goal_id: string;
  role: string;
  content: string;
  trigger: CoachingTrigger;
  tokens_used: number | null;
  created_at: string;
}

export interface Streak {
  id: string;
  user_id: string;
  current_streak: number;
  longest_streak: number;
  last_completed_date: string | null;
  updated_at: string;
}

export interface PushSubscription {
  id: string;
  user_id: string;
  endpoint: string;
  keys: Record<string, string>;
  created_at: string;
}

export interface GoalNote {
  id: string;
  goal_id: string;
  user_id: string;
  content: string;
  updated_at: string;
  created_at: string;
}

export interface GoalDeliverable {
  id: string;
  goal_id: string;
  user_id: string;
  title: string;
  url: string | null;
  file_type: string | null;
  source: "manual" | "ai_generated";
  created_at: string;
}

export interface ChatSession {
  id: string;
  user_id: string;
  agent_id: string | null;
  goal_id: string | null;
  title: string;
  summary: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: string;
  content: string;
  created_at: string;
}

export interface TodoItem {
  id: string;
  user_id: string;
  text: string;
  tag: string;
  completed: boolean;
  priority: "high" | "medium" | "low";
  deadline: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface TodoTag {
  id: string;
  user_id: string;
  name: string;
  color: string | null;
  is_default: boolean;
  sort_order: number;
  created_at: string;
}

// Composite types
export interface GoalWithPhases extends Goal {
  phases: Phase[];
}

export interface WeeklyPlanWithTasks extends WeeklyPlan {
  daily_tasks: DailyTask[];
}
