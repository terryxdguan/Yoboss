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

/**
 * Categorization of why a step failed. Stored on the step alongside the
 * raw `error` string so retry logic + UI can decide whether replaying
 * the step makes sense.
 *
 * - "transient": network blip, 429, 5xx, mid-stream disconnect — retry
 *   probably succeeds. Cron sweeper auto-recovers these.
 * - "quota":     402 QUOTA_EXCEEDED — retrying without topping up will
 *   hit the same wall, so UI shows "Buy Credits" instead of "Retry".
 * - "auth":      401 — session expired, user needs to re-login.
 * - "permanent": 400 / Anthropic content policy / unrecoverable input
 *   error. Retry will fail the same way.
 * - "unknown":   uncategorized fallback. Treated as retryable for
 *   safety (worst case it just re-fails).
 *
 * Older step results without this field are treated as "unknown".
 */
export type StepFailureKind =
  | "transient"
  | "quota"
  | "auth"
  | "permanent"
  | "unknown";

export interface WorkflowStepResult {
  stepId: string;
  status: "pending" | "running" | "success" | "failed";
  output?: string;
  error?: string;
  failureKind?: StepFailureKind;
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
