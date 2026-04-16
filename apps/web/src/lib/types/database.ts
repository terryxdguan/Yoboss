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

/** Session-level metadata. Used by goal/weekly plan draft chats so that an
 *  interrupted or backgrounded draft can be resumed, and so Confirm can be
 *  an idempotent "write real rows + stamp confirmedAt" operation. */
export interface ChatSessionMetadata {
  intent?: "goal-creation" | "weekly-plan-creation";
  /** ISO timestamp. Set only after confirmPlan successfully wrote real
   *  goals/phases/weekly_plans rows. Drafts with confirmedAt are hidden
   *  from the Continue draft list. */
  confirmedAt?: string;
  resultGoalId?: string;
  resultWeeklyPlanId?: string;
  /** Weekly plan drafts need the parent phase/week context to resume — the
   *  original startChat call took these as arguments, so we snapshot them
   *  onto the session on create. */
  weeklyContext?: {
    phaseId: string;
    weekStart: string;
    goalTitle: string;
    goalDescription: string;
    phaseTitle: string;
    phaseDescription: string;
    weekNumber: number;
    estimatedWeeks: number;
    isMidWeekStart: boolean;
    startDayOfWeek?: number;
  };
}

export interface ChatSession {
  id: string;
  user_id: string;
  agent_id: string | null;
  goal_id: string | null;
  title: string;
  summary: string | null;
  metadata: ChatSessionMetadata | null;
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
    /** Set while an assistant turn is still streaming and has not
     *  received its final upsert. Rehydrated messages with this flag
     *  get the interrupted UI treatment because we can't distinguish
     *  "in-progress" from "crashed" after the fact. */
    partial?: boolean;
    /** Explicitly set on the error path of sendToApi (Vercel
     *  maxDuration hit, fetch threw, user closed tab mid-stream, etc).
     *  Signals the UI to render a "continue from here" warning. */
    interrupted?: boolean;
    /** Goal / weekly draft chats: the Anthropic `tool_use` block the
     *  assistant emitted in this turn. Persisted so that a resumed draft
     *  can rehydrate the plan preview and rebuild Anthropic history for
     *  the next API call without re-running the model. */
    toolUse?: {
      id: string;
      name: string;
      data: unknown;
    };
    /** Goal / weekly draft chats, user messages only: the tool_use id that
     *  this user message is a tool_result for. When rebuilding Anthropic
     *  history on draft resume we emit a tool_result block keyed by this. */
    toolResultFor?: string;
    /** Assistant message with a pending ask_question has been answered —
     *  UI stops showing the selection buttons after the user responds. */
    answered?: boolean;
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
  status: "running" | "success" | "failed" | "cancelled";
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
