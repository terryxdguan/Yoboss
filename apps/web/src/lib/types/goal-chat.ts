// ask_question tool output
export interface AskQuestionData {
  question: string;
  options: { label: string; value: string }[];
  allow_multiple: boolean;
  allow_other: boolean;
}

// create_goal_plan tool output
export interface GoalPlanData {
  goal_title: string;
  goal_description: string;
  phases: {
    title: string;
    description: string;
    estimated_weeks: number;
    // Milestones are the sub-phase markers the user sees in the roadmap —
    // a bird's-eye view of what this phase delivers. Read-only on the UI;
    // all actionable check-offs happen later in the weekly schedule.
    milestones: { title: string }[];
  }[];
  // For short goals: direct weekly schedule (skips manual "Generate with AI")
  weekly_schedule?: {
    ai_summary: string;
    tasks: {
      day_of_week: number;
      title: string;
      description: string;
      time_estimate_minutes: number;
      time_slot: string;
      sort_order: number;
    }[];
  };
}

// create_weekly_plan tool output
export interface WeeklyPlanData {
  ai_summary: string;
  tasks: {
    day_of_week: number;
    title: string;
    description: string;
    time_estimate_minutes: number;
    time_slot: string;
    sort_order: number;
  }[];
}

// User's answer to an ask_question
export interface UserAnswer {
  question: string;
  selected: string[];
  other_text?: string;
}

// Live tool activity shown in the chat bubble while streaming.
// Mirrors the workflow-run-view shape so both chats share one visual pattern.
export interface ToolActivity {
  type: string;   // machine name, e.g. "ask_question"
  label: string;  // user-facing, e.g. "Asking a clarifying question"
  /** Live count of characters streamed into this tool's input JSON.
   *  Bumped on every input_json_delta so the "Drafting your plan…"
   *  card can show concrete progress instead of a static spinner
   *  during the long silent stretch when the model is emitting the
   *  create_goal_plan / create_weekly_plan tool body. */
  draftingChars?: number;
}

// A message in the goal chat
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolUse?: {
    id: string; // tool_use_id from Anthropic
    name: string;
    data: AskQuestionData | GoalPlanData | WeeklyPlanData;
  } | null;
  toolActivity?: ToolActivity[]; // all tool calls observed during this turn
  answered?: boolean; // for ask_question: has user answered?
  /** Rehydrated from a draft chat where the assistant turn never finished
   *  (Vercel maxDuration hit, tab closed mid-stream, etc). UI shows a
   *  "continue from here" warning. */
  interrupted?: boolean;
}

// Chat flow stage
export type GoalChatStage =
  | "input"    // hero + input view
  | "chatting" // conversation with AI
  | "preview"  // roadmap preview overlay
  | "saving"   // writing to DB
  | "done";    // complete, navigating away
