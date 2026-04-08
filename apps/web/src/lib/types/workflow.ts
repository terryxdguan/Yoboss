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
  status: "draft" | "ready" | "running";
  last_run_at: string | null;
  last_run_status: "success" | "failed" | null;
  created_at: string;
  updated_at: string;
}

export interface GeneratedFile {
  fileId: string;
  filename: string;
}

export interface WorkflowStepResult {
  stepId: string;
  status: "pending" | "running" | "success" | "failed";
  output?: string;
  error?: string;
  durationMs?: number;
  files?: GeneratedFile[];
}

export interface WorkflowRun {
  id: string;
  workflow_id: string;
  user_id: string;
  status: "running" | "success" | "failed";
  current_step: number;
  total_steps: number;
  step_results: WorkflowStepResult[];
  started_at: string;
  completed_at: string | null;
}
