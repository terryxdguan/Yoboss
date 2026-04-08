"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, Heart, Zap, Layers } from "lucide-react";
import { WORKFLOW_TEMPLATES } from "@/lib/ai/workflow-templates";
import {
  getWorkflows,
  createWorkflow,
  updateWorkflow,
  deleteWorkflow,
} from "@/lib/db/actions";
import { WorkflowEditor } from "@/components/workflow/workflow-editor";
import { WorkflowRunView } from "@/components/workflow/workflow-run-view";
import { WorkflowHistory } from "@/components/workflow/workflow-history";
import { WorkflowCard } from "@/components/workflow/workflow-card";
import { TopicInputModal } from "@/components/workflow/topic-input-modal";
import type { Workflow, WorkflowStep } from "@/lib/types/workflow";

const FAVORITES_KEY = "yoboss_favorite_workflows";

function loadFavorites(): string[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]"); } catch { return []; }
}
function saveFavorites(ids: string[]) { localStorage.setItem(FAVORITES_KEY, JSON.stringify(ids)); }
function makeStepId(): string { return "step_" + Date.now() + "_" + Math.random().toString(36).slice(2); }

export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);

  const [showEditor, setShowEditor] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<Workflow | null>(null);
  const [runningWorkflow, setRunningWorkflow] = useState<Workflow | null>(null);
  const [historyWorkflow, setHistoryWorkflow] = useState<Workflow | null>(null);

  // Topic input for "Use Template"
  const [topicTemplate, setTopicTemplate] = useState<Workflow | null>(null);

  useEffect(() => { setFavoriteIds(loadFavorites()); setMounted(true); }, []);

  const loadWorkflows = useCallback(async () => {
    try { setWorkflows(await getWorkflows()); } catch (err) { console.error(err); } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadWorkflows(); }, [loadWorkflows]);

  // Auto-create template workflows on first load (run once)
  const templatesInitedRef = useRef(false);
  useEffect(() => {
    if (loading || !mounted || templatesInitedRef.current) return;
    templatesInitedRef.current = true;
    const existingNames = new Set(workflows.filter(w => w.is_template).map(w => w.name));
    const missing = WORKFLOW_TEMPLATES.filter(t => !existingNames.has(t.name));
    if (missing.length > 0) {
      Promise.all(missing.map(t =>
        createWorkflow({
          name: t.name,
          description: t.description,
          steps: t.steps.map(s => ({ ...s, id: makeStepId() })),
          isTemplate: true,
        })
      )).then(() => loadWorkflows());
    }
  }, [loading, mounted, workflows, loadWorkflows]);

  // Save (create or update)
  const handleSave = useCallback(async (data: { name: string; description: string; steps: WorkflowStep[]; isTemplate: boolean }) => {
    try {
      if (editingWorkflow) {
        await updateWorkflow(editingWorkflow.id, { name: data.name, description: data.description || null, steps: data.steps, is_template: data.isTemplate });
      } else {
        await createWorkflow({ name: data.name, description: data.description || undefined, steps: data.steps, isTemplate: data.isTemplate });
      }
      setShowEditor(false);
      setEditingWorkflow(null);
      await loadWorkflows();
    } catch (err) { console.error(err); }
  }, [editingWorkflow, loadWorkflows]);

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

  // "Use Template" → topic input → create specific workflow
  const handleUseTemplate = async (topic: string, autoRun: boolean) => {
    if (!topicTemplate) return;
    const steps: WorkflowStep[] = topicTemplate.steps.map(s => ({
      ...s,
      id: makeStepId(),
      prompt: `Topic/Task: ${topic}\n\n${s.prompt}`,
    }));
    // Create a short readable name
    const words = topic.split(/\s+/).slice(0, 5).join(" ");
    const shortTopic = words.length > 30 ? words.slice(0, 30).trim() + "..." : words;
    const wf = await createWorkflow({
      name: `${shortTopic} — ${topicTemplate.name}`,
      description: topic,
      steps,
    });
    setTopicTemplate(null);
    await loadWorkflows();
    if (autoRun && wf) setRunningWorkflow(wf);
  };

  const templates = workflows.filter(w => w.is_template);
  const specificWorkflows = workflows.filter(w => !w.is_template);
  const favoriteWorkflows = specificWorkflows.filter(w => favoriteIds.includes(w.id));

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
          <button onClick={() => { setEditingWorkflow(null); setShowEditor(true); }} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#7FAEE6] text-white text-sm font-medium hover:bg-[#6A9DDA] transition-colors">
            <Plus className="h-4 w-4" />
            New Workflow
          </button>
        </div>

        {/* 1. Favorite Workflows */}
        {favoriteWorkflows.length > 0 && (
          <section className="mb-10">
            <div className="flex items-center gap-2 mb-4">
              <Heart className="h-4 w-4 text-[#D5847A]" />
              <h2 className="text-base font-semibold text-[#2B2B2B]">Favorite Workflows</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {favoriteWorkflows.map(wf => (
                <WorkflowCard key={`fav-${wf.id}`} workflow={wf}
                  onRun={() => setRunningWorkflow(wf)}
                  onEdit={() => { setEditingWorkflow(wf); setShowEditor(true); }}
                  onDelete={() => handleDelete(wf)}
                  onHistory={() => setHistoryWorkflow(wf)}
                  onFavorite={() => handleToggleFavorite(wf)}
                  isFavorite={true}
                />
              ))}
            </div>
          </section>
        )}

        {/* 2. Workflow Templates */}
        <section className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="h-4 w-4 text-[#D4B06A]" />
            <h2 className="text-base font-semibold text-[#2B2B2B]">Workflow Templates</h2>
          </div>
          {templates.length === 0 && !loading && (
            <p className="text-sm text-[#9B948B]">Loading templates...</p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {templates.map(wf => (
              <WorkflowCard key={wf.id} workflow={wf}
                onRun={() => {}} // Not used for templates
                onEdit={() => { setEditingWorkflow(wf); setShowEditor(true); }}
                onDelete={() => handleDelete(wf)}
                onHistory={() => {}} // Not used for templates
                onUseTemplate={() => setTopicTemplate(wf)}
              />
            ))}
          </div>
        </section>

        {/* 3. My Workflows (specific) */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Layers className="h-4 w-4 text-[#7FAEE6]" />
            <h2 className="text-base font-semibold text-[#2B2B2B]">My Workflows</h2>
          </div>
          {!loading && specificWorkflows.length === 0 && (
            <div className="text-center py-12 bg-[#FFFDF9] rounded-xl border border-[#E7DED2]">
              <p className="text-sm text-[#9B948B]">No workflows yet — use a template or create one</p>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {specificWorkflows.map(wf => (
              <WorkflowCard key={wf.id} workflow={wf}
                onRun={() => setRunningWorkflow(wf)}
                onEdit={() => { setEditingWorkflow(wf); setShowEditor(true); }}
                onDelete={() => handleDelete(wf)}
                onHistory={() => setHistoryWorkflow(wf)}
                onFavorite={() => handleToggleFavorite(wf)}
                isFavorite={favoriteIds.includes(wf.id)}
              />
            ))}
          </div>
        </section>
      </div>

      {/* Modals */}
      <WorkflowEditor open={showEditor} onClose={() => { setShowEditor(false); setEditingWorkflow(null); }} onSave={handleSave} editingWorkflow={editingWorkflow} />
      {runningWorkflow && <WorkflowRunView workflow={runningWorkflow} onClose={() => { setRunningWorkflow(null); loadWorkflows(); }} onComplete={() => loadWorkflows()} />}
      {historyWorkflow && <WorkflowHistory workflow={historyWorkflow} onClose={() => setHistoryWorkflow(null)} />}
      {topicTemplate && <TopicInputModal templateName={topicTemplate.name} placeholder={WORKFLOW_TEMPLATES.find(t => t.name === topicTemplate.name)?.topicPlaceholder} onSubmit={handleUseTemplate} onClose={() => setTopicTemplate(null)} />}
    </div>
  );
}
