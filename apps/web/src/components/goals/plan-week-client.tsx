"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { ChatMessage } from "./chat-message";
import { PlanPreviewModal } from "./plan-preview-modal";
import { useGoalSession } from "@/lib/hooks/use-goal-session";
import type { RebuiltHistory } from "@/lib/ai/draft-history";
import { getTodayDayOfWeek } from "@/lib/utils/date";
import { createDailyTasks, createWeeklyPlan } from "@/lib/db/actions";
import { useState } from "react";

interface PlanWeekClientProps {
  goalId: string;
  goal: { title: string; description: string };
  phase: { id: string; title: string; description: string; estimatedWeeks: number };
  weekStart: string;
  session: { id: string; rebuilt: RebuiltHistory | null };
}

export function PlanWeekClient({ goalId, goal, phase, weekStart, session }: PlanWeekClientProps) {
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const todayDow = getTodayDayOfWeek();

  const sessionHook = useGoalSession({
    initialDraft: session.rebuilt
      ? { sessionId: session.id, rebuilt: session.rebuilt }
      : null,
    intent: "weekly-planning",
    weeklyContext: {
      goalTitle: goal.title,
      goalDescription: goal.description,
      phaseTitle: phase.title,
      phaseDescription: phase.description,
      weekNumber: 1,
      estimatedWeeks: phase.estimatedWeeks,
      isMidWeekStart: todayDow > 0,
      startDayOfWeek: todayDow,
    },
  });

  const handleConfirm = async () => {
    if (!sessionHook.weeklyPreview) return;
    setIsSaving(true);
    try {
      const created = await createWeeklyPlan({
        phase_id: phase.id,
        week_start: weekStart,
        ai_summary: sessionHook.weeklyPreview.ai_summary,
      });
      await createDailyTasks(
        created.id,
        sessionHook.weeklyPreview.tasks.map((t) => ({
          day_of_week: t.day_of_week,
          title: t.title,
          description: t.description,
          time_estimate_minutes: t.time_estimate_minutes,
          time_slot: t.time_slot,
          sort_order: t.sort_order,
        }))
      );
      router.push(`/goals/${goalId}`);
    } catch (err) {
      console.error("[plan-week] confirm failed:", err);
      setIsSaving(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <header className="border-b border-[#E7DED2] px-6 py-4 flex items-center gap-3">
        <button
          onClick={() => router.push(`/goals/${goalId}`)}
          className="text-[#9B948B] hover:text-[#2B2B2B]"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-base font-semibold text-[#2B2B2B]">Plan this week</h1>
          <p className="text-xs text-[#6F6A64]">{phase.title}</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="max-w-3xl mx-auto space-y-4">
          {sessionHook.messages.map((m, i) => (
            <ChatMessage
              key={m.id}
              message={m}
              isStreaming={
                sessionHook.isStreaming && i === sessionHook.messages.length - 1
              }
              onAnswer={sessionHook.answerQuestion}
            />
          ))}
        </div>
      </div>

      {sessionHook.weeklyPreview && (
        <PlanPreviewModal
          plan={sessionHook.weeklyPreview}
          onConfirm={handleConfirm}
          onEdit={sessionHook.requestEdit}
          isSaving={isSaving}
        />
      )}
    </div>
  );
}
