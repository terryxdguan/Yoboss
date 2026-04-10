export interface Notification {
  id: string;
  user_id: string;
  type: "scheduled_run_complete" | "scheduled_run_failed";
  title: string;
  metadata: {
    workflowId: string;
    runId: string;
    status: string;
  };
  read: boolean;
  created_at: string;
}
