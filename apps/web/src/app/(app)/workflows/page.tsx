"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus, Layers } from "lucide-react";
import {
  getWorkflows,
  deleteWorkflow,
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
const SORT_KEY = "yoboss_workflow_sort";
type SortMode = "name" | "recent";

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
  const t = useTranslations("workflows.list");
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  const [runningWorkflow, setRunningWorkflow] = useState<{ workflow: Workflow; run?: WorkflowRun; cachedMode?: boolean; topic?: string } | null>(null);
  const [historyWorkflow, setHistoryWorkflow] = useState<Workflow | null>(null);

  // Topic input for workflows without a pre-set topic
  const [topicWorkflow, setTopicWorkflow] = useState<Workflow | null>(null);

  const [scheduleWorkflow, setScheduleWorkflow] = useState<Workflow | null>(null);
  const [userTimezone, setUserTimezone] = useState("UTC");
  const [sortMode, setSortMode] = useState<SortMode>("name");

  useEffect(() => {
    setFavoriteIds(loadFavorites());
    const saved = localStorage.getItem(SORT_KEY);
    if (saved === "name" || saved === "recent") setSortMode(saved);
    setMounted(true);
  }, []);

  const handleSortChange = (mode: SortMode) => {
    setSortMode(mode);
    localStorage.setItem(SORT_KEY, mode);
  };

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
      // 1. Check for a cached demo run first. Template-linked workflows
      //    whose topic matches workflow_templates.topic serve a cached
      //    successful run instead of executing live, so first-time users
      //    can immediately see what the workflow produces without paying
      //    for a real run.
      const cacheRes = await fetch("/api/workflows/check-cache", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflowId: wf.id, ...(topic ? { topic } : {}) }),
      });
      const cacheData = cacheRes.ok ? await cacheRes.json() : { cached: false };

      if (
        cacheData.cached &&
        cacheData.runData &&
        Array.isArray(cacheData.runData.stepResults)
      ) {
        // Synthetic WorkflowRun: never written to DB. workflow-run-view
        // recognizes cachedMode and renders step_results directly.
        const syntheticRun: WorkflowRun = {
          id: `cached-${wf.id}-${Date.now()}`,
          workflow_id: wf.id,
          user_id: "",
          status: "success",
          current_step: cacheData.runData.totalSteps,
          total_steps: cacheData.runData.totalSteps,
          step_results: cacheData.runData.stepResults,
          follow_up_messages: cacheData.runData.followUpMessages ?? null,
          session_id: null,
          triggered_by: "manual",
          started_at: cacheData.runData.recordedAt,
          completed_at: cacheData.runData.recordedAt,
        };
        setRunningWorkflow({ workflow: wf, run: syntheticRun, cachedMode: true });
        return;
      }

      // 2. No cache hit → open run view in client-driven execution mode.
      // WorkflowRunView.executeWorkflow() creates the workflow_runs row
      // itself and drives each step via /api/ai/agent-run-step, giving
      // every step its own 300s HTTP budget. This keeps multi-step runs
      // under the Vercel Hobby serverless function ceiling (one server
      // request per step instead of one request for the whole workflow).
      setRunningWorkflow({ workflow: wf, topic });
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

  const allWorkflows = useMemo(() => {
    const arr = [...workflows];
    const favSet = new Set(favoriteIds);
    // Favorites always come first, regardless of sort mode. Within each
    // group (favorited / not), the selected sort mode applies.
    const byFavorite = (a: Workflow, b: Workflow) =>
      Number(favSet.has(b.id)) - Number(favSet.has(a.id));
    if (sortMode === "name") {
      arr.sort((a, b) => byFavorite(a, b) || a.name.localeCompare(b.name));
    } else {
      // "recent": last_run_at DESC, never-run workflows sink to bottom,
      // ties broken by name so order stays deterministic.
      arr.sort((a, b) => {
        const fav = byFavorite(a, b);
        if (fav !== 0) return fav;
        if (!a.last_run_at && !b.last_run_at) return a.name.localeCompare(b.name);
        if (!a.last_run_at) return 1;
        if (!b.last_run_at) return -1;
        return b.last_run_at.localeCompare(a.last_run_at);
      });
    }
    return arr;
  }, [workflows, sortMode, favoriteIds]);

  if (!mounted) return <div className="flex items-center justify-center py-24"><div className="text-sm text-[#9B948B]">{t("loading")}</div></div>;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-full px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-[#2B2B2B]">{t("title")}</h1>
            <p className="text-sm text-[#6F6A64] mt-1">{t("subtitle")}</p>
          </div>
          <button onClick={() => router.push("/workflows/edit/new")} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#7C2DE8] text-white text-sm font-medium hover:bg-[#6921C7] transition-colors">
            <Plus className="h-4 w-4" />
            New Workflow
          </button>
        </div>

        {/* All Workflows */}
        <section>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-[#7C2DE8]" />
              <h2 className="text-base font-semibold text-[#2B2B2B]">{t("all")}</h2>
            </div>
            <select
              value={sortMode}
              onChange={(e) => handleSortChange(e.target.value as SortMode)}
              className="text-xs text-[#6F6A64] bg-[#FFFFFF] border border-[#E7DED2] rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#7C2DE8] cursor-pointer"
              aria-label={t("sortAria")}
            >
              <option value="name">{t("sortName")}</option>
              <option value="recent">{t("sortRecent")}</option>
            </select>
          </div>
          {!loading && allWorkflows.length === 0 && (
            <div className="text-center py-12 bg-[#FFFFFF] rounded-xl border border-[#E7DED2]">
              <p className="text-sm text-[#9B948B]">{t("empty")}</p>
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
      {runningWorkflow && <WorkflowRunView workflow={runningWorkflow.workflow} existingRun={runningWorkflow.run} cachedMode={runningWorkflow.cachedMode} topic={runningWorkflow.topic} onClose={() => { setRunningWorkflow(null); loadWorkflows(); }} onComplete={() => loadWorkflows()} />}
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
