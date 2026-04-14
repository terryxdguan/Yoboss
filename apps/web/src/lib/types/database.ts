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
  metadata?: {
    generatedFiles?: { fileId: string; filename: string }[];
    toolActivity?: { type: string; label: string }[];
  } | null;
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
  goal_id: string | null;
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

export interface UserQuota {
  user_id: string;
  tier: string;
  daily_request_limit: number;
  daily_cost_limit_cents: number;
  monthly_cost_limit_cents: number;
  requests_today: number;
  cost_today_cents: number;
  cost_this_month_cents: number;
  last_reset_date: string;
  last_month_reset: string;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  subscription_status?: string | null;
  subscription_current_period_end?: string | null;
  cancel_at_period_end?: boolean | null;
  monthly_allowance_cents?: number | null;
  credits_balance_cents?: number | null;
}

export interface AiUsageRecord {
  id: string;
  route: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_cents: number;
  created_at: string;
}

// Composite types
export interface GoalWithPhases extends Goal {
  phases: Phase[];
}

export interface WeeklyPlanWithTasks extends WeeklyPlan {
  daily_tasks: DailyTask[];
}

// Dashboard types
export interface DashboardStats {
  activeGoals: number;
  totalGoals: number;
  goalProgressPercent: number;
  pendingGoalTodos: number;
  pendingPersonalTodos: number;
  totalWorkflows: number;
  todayRunCount: number;
  todayRuns: DashboardWorkflowRun[];
  totalTeamMembers: number;
}

export interface DashboardWorkflowRun {
  id: string;
  workflowId: string;
  workflowName: string;
  status: "running" | "success" | "failed";
  triggeredBy: "manual" | "scheduled";
  startedAt: string;
  completedAt: string | null;
}

export interface DashboardTodayItem {
  id: string;
  title: string;
  description: string | null;
  completed: boolean;
  timeSlot: "morning" | "afternoon" | "evening";
  source: "goal" | "personal";
  sourceLabel: string;
  sourceType: "daily_task" | "todo";
  deadline: string | null;
  priority: "high" | "medium" | "low";
  tag: string;
}

export interface WorkflowSummary {
  id: string;
  name: string;
  description: string | null;
  lastRunStatus: "success" | "failed" | null;
  lastRunAt: string | null;
}
