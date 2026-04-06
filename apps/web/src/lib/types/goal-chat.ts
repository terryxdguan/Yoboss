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
    todos: { title: string; priority: "high" | "medium" | "low" }[];
  }[];
}

// User's answer to an ask_question
export interface UserAnswer {
  question: string;
  selected: string[];
  other_text?: string;
}

// A message in the goal chat
export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolUse?: {
    id: string; // tool_use_id from Anthropic
    name: string;
    data: AskQuestionData | GoalPlanData;
  } | null;
  answered?: boolean; // for ask_question: has user answered?
}

// Chat flow stage
export type GoalChatStage =
  | "input"    // hero + input view
  | "chatting" // conversation with AI
  | "preview"  // roadmap preview overlay
  | "saving"   // writing to DB
  | "done";    // complete, navigating away
