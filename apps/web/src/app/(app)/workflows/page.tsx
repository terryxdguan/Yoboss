"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, Layers } from "lucide-react";
import {
  getWorkflows,
  deleteWorkflow,
  createWorkflowRun,
  updateWorkflow,
  getWorkflowRuns,
} from "@/lib/db/actions";
import { WorkflowRunView } from "@/components/workflow/workflow-run-view";
import { WorkflowHistory } from "@/components/workflow/workflow-history";
import { WorkflowCard } from "@/components/workflow/workflow-card";
import { TopicInputModal } from "@/components/workflow/topic-input-modal";
import { ScheduleModal } from "@/components/workflow/schedule-modal";
import { getUserTimezone, upsertUserTimezone } from "@/lib/db/actions";
import type { Workflow, WorkflowStep, WorkflowRun } from "@/lib/types/workflow";

const FAVORITES_KEY = "yoboss_favorite_workflows";

/** Default placeholder topics per workflow name — shown as hint text in the topic input */
const TOPIC_PLACEHOLDERS: Record<string, string> = {
  "Viral Social Post": "AI breakthroughs this week — which new model, tool, or research paper has the biggest real-world impact and why people should care",
  "Deep Research Report": "The impact of AI on the Gaming Industry in 2026",
  "Competitor Analysis": "OpenAI vs Anthropic: The race to build the most capable and safest AI — comparing models, pricing, enterprise adoption, developer experience, and long-term strategy",
};

function loadFavorites(): string[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]"); } catch { return []; }
}
function saveFavorites(ids: string[]) { localStorage.setItem(FAVORITES_KEY, JSON.stringify(ids)); }

export default function WorkflowsPage() {
  const router = useRouter();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  const [runningWorkflow, setRunningWorkflow] = useState<{ workflow: Workflow; run: WorkflowRun } | null>(null);
  const [historyWorkflow, setHistoryWorkflow] = useState<Workflow | null>(null);

  // Topic input for workflows without a pre-set topic
  const [topicWorkflow, setTopicWorkflow] = useState<Workflow | null>(null);

  const [scheduleWorkflow, setScheduleWorkflow] = useState<Workflow | null>(null);
  const [userTimezone, setUserTimezone] = useState("UTC");

  useEffect(() => { setFavoriteIds(loadFavorites()); setMounted(true); }, []);

  const loadWorkflows = useCallback(async () => {
    try { setWorkflows(await getWorkflows()); } catch (err) { console.error(err); } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadWorkflows(); }, [loadWorkflows]);

  useEffect(() => {
    getUserTimezone().then((tz) => {
      if (tz === "UTC") {
        const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        upsertUserTimezone(browserTz).then(() => setUserTimezone(browserTz));
      } else {
        setUserTimezone(tz);
      }
    });
  }, []);

  const handleDelete = useCallback(async (wf: Workflow) => {
    if (!confirm(`Delete "${wf.name}"?`)) return;
    setFavoriteIds(prev => { const next = prev.filter(id => id !== wf.id); saveFavorites(next); return next; });
    await deleteWorkflow(wf.id);
    await loadWorkflows();
  }, [loadWorkflows]);

  const handleToggleFavorite = (wf: Workflow) => {
    const next = favoriteIds.includes(wf.id) ? favoriteIds.filter(id => id !== wf.id) : [...favoriteIds, wf.id];
    setFavoriteIds(next);
    saveFavorites(next);
  };

  // Start a workflow: create run record, fire server execution, open run view
  const startWorkflow = useCallback(async (wf: Workflow, topic?: string) => {
    try {
      const initialResults = wf.steps.map((s) => ({ stepId: s.id, status: "pending" as const }));
      const run = await createWorkflowRun({
        workflowId: wf.id,
        totalSteps: wf.steps.length,
        stepResults: initialResults,
      });
      await updateWorkflow(wf.id, { status: "running" });

      // Fire server-side execution (don't await — runs in background)
      // Pass topic so server can inject it into step prompts
      fetch("/api/workflows/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflowId: wf.id, runId: run.id, ...(topic ? { topic } : {}) }),
      }).catch(console.error);

      setRunningWorkflow({ workflow: wf, run });
    } catch (err) {
      console.error("Failed to start workflow:", err);
    }
  }, []);

  // Run workflow: if topic exists, run directly; if not, ask for topic first
  const handleRun = (wf: Workflow) => {
    if (wf.topic) {
      startWorkflow(wf);
    } else {
      setTopicWorkflow(wf);
    }
  };

  // Topic entered — pass to server for injection into step prompts
  const handleTopicRun = async (topic: string) => {
    if (!topicWorkflow) return;
    const wf = topicWorkflow;
    setTopicWorkflow(null);
    startWorkflow(wf, topic);
  };

  // View progress: fetch the latest running run and open it directly
  const handleViewProgress = useCallback(async (wf: Workflow) => {
    try {
      const runs = await getWorkflowRuns(wf.id);
      const latestRunning = runs.find(r => r.status === "running") || runs[0];
      if (latestRunning) {
        setRunningWorkflow({ workflow: wf, run: latestRunning });
      } else {
        // No running run found — reset workflow status and open history instead
        await updateWorkflow(wf.id, { status: "ready" });
        loadWorkflows();
        setHistoryWorkflow(wf);
      }
    } catch (err) {
      console.error("Failed to load running workflow:", err);
      setHistoryWorkflow(wf);
    }
  }, [loadWorkflows]);

  const allWorkflows = workflows;

  if (!mounted) return <div className="flex items-center justify-center py-24"><div className="text-sm text-[#9B948B]">Loading...</div></div>;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-full px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-[#2B2B2B]">Workflows</h1>
            <p className="text-sm text-[#6F6A64] mt-1">Chain agents together to automate multi-step tasks</p>
          </div>
          <button onClick={() => router.push("/workflows/edit/new")} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#7FAEE6] text-white text-sm font-medium hover:bg-[#6A9DDA] transition-colors">
            <Plus className="h-4 w-4" />
            New Workflow
          </button>
        </div>

        {/* All Workflows */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Layers className="h-4 w-4 text-[#7FAEE6]" />
            <h2 className="text-base font-semibold text-[#2B2B2B]">All Workflows</h2>
          </div>
          {!loading && allWorkflows.length === 0 && (
            <div className="text-center py-12 bg-[#FFFDF9] rounded-xl border border-[#E7DED2]">
              <p className="text-sm text-[#9B948B]">No workflows yet — create one to get started</p>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            {allWorkflows.map(wf => (
              <WorkflowCard key={wf.id} workflow={wf}
                onRun={() => handleRun(wf)}
                onEdit={() => router.push(`/workflows/edit/${wf.id}`)}
                onDelete={() => handleDelete(wf)}
                onHistory={() => setHistoryWorkflow(wf)}
                onViewProgress={() => handleViewProgress(wf)}
                onSchedule={() => {
                  if (!wf.topic) {
                    alert("Please set a Topic in the workflow editor before scheduling. Scheduled workflows need a pre-defined topic to run automatically.");
                    router.push(`/workflows/edit/${wf.id}`);
                    return;
                  }
                  setScheduleWorkflow(wf);
                }}
                onFavorite={() => handleToggleFavorite(wf)}
                isFavorite={favoriteIds.includes(wf.id)}
              />
            ))}
          </div>
        </section>
      </div>

      {/* Modals */}
      {runningWorkflow && <WorkflowRunView workflow={runningWorkflow.workflow} existingRun={runningWorkflow.run} onClose={() => { setRunningWorkflow(null); loadWorkflows(); }} onComplete={() => loadWorkflows()} />}
      {historyWorkflow && <WorkflowHistory workflow={historyWorkflow} onClose={() => setHistoryWorkflow(null)} />}
      {topicWorkflow && (
        <TopicInputModal
          templateName={topicWorkflow.name}
          placeholder={TOPIC_PLACEHOLDERS[topicWorkflow.name] || topicWorkflow.description || undefined}
          onSubmit={(topic: string) => handleTopicRun(topic)}
          onClose={() => setTopicWorkflow(null)}
        />
      )}
      {scheduleWorkflow && (
        <ScheduleModal
          workflow={scheduleWorkflow}
          userTimezone={userTimezone}
          onClose={() => setScheduleWorkflow(null)}
          onSave={() => { setScheduleWorkflow(null); loadWorkflows(); }}
        />
      )}
    </div>
  );
}
