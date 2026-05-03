export interface WorkflowStep {
  id: string;
  order: number;
  agentId: string;
  prompt: string;
}

export interface Workflow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  steps: WorkflowStep[];
  is_template: boolean;
  topic: string | null;
  status: "draft" | "ready" | "running";
  last_run_at: string | null;
  last_run_status: "success" | "failed" | null;
  created_at: string;
  updated_at: string;
  schedule_enabled: boolean;
  schedule_cron: string | null;
  schedule_timezone: string | null;
  schedule_next_run_at: string | null;
}

export interface GeneratedFile {
  /** Anthropic file id for live runs. Cached template runs don't have
   *  this — they store files in Supabase Storage and use `href` instead. */
  fileId: string;
  filename: string;
  /** Direct Storage URL — only set on cached template runs (attached
   *  server-side by /api/workflows/check-cache). When present, callers
   *  must download via this href instead of /api/ai/files/<fileId>. */
  href?: string;
}

export interface WorkflowStepResult {
  stepId: string;
  status: "pending" | "running" | "success" | "failed";
  output?: string;
  error?: string;
  durationMs?: number;
  files?: GeneratedFile[];
  toolActivity?: { type: string; label: string }[];
}

export interface FollowUpMessage {
  type: "user" | "assistant";
  content: string;
  toolActivity?: { type: string; label: string }[];
  generatedFiles?: GeneratedFile[];
  /** Set when the assistant turn's stream was cut off mid-flight
   *  (Vercel maxDuration, network, tab close). UI renders a warning
   *  so the user knows a follow-up will continue from partial state. */
  interrupted?: boolean;
}

export interface WorkflowRun {
  id: string;
  workflow_id: string;
  user_id: string;
  status: "running" | "success" | "failed" | "cancelled";
  current_step: number;
  total_steps: number;
  step_results: WorkflowStepResult[];
  follow_up_messages?: FollowUpMessage[] | null;
  session_id?: string | null;
  triggered_by: "manual" | "scheduled";
  started_at: string;
  completed_at: string | null;
}
