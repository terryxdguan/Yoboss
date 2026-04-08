"use client";

import { useState, useEffect, useCallback } from "react";
import {
  X,
  Plus,
  ChevronUp,
  ChevronDown,
  Sparkles,
  Loader2,
  GripVertical,
} from "lucide-react";
import { ALL_AGENTS, DEFAULT_AGENTS } from "@/lib/ai/agent-registry";
import type { Workflow, WorkflowStep } from "@/lib/types/workflow";

interface WorkflowEditorProps {
  open: boolean;
  onClose: () => void;
  onSave: (workflow: {
    name: string;
    description: string;
    steps: WorkflowStep[];
    isTemplate: boolean;
  }) => void;
  editingWorkflow?: Workflow | null;
}

const allAgents = [...DEFAULT_AGENTS, ...ALL_AGENTS];
// Deduplicate by id
const uniqueAgents = allAgents.filter(
  (a, i) => allAgents.findIndex((b) => b.id === a.id) === i
);

function makeStepId(): string {
  return "step_" + Date.now() + "_" + Math.random().toString(36).slice(2);
}

function emptyStep(order: number): WorkflowStep {
  return { id: makeStepId(), order, agentId: "", prompt: "" };
}

export function WorkflowEditor({
  open,
  onClose,
  onSave,
  editingWorkflow,
}: WorkflowEditorProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isTemplate, setIsTemplate] = useState(false);
  const [steps, setSteps] = useState<WorkflowStep[]>([emptyStep(1)]);
  const [aiLoading, setAiLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      if (editingWorkflow) {
        setName(editingWorkflow.name);
        setDescription(editingWorkflow.description || "");
        setIsTemplate(editingWorkflow.is_template);
        setSteps(
          editingWorkflow.steps.length > 0
            ? editingWorkflow.steps.map((s) => ({ ...s }))
            : [emptyStep(1)]
        );
      } else {
        setName("");
        setDescription("");
        setSteps([emptyStep(1)]);
      }
      setErrors({});
    }
  }, [open, editingWorkflow]);

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

  const handleAIGenerate = useCallback(async () => {
    if (!name.trim()) {
      setErrors({ name: "Enter a workflow name first so AI can generate steps" });
      return;
    }
    setAiLoading(true);
    try {
      const systemPrompt = `You are a workflow designer. Given a workflow name and optional description, generate a sequence of steps. Each step needs an agentId (from the available agents) and a prompt describing the task. Return valid JSON array of objects with "agentId" and "prompt" fields. Available agents: ${uniqueAgents.map((a) => `${a.id} (${a.label})`).join(", ")}`;

      const res = await fetch("/api/ai/agent-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          promptFile: "general_assistant.txt",
          messages: [
            {
              role: "user",
              content: `Design a workflow called "${name}"${description ? ` described as: "${description}"` : ""}.\n\n${systemPrompt}\n\nReturn ONLY a JSON array, no markdown fences.`,
            },
          ],
        }),
      });

      if (!res.ok) throw new Error("Failed to generate");

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let text = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n").filter((l) => l.trim());
        for (const line of lines) {
          if (line.startsWith("event:")) continue;
          const jsonStr = line.startsWith("data: ") ? line.slice(6) : line;
          let event;
          try {
            event = JSON.parse(jsonStr);
          } catch {
            continue;
          }
          if (
            event.type === "content_block_delta" &&
            event.delta?.type === "text_delta" &&
            event.delta.text
          ) {
            text += event.delta.text;
          }
        }
      }

      // Extract JSON from response
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

  const validate = useCallback((): boolean => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Name is required";
    const validSteps = steps.filter((s) => s.agentId && s.prompt.trim());
    if (validSteps.length === 0)
      errs.steps = "At least one step with an agent and prompt is required";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }, [name, steps]);

  const handleSave = useCallback(() => {
    if (!validate()) return;
    const cleanSteps = steps
      .filter((s) => s.agentId && s.prompt.trim())
      .map((s, i) => ({ ...s, order: i + 1 }));
    onSave({ name: name.trim(), description: description.trim(), steps: cleanSteps, isTemplate });
  }, [name, description, steps, validate, onSave]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-[#FFFDF9] rounded-2xl shadow-[0_24px_64px_rgba(30,34,39,0.15)] w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-[#E7DED2]">
          <h2 className="text-lg font-semibold text-[#2B2B2B]">
            {editingWorkflow ? "Edit Workflow" : "New Workflow"}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-[#6F6A64] hover:bg-[#F1ECE4] hover:text-[#2B2B2B] transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Name */}
          {/* Type toggle */}
          <div className="flex items-center gap-3 mb-4">
            <span className="text-sm font-medium text-[#2B2B2B]">Type:</span>
            <button
              onClick={() => setIsTemplate(false)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                !isTemplate ? "bg-[#7FAEE6] text-white" : "bg-[#F1ECE4] text-[#6F6A64] hover:bg-[#E7DED2]"
              }`}
            >
              Specific Workflow
            </button>
            <button
              onClick={() => setIsTemplate(true)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                isTemplate ? "bg-[#7FAEE6] text-white" : "bg-[#F1ECE4] text-[#6F6A64] hover:bg-[#E7DED2]"
              }`}
            >
              Template
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-[#2B2B2B] mb-1.5">
              Workflow Name
            </label>
            <input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (errors.name) setErrors((p) => ({ ...p, name: "" }));
              }}
              placeholder="e.g. Weekly Content Pipeline"
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD3C7] bg-[#FFFDF9] text-sm text-[#2B2B2B] placeholder:text-[#9B948B] focus:outline-none focus:border-[#7FAEE6] focus:ring-2 focus:ring-[#7FAEE6]/20 transition-colors"
            />
            {errors.name && (
              <p className="text-xs text-[#D5847A] mt-1">{errors.name}</p>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-[#2B2B2B] mb-1.5">
              Description{" "}
              <span className="text-[#9B948B] font-normal">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="What does this workflow do?"
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#DDD3C7] bg-[#FFFDF9] text-sm text-[#2B2B2B] placeholder:text-[#9B948B] focus:outline-none focus:border-[#7FAEE6] focus:ring-2 focus:ring-[#7FAEE6]/20 transition-colors resize-none"
            />
          </div>

          {/* AI Generate */}
          <button
            onClick={handleAIGenerate}
            disabled={aiLoading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#EAF3FD] text-[#7FAEE6] text-sm font-medium hover:bg-[#7FAEE6] hover:text-white transition-colors disabled:opacity-50"
          >
            {aiLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {aiLoading ? "Generating..." : "AI Generate Steps"}
          </button>

          {/* Steps */}
          <div>
            <label className="block text-sm font-medium text-[#2B2B2B] mb-3">
              Steps
            </label>
            {errors.steps && (
              <p className="text-xs text-[#D5847A] mb-2">{errors.steps}</p>
            )}
            <div className="space-y-3">
              {steps.map((step, idx) => (
                <div
                  key={step.id}
                  className="border border-[#E7DED2] rounded-xl bg-[#F6F3EE] p-4"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <GripVertical className="h-4 w-4 text-[#9B948B] shrink-0" />
                    <span className="text-xs font-semibold text-[#6F6A64] bg-[#FFFDF9] px-2 py-0.5 rounded-md border border-[#E7DED2]">
                      {idx + 1}
                    </span>

                    {/* Agent dropdown */}
                    <select
                      value={step.agentId}
                      onChange={(e) =>
                        handleUpdateStep(idx, "agentId", e.target.value)
                      }
                      className="flex-1 px-3 py-1.5 rounded-lg border border-[#DDD3C7] bg-[#FFFDF9] text-sm text-[#2B2B2B] focus:outline-none focus:border-[#7FAEE6] transition-colors"
                    >
                      <option value="">Select Agent...</option>
                      {uniqueAgents.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.label}
                        </option>
                      ))}
                    </select>

                    {/* Move / Delete */}
                    <div className="flex items-center gap-0.5">
                      <button
                        onClick={() => handleMoveStep(idx, -1)}
                        disabled={idx === 0}
                        className="p-1 rounded text-[#9B948B] hover:text-[#2B2B2B] hover:bg-[#FFFDF9] disabled:opacity-30 transition-colors"
                        title="Move up"
                      >
                        <ChevronUp className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleMoveStep(idx, 1)}
                        disabled={idx === steps.length - 1}
                        className="p-1 rounded text-[#9B948B] hover:text-[#2B2B2B] hover:bg-[#FFFDF9] disabled:opacity-30 transition-colors"
                        title="Move down"
                      >
                        <ChevronDown className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleRemoveStep(idx)}
                        disabled={steps.length <= 1}
                        className="p-1 rounded text-[#9B948B] hover:text-[#D5847A] hover:bg-[#FFFDF9] disabled:opacity-30 transition-colors"
                        title="Remove step"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Prompt */}
                  <textarea
                    value={step.prompt}
                    onChange={(e) =>
                      handleUpdateStep(idx, "prompt", e.target.value)
                    }
                    rows={3}
                    placeholder="Describe what this agent should do..."
                    className="w-full px-3.5 py-2.5 rounded-lg border border-[#DDD3C7] bg-[#FFFDF9] text-sm text-[#2B2B2B] placeholder:text-[#9B948B] focus:outline-none focus:border-[#7FAEE6] focus:ring-2 focus:ring-[#7FAEE6]/20 transition-colors resize-none"
                  />
                </div>
              ))}
            </div>

            {/* Add Step */}
            <button
              onClick={handleAddStep}
              className="mt-3 flex items-center gap-1.5 text-sm text-[#7FAEE6] hover:text-[#6A9DDA] font-medium transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add Step
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#E7DED2]">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium text-[#6F6A64] hover:bg-[#F1ECE4] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2 rounded-xl text-sm font-medium bg-[#7FAEE6] text-white hover:bg-[#6A9DDA] transition-colors shadow-[0_2px_8px_rgba(127,174,230,0.3)]"
          >
            {editingWorkflow ? "Update" : "Create"} Workflow
          </button>
        </div>
      </div>
    </div>
  );
}
