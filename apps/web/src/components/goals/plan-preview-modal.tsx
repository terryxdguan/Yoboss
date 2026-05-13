"use client";

import { useEffect, useState } from "react";
import { Calendar, Check, Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { EditableText } from "@/components/ui/editable-text";
import type { WeeklyPlanData } from "@/lib/types/goal-chat";

const DAY_NAME_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export function PlanPreviewModal({
  plan,
  onConfirm,
  onEdit,
  isSaving,
}: {
  plan: WeeklyPlanData;
  /** Confirm hands the (possibly edited) plan back to the caller so the
   *  saver writes the edited version, not the AI's untouched output. */
  onConfirm: (plan: WeeklyPlanData) => void;
  onEdit: () => void;
  isSaving: boolean;
}) {
  const t = useTranslations("goals.planPreview");
  const tDays = useTranslations("days.short");

  // Local editable copy. Re-syncs to incoming prop whenever the model
  // re-emits a fresh plan (e.g. after an "adjust" round).
  const [edited, setEdited] = useState<WeeklyPlanData>(plan);
  useEffect(() => {
    setEdited(plan);
  }, [plan]);

  const tasks = Array.isArray(edited.tasks) ? edited.tasks : [];
  const tasksByDay: Record<number, WeeklyPlanData["tasks"]> = {};
  for (const task of tasks) {
    if (!tasksByDay[task.day_of_week]) tasksByDay[task.day_of_week] = [];
    tasksByDay[task.day_of_week].push(task);
  }

  const totalTasks = tasks.length;
  const totalMinutes = tasks.reduce((sum, t) => sum + (t.time_estimate_minutes || 0), 0);
  const totalHours = Math.round(totalMinutes / 60 * 10) / 10;

  const setSummary = (next: string) =>
    setEdited((p) => ({ ...p, ai_summary: next }));
  const setTaskField = (
    taskIdx: number,
    field: "title" | "description" | "time_slot",
    next: string,
  ) =>
    setEdited((p) => ({
      ...p,
      tasks: p.tasks.map((tk, i) =>
        i === taskIdx ? { ...tk, [field]: next } : tk,
      ),
    }));
  const setTaskMinutes = (taskIdx: number, next: string) => {
    const parsed = parseInt(next, 10);
    if (!Number.isFinite(parsed) || parsed < 0) return;
    setEdited((p) => ({
      ...p,
      tasks: p.tasks.map((tk, i) =>
        i === taskIdx ? { ...tk, time_estimate_minutes: parsed } : tk,
      ),
    }));
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" />
      <div className="relative bg-[#FFFFFF] rounded-2xl shadow-[0_24px_64px_rgba(30,34,39,0.15)] w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        <div className="px-6 pt-6 pb-4 border-b border-[#E7DED2]">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-[#7C2DE8]/10">
              <Calendar className="h-5 w-5 text-[#7C2DE8]" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-[#2B2B2B]">{t("title")}</h2>
              <p className="text-xs text-[#9B948B]">
                {t("summary", { tasks: totalTasks, hours: totalHours })}
              </p>
            </div>
          </div>
          <p className="text-sm text-[#6F6A64] leading-relaxed">
            <EditableText
              value={edited.ai_summary || ""}
              onSave={setSummary}
              multiline
              rows={2}
              placeholder={t("summaryPlaceholder")}
              emptyHint={t("summaryEmpty")}
              className="text-sm text-[#6F6A64]"
            />
          </p>
        </div>
        {/* Inline-edit hint banner — without this users routinely don't
            realize the modal is editable. Single-line, no dismissal.
            Uses the brand action blue + medium weight (not the soft
            #7FAEE6) so it reads as instruction, not decorative caption. */}
        <div className="flex items-center gap-2 px-6 py-3 text-sm font-medium text-[#7C2DE8] bg-[#F3ECFB] border-b border-[#BDD8F2]">
          <Pencil className="h-4 w-4 shrink-0" />
          <span>{t("editHint")}</span>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {[0, 1, 2, 3, 4, 5, 6].map((dayIdx) => {
              const dayTasks = tasksByDay[dayIdx];
              if (!dayTasks || dayTasks.length === 0) return null;
              return (
                <div key={dayIdx} className="bg-[#F6F3EE] rounded-xl p-4 border border-[#E7DED2]/50">
                  <p className="text-sm font-semibold text-[#2B2B2B] mb-2">{tDays(DAY_NAME_KEYS[dayIdx])}</p>
                  <ul className="space-y-2">
                    {dayTasks.map((task) => {
                      const taskIdx = edited.tasks.indexOf(task);
                      return (
                        <li key={taskIdx} className="text-sm text-[#6F6A64]">
                          <p className="text-[#2B2B2B]">
                            <EditableText
                              value={task.title}
                              onSave={(next) => setTaskField(taskIdx, "title", next)}
                              placeholder={t("taskTitlePlaceholder")}
                              className="text-[#2B2B2B]"
                            />
                          </p>
                          <div className="flex items-center gap-2 mt-0.5 text-[11px] text-[#9B948B]">
                            <EditableText
                              value={task.time_slot || ""}
                              onSave={(next) => setTaskField(taskIdx, "time_slot", next)}
                              placeholder={t("taskTimeSlotPlaceholder")}
                              emptyHint={t("taskTimeSlotEmpty")}
                              className="text-[11px] text-[#9B948B]"
                            />
                            <span>
                              <EditableText
                                value={String(task.time_estimate_minutes ?? 0)}
                                onSave={(next) => setTaskMinutes(taskIdx, next)}
                                placeholder="0"
                                className="text-[11px] text-[#9B948B]"
                              />{" "}
                              {t("minutesSuffix")}
                            </span>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
        <div className="px-6 py-4 border-t border-[#E7DED2] flex items-center gap-3">
          <button
            onClick={() => onConfirm(edited)}
            disabled={isSaving}
            className="flex-1 flex items-center justify-center gap-2 bg-[#7FB38A] text-white text-sm font-medium py-3 rounded-xl hover:bg-[#3D7A5A] active:scale-[0.98] transition-all disabled:opacity-50"
          >
            <Check className="h-4 w-4" />
            {isSaving ? t("saving") : t("save")}
          </button>
          <button
            onClick={onEdit}
            disabled={isSaving}
            className="flex items-center justify-center gap-2 text-sm font-medium py-3 px-5 rounded-xl border border-[#DDD3C7] text-[#6F6A64] hover:bg-[#F6F3EE] active:scale-[0.98] transition-all disabled:opacity-50"
          >
            <Pencil className="h-3.5 w-3.5" />
            {t("adjust")}
          </button>
        </div>
      </div>
    </div>
  );
}
