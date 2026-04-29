"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  ArrowLeft,
  Plus,
  ChevronUp,
  ChevronDown,
  Sparkles,
  Loader2,
  GripVertical,
  X,
  Save,
  Wand2,
} from "lucide-react";
import { ALL_AGENTS, DEFAULT_AGENTS } from "@/lib/ai/agent-registry";
import { getWorkflows, updateWorkflow, createWorkflow } from "@/lib/db/actions";
import type { Workflow, WorkflowStep } from "@/lib/types/workflow";

const allAgents = [...DEFAULT_AGENTS, ...ALL_AGENTS];
const uniqueAgents = allAgents.filter(
  (a, i) => allAgents.findIndex((b) => b.id === a.id) === i
);

function makeStepId(): string {
  return "step_" + Date.now() + "_" + Math.random().toString(36).slice(2);
}

function emptyStep(order: number): WorkflowStep {
  return { id: makeStepId(), order, agentId: "", prompt: "" };
}

/** Stream helper — reads SSE text from agent-chat */
async function streamAgentChat(
  body: Record<string, unknown>
): Promise<string> {
  const res = await fetch("/api/ai/agent-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || `API error: ${res.status}`);
  }
  const reader = res.body?.getReader();
  if (!reader) throw new Error("No body");
  const decoder = new TextDecoder();
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    for (const line of chunk.split("\n").filter((l) => l.trim())) {
      if (line.startsWith("event:")) continue;
      const jsonStr = line.startsWith("data: ") ? line.slice(6) : line;
      try {
        const event = JSON.parse(jsonStr);
        if (
          event.type === "content_block_delta" &&
          event.delta?.type === "text_delta" &&
          event.delta.text
        ) {
          text += event.delta.text;
        }
      } catch {
        /* skip */
      }
    }
  }
  return text;
}

export default function WorkflowEditPage() {
  const params = useParams();
  const router = useRouter();
  const t = useTranslations("workflows.edit");
  const workflowId = params.id as string;
  const isNew = workflowId === "new";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [workflow, setWorkflow] = useState<Workflow | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [topic, setTopic] = useState("");
  const [steps, setSteps] = useState<WorkflowStep[]>([emptyStep(1)]);
  const [aiLoading, setAiLoading] = useState(false);
  const [enhancingStep, setEnhancingStep] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  // Load workflow
  useEffect(() => {
    if (isNew) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        const workflows = await getWorkflows();
        const wf = workflows.find((w) => w.id === workflowId);
        if (wf) {
          setWorkflow(wf);
          setName(wf.name);
          setDescription(wf.description || "");
          setTopic(wf.topic || "");
          setSteps(
            wf.steps.length > 0
              ? wf.steps.map((s) => ({ ...s }))
              : [emptyStep(1)]
          );
        }
      } catch (err) {
        console.error("Failed to load workflow:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [workflowId, isNew]);

  // Step operations
  const handleAddStep = useCallback(() => {
    setSteps((prev) => [...prev, emptyStep(prev.length + 1)]);
  }, []);

  const handleRemoveStep = useCallback((idx: number) => {
    setSteps((prev) => {
      if (prev.length <= 1) return prev;
      return prev
        .filter((_, i) => i !== idx)
        .map((s, i) => ({ ...s, order: i + 1 }));
    });
  }, []);

  const handleMoveStep = useCallback((idx: number, dir: -1 | 1) => {
    setSteps((prev) => {
      const target = idx + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next.map((s, i) => ({ ...s, order: i + 1 }));
    });
  }, []);

  const handleUpdateStep = useCallback(
    (idx: number, field: "agentId" | "prompt", value: string) => {
      setSteps((prev) =>
        prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s))
      );
    },
    []
  );

  // AI Generate all steps
  const handleAIGenerate = useCallback(async () => {
    if (!name.trim()) {
      setErrors({ name: "Enter a workflow name first" });
      return;
    }
    if (!description.trim()) {
      setErrors({ description: "Enter a description so we can generate steps" });
      return;
    }
    setAiLoading(true);
    try {
      const agentList = uniqueAgents
        .map((a) => `${a.id} (${a.label})`)
        .join(", ");
      const text = await streamAgentChat({
        promptFile: "general_assistant.txt",
        messages: [
          {
            role: "user",
            content: `Design a workflow called "${name}" described as: "${description}".\n\nYou are a workflow designer. Generate a sequence of steps. Each step needs an agentId and a prompt. Return valid JSON array of objects with "agentId" and "prompt" fields.\nAvailable agents: ${agentList}\n\nReturn ONLY a JSON array, no markdown fences.`,
          },
        ],
      });

      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as {
          agentId: string;
          prompt: string;
        }[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          setSteps(
            parsed.map((s, i) => ({
              id: makeStepId(),
              order: i + 1,
              agentId: s.agentId || "",
              prompt: s.prompt || "",
            }))
          );
        }
      }
    } catch (err) {
      console.error("AI generate failed:", err);
    } finally {
      setAiLoading(false);
    }
  }, [name, description]);

  // AI Enhance single step prompt
  const handleEnhanceStep = useCallback(
    async (idx: number) => {
      const step = steps[idx];
      const agent = uniqueAgents.find((a) => a.id === step.agentId);
      if (!agent) {
        setErrors({ steps: "Select an agent first before enhancing" });
        return;
      }
      if (!step.prompt.trim()) {
        setErrors({ steps: "Write a basic prompt first, then enhance it" });
        return;
      }
      setEnhancingStep(idx);
      try {
        const text = await streamAgentChat({
          promptFile: "general_assistant.txt",
          messages: [
            {
              role: "user",
              content: `You are a prompt engineering expert. Enhance the following prompt to be more detailed, specific, and professional for the given agent role.

Agent Role: ${agent.label} — ${agent.description}
Agent Expertise: ${agent.expertise.join(", ")}

Workflow: "${name}" — ${description}
Step ${idx + 1} of ${steps.length}${idx > 0 ? `\nPrevious step: "${steps[idx - 1].prompt.slice(0, 200)}"` : ""}

Current prompt:
"${step.prompt}"

Write an improved version of this prompt. Make it:
1. More specific about expected output format and quality
2. Include relevant details the agent should consider
3. Reference the workflow context
4. Keep it concise but comprehensive

Return ONLY the enhanced prompt text, no explanation or markdown fences.`,
            },
          ],
        });

        const enhanced = text.trim();
        if (enhanced && enhanced.length > 10) {
          handleUpdateStep(idx, "prompt", enhanced);
        }
      } catch (err) {
        console.error("Enhance failed:", err);
      } finally {
        setEnhancingStep(null);
      }
    },
    [steps, name, description, handleUpdateStep]
  );

  // Validation
  const validate = useCallback((): boolean => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Name is required";
    if (!description.trim()) errs.description = "Description is required";
    const validSteps = steps.filter((s) => s.agentId && s.prompt.trim());
    if (validSteps.length === 0)
      errs.steps = "At least one step with an agent and prompt is required";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }, [name, description, steps]);

  // Save
  const handleSave = useCallback(async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const cleanSteps = steps
        .filter((s) => s.agentId && s.prompt.trim())
        .map((s, i) => ({ ...s, order: i + 1 }));

      if (isNew) {
        await createWorkflow({
          name: name.trim(),
          description: description.trim(),
          topic: topic.trim() || undefined,
          steps: cleanSteps,
        });
      } else {
        await updateWorkflow(workflowId, {
          name: name.trim(),
          description: description.trim(),
          topic: topic.trim() || null,
          steps: cleanSteps,
        });
      }
      setSaved(true);
      setTimeout(() => router.push("/workflows"), 600);
    } catch (err) {
      console.error("Save failed:", err);
    } finally {
      setSaving(false);
    }
  }, [name, description, topic, steps, isNew, workflowId, validate, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-sm text-[#9B948B]">{t("loading")}</div>
      </div>
    );
  }

  return (
    <div>
      {/* Back link — scrolls away normally */}
      <button
        onClick={() => router.push("/workflows")}
        className="flex items-center gap-1.5 text-sm text-[#6F6A64] hover:text-[#2B2B2B] transition-colors mb-4"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Workflows
      </button>

      {/* Sticky header — keeps the Save button visible no matter how far
          the user scrolls through the steps list. Offset by 64px to sit
          below the fixed top-nav (h-16). Negative horizontal margins +
          matching padding let the bar extend to the page edges, and a
          bottom border separates it from scrolling content below. */}
      <div className="sticky top-16 z-20 -mx-6 md:-mx-8 px-6 md:px-8 py-3 mb-6 bg-[#F6F3EE]/95 backdrop-blur-sm border-b border-[#E7DED2]">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-[#2B2B2B]">
            {isNew ? "New Workflow" : "Edit Workflow"}
          </h1>
          <button
            onClick={handleSave}
            disabled={saving}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all shadow-[0_2px_8px_rgba(0,122,255,0.3)] ${
              saved
                ? "bg-[#7FB38A] text-white"
                : "bg-[#007AFF] text-white hover:bg-[#0066D6]"
            } disabled:opacity-50`}
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saved ? "Saved!" : saving ? "Saving..." : isNew ? "Create" : "Save"}
          </button>
        </div>
      </div>

      {/* Name */}
      <div className="mb-4">
        <label className="block text-sm font-medium text-[#2B2B2B] mb-1.5">
          Workflow Name <span className="text-[#D5847A]">*</span>
        </label>
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (errors.name) setErrors((p) => ({ ...p, name: "" }));
          }}
          placeholder={t("namePlaceholder")}
          className={`w-full px-3.5 py-2.5 rounded-xl border bg-[#FFFDF9] text-sm text-[#2B2B2B] placeholder:text-[#9B948B] focus:outline-none focus:ring-2 transition-colors ${errors.name ? "border-[#D5847A] focus:border-[#D5847A] focus:ring-[#D5847A]/20" : "border-[#DDD3C7] focus:border-[#007AFF] focus:ring-[#007AFF]/20"}`}
        />
        {errors.name && (
          <p className="text-xs text-[#D5847A] mt-1">{errors.name}</p>
        )}
      </div>

      {/* Description — mandatory, full width */}
      <div className="mb-5">
        <label className="block text-sm font-medium text-[#2B2B2B] mb-1.5">
          Description <span className="text-[#D5847A]">*</span>
        </label>
        <textarea
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
            if (errors.description)
              setErrors((p) => ({ ...p, description: "" }));
          }}
          rows={3}
          placeholder={t("descPlaceholder")}
          className={`w-full px-3.5 py-2.5 rounded-xl border bg-[#FFFDF9] text-sm text-[#2B2B2B] placeholder:text-[#9B948B] focus:outline-none focus:ring-2 transition-colors resize-y min-h-[80px] ${errors.description ? "border-[#D5847A] focus:border-[#D5847A] focus:ring-[#D5847A]/20" : "border-[#DDD3C7] focus:border-[#007AFF] focus:ring-[#007AFF]/20"}`}
        />
        {errors.description && (
          <p className="text-xs text-[#D5847A] mt-1">{errors.description}</p>
        )}
      </div>

      {/* Topic — optional */}
      <div className="mb-5">
        <label className="block text-sm font-medium text-[#2B2B2B] mb-1.5">
          Topic{" "}
          <span className="text-[#9B948B] font-normal">(optional)</span>
        </label>
        <input
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder={t("topicPlaceholder")}
          className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD3C7] bg-[#FFFDF9] text-sm text-[#2B2B2B] placeholder:text-[#9B948B] focus:outline-none focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/20 transition-colors"
        />
      </div>

      {/* AI Generate */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={handleAIGenerate}
          disabled={aiLoading}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#E6F2FF] text-[#007AFF] text-sm font-medium hover:bg-[#007AFF] hover:text-white transition-colors disabled:opacity-50"
        >
          {aiLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {aiLoading ? "Generating..." : "Generate Steps"}
        </button>
        {errors.steps && (
          <p className="text-xs text-[#D5847A]">{errors.steps}</p>
        )}
      </div>

      {/* Steps */}
      <div className="space-y-4 mb-8">
        <label className="block text-sm font-medium text-[#2B2B2B]">
          Steps ({steps.length})
        </label>

        {steps.map((step, idx) => {
          const agent = uniqueAgents.find((a) => a.id === step.agentId);
          const isEnhancing = enhancingStep === idx;
          return (
            <div
              key={step.id}
              className="border border-[#E7DED2] rounded-xl bg-[#FFFDF9] overflow-hidden"
            >
              {/* Step header */}
              <div className="flex items-center gap-2 px-4 py-3 bg-[#F6F3EE] border-b border-[#E7DED2]">
                <GripVertical className="h-4 w-4 text-[#9B948B] shrink-0" />
                <span className="text-xs font-bold text-[#6F6A64] bg-white px-2.5 py-0.5 rounded-md border border-[#E7DED2]">
                  Step {idx + 1}
                </span>

                {/* Agent dropdown — compact width */}
                <select
                  value={step.agentId}
                  onChange={(e) =>
                    handleUpdateStep(idx, "agentId", e.target.value)
                  }
                  className="w-48 px-3 py-1.5 rounded-lg border border-[#DDD3C7] bg-white text-sm text-[#2B2B2B] focus:outline-none focus:border-[#007AFF] transition-colors shrink-0"
                >
                  <option value="">{t("selectEmployee")}</option>
                  {uniqueAgents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>

                {/* Agent description inline */}
                {agent && (
                  <span className="text-xs text-[#6F6A64] truncate min-w-0">
                    {agent.description}
                  </span>
                )}

                <div className="flex-1" />

                {/* AI Enhance prompt */}
                <button
                  onClick={() => handleEnhanceStep(idx)}
                  disabled={isEnhancing || enhancingStep !== null}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium text-[#007AFF] bg-[#E6F2FF] hover:bg-[#007AFF] hover:text-white transition-colors disabled:opacity-40 shrink-0"
                  title={t("enhancePrompt")}
                >
                  {isEnhancing ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Wand2 className="h-3.5 w-3.5" />
                  )}
                  {isEnhancing ? "Enhancing..." : "Enhance"}
                </button>

                {/* Move / Delete */}
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    onClick={() => handleMoveStep(idx, -1)}
                    disabled={idx === 0}
                    className="p-1 rounded text-[#9B948B] hover:text-[#2B2B2B] hover:bg-white disabled:opacity-30 transition-colors"
                    title={t("moveUp")}
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleMoveStep(idx, 1)}
                    disabled={idx === steps.length - 1}
                    className="p-1 rounded text-[#9B948B] hover:text-[#2B2B2B] hover:bg-white disabled:opacity-30 transition-colors"
                    title={t("moveDown")}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => handleRemoveStep(idx)}
                    disabled={steps.length <= 1}
                    className="p-1 rounded text-[#9B948B] hover:text-[#D5847A] hover:bg-white disabled:opacity-30 transition-colors"
                    title={t("removeStep")}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Prompt — full width, auto-resize */}
              <div className="p-4">
                <textarea
                  value={step.prompt}
                  onChange={(e) =>
                    handleUpdateStep(idx, "prompt", e.target.value)
                  }
                  rows={Math.max(4, step.prompt.split("\n").length + 1)}
                  placeholder={t("stepPromptPlaceholder")}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-[#DDD3C7] bg-[#F6F3EE] text-sm text-[#2B2B2B] placeholder:text-[#9B948B] focus:outline-none focus:border-[#007AFF] focus:ring-2 focus:ring-[#007AFF]/20 transition-colors resize-y min-h-[100px]"
                />
              </div>
            </div>
          );
        })}

        {/* Add Step */}
        <button
          onClick={handleAddStep}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-[#DDD3C7] text-sm text-[#007AFF] hover:border-[#007AFF] hover:bg-[#E6F2FF]/30 font-medium transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Step
        </button>
      </div>
    </div>
  );
}
