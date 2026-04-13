"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, RefreshCw } from "lucide-react";
import { WorkflowPickerModal } from "./workflow-picker-modal";
import { WorkflowCard } from "@/components/workflow/workflow-card";
import { WorkflowRunView } from "@/components/workflow/workflow-run-view";
import { WorkflowHistory } from "@/components/workflow/workflow-history";
import { TopicInputModal } from "@/components/workflow/topic-input-modal";
import { ScheduleModal } from "@/components/workflow/schedule-modal";
import { deleteWorkflow, getUserTimezone, upsertUserTimezone } from "@/lib/db/actions";
import type { WorkflowSummary } from "@/lib/types/database";
import type { Workflow } from "@/lib/types/workflow";

const FAVORITES_KEY = "yoboss_favorite_workflows";

/** Placeholder topics for known workflow names */
const TOPIC_PLACEHOLDERS: Record<string, string> = {
  "Viral Social Post": "AI breakthroughs this week — which new model, tool, or research paper has the biggest real-world impact and why people should care",
  "Deep Research Report": "Big Tech AI Wars 2026: How Google, Microsoft, Amazon, and Apple are betting billions on AI — competitive positioning, key moves, and which giant is best positioned for the next decade",
  "Competitor Analysis": "OpenAI vs Anthropic: The race to build the most capable and safest AI — comparing models, pricing, enterprise adoption, developer experience, and long-term strategy",
};

function loadFavorites(): string[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]"); } catch { return []; }
}
function saveFavorites(ids: string[]) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(ids));
}

interface Props {
  workflows: WorkflowSummary[];
  allWorkflows: Workflow[];
}

export function DashboardFavoriteWorkflows({ workflows, allWorkflows }: Props) {
  const router = useRouter();
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  // Workflow action state
  const [runningWorkflow, setRunningWorkflow] = useState<Workflow | null>(null);
  const [historyWorkflow, setHistoryWorkflow] = useState<Workflow | null>(null);
  const [topicWorkflow, setTopicWorkflow] = useState<Workflow | null>(null);
  const [scheduleWorkflow, setScheduleWorkflow] = useState<Workflow | null>(null);
  const [userTimezone, setUserTimezone] = useState("UTC");

  useEffect(() => {
    setFavoriteIds(loadFavorites());
    setMounted(true);
    getUserTimezone().then((tz) => {
      if (tz === "UTC") {
        const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        upsertUserTimezone(browserTz).then(() => setUserTimezone(browserTz));
      } else {
        setUserTimezone(tz);
      }
    });
  }, []);

  const favorites = allWorkflows.filter(w => favoriteIds.includes(w.id));

  const handleSave = (ids: string[]) => {
    setFavoriteIds(ids);
    saveFavorites(ids);
    setShowPicker(false);
  };

  const handleToggleFavorite = (wf: Workflow) => {
    const next = favoriteIds.includes(wf.id)
      ? favoriteIds.filter(id => id !== wf.id)
      : [...favoriteIds, wf.id];
    setFavoriteIds(next);
    saveFavorites(next);
  };

  const handleRun = (wf: Workflow) => {
    if (wf.topic) {
      setRunningWorkflow(wf);
    } else {
      setTopicWorkflow(wf);
    }
  };

  const handleTopicRun = (topic: string) => {
    if (!topicWorkflow) return;
    const modifiedWf: Workflow = {
      ...topicWorkflow,
      steps: topicWorkflow.steps.map((s) => ({
        ...s,
        prompt: `Topic/Task: ${topic}\n\n${s.prompt}`,
      })),
    };
    setTopicWorkflow(null);
    setRunningWorkflow(modifiedWf);
  };

  const handleDelete = useCallback(async (wf: Workflow) => {
    if (!confirm(`Delete "${wf.name}"?`)) return;
    setFavoriteIds(prev => { const next = prev.filter(id => id !== wf.id); saveFavorites(next); return next; });
    await deleteWorkflow(wf.id);
    router.refresh();
  }, [router]);

  if (!mounted) return null;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <h2 className="text-xl font-semibold text-[#2B2B2B]">Favorite Workflows</h2>
          <p className="text-sm text-[#9B948B]">Quick access to your most-used automations.</p>
        </div>
        <button
          onClick={() => setShowPicker(true)}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-[#E7DED2] bg-[#FFFDF9] text-[#6F6A64] hover:bg-[#F1ECE4] hover:text-[#2B2B2B] transition-colors"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {favorites.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#E7DED2] bg-[#FFFDF9] p-8 text-center">
          <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-[#F1ECE4] flex items-center justify-center">
            <RefreshCw className="h-5 w-5 text-[#9B948B]" />
          </div>
          <p className="text-sm text-[#6F6A64]">Add your most-used workflows here</p>
          <button
            onClick={() => setShowPicker(true)}
            className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium text-[#7FAEE6] bg-[#EAF3FD] hover:bg-[#7FAEE6]/20 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Workflow
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {favorites.map(wf => (
            <WorkflowCard
              key={wf.id}
              workflow={wf}
              compact
              onRun={() => handleRun(wf)}
              onEdit={() => router.push(`/workflows/edit/${wf.id}`)}
              onDelete={() => handleDelete(wf)}
              onHistory={() => setHistoryWorkflow(wf)}
              onSchedule={() => {
                if (!wf.topic) {
                  alert("Please set a Topic in the workflow editor before scheduling.");
                  router.push(`/workflows/edit/${wf.id}`);
                  return;
                }
                setScheduleWorkflow(wf);
              }}
              onFavorite={() => handleToggleFavorite(wf)}
              isFavorite={true}
            />
          ))}

          {/* Add more button */}
          <button
            onClick={() => setShowPicker(true)}
            className="rounded-xl border border-dashed border-[#E7DED2] bg-[#FFFDF9] p-5 flex flex-col items-center justify-center gap-2 hover:bg-[#F6F3EE] transition-colors min-h-[120px]"
          >
            <Plus className="h-5 w-5 text-[#9B948B]" />
            <span className="text-xs text-[#9B948B]">Add more</span>
          </button>
        </div>
      )}

      {/* Modals */}
      {showPicker && (
        <WorkflowPickerModal
          workflows={workflows}
          selectedIds={favoriteIds}
          onSave={handleSave}
          onClose={() => setShowPicker(false)}
        />
      )}
      {runningWorkflow && (
        <WorkflowRunView
          workflow={runningWorkflow}
          onClose={() => { setRunningWorkflow(null); router.refresh(); }}
          onComplete={() => router.refresh()}
        />
      )}
      {historyWorkflow && (
        <WorkflowHistory workflow={historyWorkflow} onClose={() => setHistoryWorkflow(null)} />
      )}
      {topicWorkflow && (
        <TopicInputModal
          templateName={topicWorkflow.name}
          placeholder={TOPIC_PLACEHOLDERS[topicWorkflow.name] || topicWorkflow.description || undefined}
          onSubmit={handleTopicRun}
          onClose={() => setTopicWorkflow(null)}
        />
      )}
      {scheduleWorkflow && (
        <ScheduleModal
          workflow={scheduleWorkflow}
          userTimezone={userTimezone}
          onClose={() => setScheduleWorkflow(null)}
          onSave={() => { setScheduleWorkflow(null); router.refresh(); }}
        />
      )}
    </div>
  );
}
