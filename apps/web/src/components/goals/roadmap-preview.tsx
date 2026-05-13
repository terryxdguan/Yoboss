"use client";

import { useEffect, useState } from "react";
import { X, Loader2, Calendar, Clock, Flag, Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import { EditableText } from "@/components/ui/editable-text";
import type { GoalPlanData } from "@/lib/types/goal-chat";

interface RoadmapPreviewProps {
  plan: GoalPlanData;
  /** Confirm now sends the (possibly edited) plan back to the caller so
   *  the saver writes the edited version, not the original AI output. */
  onConfirm: (plan: GoalPlanData) => void;
  onEdit: () => void;
  isSaving?: boolean;
  error?: string | null;
}

const DAY_NAME_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export function RoadmapPreview({
  plan,
  onConfirm,
  onEdit,
  isSaving,
  error,
}: RoadmapPreviewProps) {
  const t = useTranslations("goals.roadmapPreview");
  const tDays = useTranslations("days.short");

  // Local editable copy of the plan. Re-syncs when the prop changes (e.g.
  // after an "edit" round trip with the model). All inline edits mutate
  // this copy; the unedited prop stays untouched until the user confirms.
  const [edited, setEdited] = useState<GoalPlanData>(plan);
  useEffect(() => {
    setEdited(plan);
  }, [plan]);

  // Defensive: Claude can occasionally emit malformed tool_use where phases
  // is not an array (e.g. after an interrupted resume). The hook validates
  // too, but belt-and-suspenders here prevents a hard crash.
  const phases = Array.isArray(edited.phases) ? edited.phases : [];
  const totalMilestones = phases.reduce(
    (sum, p) => sum + (p.milestones?.length ?? 0),
    0,
  );
  const hasSchedule = !!edited.weekly_schedule;
  const scheduleTasks = edited.weekly_schedule?.tasks || [];

  // Group schedule tasks by day
  const tasksByDay = new Map<number, typeof scheduleTasks>();
  for (const task of scheduleTasks) {
    const day = tasksByDay.get(task.day_of_week) || [];
    day.push(task);
    tasksByDay.set(task.day_of_week, day);
  }

  const summaryParts: string[] = [t("phasesCount", { count: phases.length })];
  if (totalMilestones > 0)
    summaryParts.push(t("milestonesCount", { count: totalMilestones }));
  if (hasSchedule) summaryParts.push(t("scheduledCount", { count: scheduleTasks.length }));

  // ----- Field-level setters. Each one returns a new plan with one slot
  // replaced; `setEdited` swaps it in. The setters intentionally accept
  // the new value as a string and parse only where needed so EditableText's
  // string interface drops in cleanly.
  const setGoalTitle = (next: string) =>
    setEdited((p) => ({ ...p, goal_title: next }));
  const setGoalDescription = (next: string) =>
    setEdited((p) => ({ ...p, goal_description: next }));
  const setPhaseField = (
    phaseIdx: number,
    field: "title" | "description",
    next: string,
  ) =>
    setEdited((p) => ({
      ...p,
      phases: p.phases.map((ph, i) =>
        i === phaseIdx ? { ...ph, [field]: next } : ph,
      ),
    }));
  const setPhaseWeeks = (phaseIdx: number, next: string) => {
    const parsed = parseInt(next, 10);
    if (!Number.isFinite(parsed) || parsed < 1) return;
    setEdited((p) => ({
      ...p,
      phases: p.phases.map((ph, i) =>
        i === phaseIdx ? { ...ph, estimated_weeks: parsed } : ph,
      ),
    }));
  };
  const setMilestoneTitle = (
    phaseIdx: number,
    mIdx: number,
    next: string,
  ) =>
    setEdited((p) => ({
      ...p,
      phases: p.phases.map((ph, i) =>
        i === phaseIdx
          ? {
              ...ph,
              milestones: (ph.milestones ?? []).map((m, j) =>
                j === mIdx ? { ...m, title: next } : m,
              ),
            }
          : ph,
      ),
    }));
  const setScheduleSummary = (next: string) =>
    setEdited((p) =>
      p.weekly_schedule
        ? { ...p, weekly_schedule: { ...p.weekly_schedule, ai_summary: next } }
        : p,
    );
  const setScheduleTask = (
    taskIdx: number,
    field: "title" | "time_slot",
    next: string,
  ) =>
    setEdited((p) =>
      p.weekly_schedule
        ? {
            ...p,
            weekly_schedule: {
              ...p.weekly_schedule,
              tasks: p.weekly_schedule.tasks.map((tk, i) =>
                i === taskIdx ? { ...tk, [field]: next } : tk,
              ),
            },
          }
        : p,
    );

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/25 backdrop-blur-sm" />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="bg-[#FFFFFF] rounded-2xl shadow-[0_0_48px_rgba(30,34,39,0.12)] w-full max-w-2xl max-h-[85vh] flex flex-col">
          {/* Header */}
          <div className="flex items-start justify-between px-6 pt-6 pb-4 border-b border-[#E7DED2]">
            <div className="min-w-0 flex-1 pr-3">
              <h2 className="text-xl font-semibold text-[#2B2B2B]">
                <EditableText
                  value={edited.goal_title}
                  onSave={setGoalTitle}
                  placeholder={t("goalTitlePlaceholder")}
                  className="text-xl font-semibold text-[#2B2B2B]"
                />
              </h2>
              <p className="text-sm text-[#6F6A64] mt-1">
                <EditableText
                  value={edited.goal_description}
                  onSave={setGoalDescription}
                  multiline
                  rows={2}
                  placeholder={t("goalDescriptionPlaceholder")}
                  emptyHint={t("goalDescriptionEmpty")}
                  className="text-sm text-[#6F6A64]"
                />
              </p>
              <p className="text-xs text-[#9B948B] mt-2">
                {summaryParts.join(" · ")}
              </p>
            </div>
            <button
              onClick={onEdit}
              className="p-1.5 rounded-md text-[#9B948B] hover:text-[#2B2B2B] hover:bg-[#F6F3EE] transition-colors shrink-0"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Inline-edit hint banner — first-time users won't know fields
              are editable until the modal hints at it. Reads as instruction
              (violet + medium weight) rather than decorative caption. */}
          <div className="flex items-center gap-2 px-6 py-3 text-sm font-medium text-[#7C2DE8] bg-[#F3ECFB] border-b border-[#E7D8FB]">
            <Pencil className="h-4 w-4 shrink-0" />
            <span>{t("editHint")}</span>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

            {/* Weekly Schedule (for short goals) */}
            {hasSchedule && edited.weekly_schedule && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <Calendar className="h-4 w-4 text-[#7C2DE8]" />
                  <h3 className="text-sm font-semibold text-[#2B2B2B]">{t("weeklyScheduleTitle")}</h3>
                </div>
                <p className="text-xs text-[#6F6A64] mb-3">
                  <EditableText
                    value={edited.weekly_schedule.ai_summary || ""}
                    onSave={setScheduleSummary}
                    multiline
                    rows={2}
                    placeholder={t("scheduleSummaryPlaceholder")}
                    emptyHint={t("scheduleSummaryEmpty")}
                    className="text-xs text-[#6F6A64]"
                  />
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {Array.from(tasksByDay.entries())
                    .sort(([a], [b]) => a - b)
                    .map(([dow, tasks]) => (
                      <div key={dow} className="rounded-lg border border-[#E7DED2] bg-white p-3">
                        <p className="text-xs font-semibold text-[#2B2B2B] mb-2">{tDays(DAY_NAME_KEYS[dow])}</p>
                        <div className="space-y-1.5">
                          {tasks.sort((a, b) => a.sort_order - b.sort_order).map((task) => {
                            // Find this task's index in the canonical
                            // edited.weekly_schedule!.tasks array so the
                            // setter mutates the right slot.
                            const taskIdx = edited.weekly_schedule!.tasks.indexOf(task);
                            return (
                              <div key={taskIdx} className="flex items-start gap-1.5">
                                <Clock className="h-3 w-3 text-[#9B948B] mt-0.5 shrink-0" />
                                <div className="min-w-0 flex-1">
                                  <p className="text-xs text-[#2B2B2B] leading-snug">
                                    <EditableText
                                      value={task.title}
                                      onSave={(next) =>
                                        setScheduleTask(taskIdx, "title", next)
                                      }
                                      placeholder={t("taskTitlePlaceholder")}
                                      className="text-xs text-[#2B2B2B]"
                                    />
                                  </p>
                                  <p className="text-[10px] text-[#9B948B]">
                                    <EditableText
                                      value={task.time_slot || ""}
                                      onSave={(next) =>
                                        setScheduleTask(taskIdx, "time_slot", next)
                                      }
                                      placeholder={t("taskTimeSlotPlaceholder")}
                                      emptyHint={t("taskTimeSlotEmpty")}
                                      className="text-[10px] text-[#9B948B]"
                                    />
                                  </p>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Phase tree (for long goals, or always shown) */}
            {!hasSchedule && (
              <div>
                <div className="space-y-0">
                  {phases.map((phase, phaseIdx) => (
                    <div key={phaseIdx} className="relative">
                      {phaseIdx < phases.length - 1 && (
                        <div className="absolute left-[15px] top-[32px] bottom-0 w-px bg-[#E7DED2]" />
                      )}

                      <div className="flex items-start gap-3 mb-1">
                        <div className="flex items-center justify-center shrink-0 w-8 h-8 rounded-lg bg-[#7C2DE8] text-white text-sm font-semibold">
                          {phaseIdx + 1}
                        </div>
                        <div className="pt-1 min-w-0 flex-1">
                          <p className="text-sm font-semibold text-[#2B2B2B]">
                            <EditableText
                              value={phase.title}
                              onSave={(next) =>
                                setPhaseField(phaseIdx, "title", next)
                              }
                              placeholder={t("phaseTitlePlaceholder")}
                              className="text-sm font-semibold text-[#2B2B2B]"
                            />
                          </p>
                          <p className="text-xs text-[#6F6A64] mt-0.5">
                            <EditableText
                              value={phase.description || ""}
                              onSave={(next) =>
                                setPhaseField(phaseIdx, "description", next)
                              }
                              multiline
                              rows={2}
                              placeholder={t("phaseDescriptionPlaceholder")}
                              emptyHint={t("phaseDescriptionEmpty")}
                              className="text-xs text-[#6F6A64]"
                            />
                          </p>
                          <span className="inline-block text-[11px] text-[#9B948B] mt-1">
                            <EditableText
                              value={String(phase.estimated_weeks)}
                              onSave={(next) => setPhaseWeeks(phaseIdx, next)}
                              placeholder="1"
                              className="text-[11px] text-[#9B948B]"
                            />{" "}
                            {t("weeksSuffix")}
                          </span>
                        </div>
                      </div>

                      <div className="ml-[15px] pl-6 border-l border-[#E7DED2] mb-5">
                        {(phase.milestones ?? []).map((m, mIdx) => (
                          <div
                            key={mIdx}
                            className="flex items-start gap-2.5 py-1.5"
                          >
                            <Flag className="h-3.5 w-3.5 shrink-0 text-[#7C2DE8] mt-0.5" />
                            <span className="text-sm text-[#2B2B2B] min-w-0 flex-1">
                              <EditableText
                                value={m.title}
                                onSave={(next) =>
                                  setMilestoneTitle(phaseIdx, mIdx, next)
                                }
                                placeholder={t("milestonePlaceholder")}
                                className="text-sm text-[#2B2B2B]"
                              />
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-[#E7DED2]">
            {error && (
              <p className="text-sm text-[#D5847A]">{error}</p>
            )}
            {!error && <div />}
            <div className="flex items-center gap-3">
            <button
              onClick={onEdit}
              disabled={isSaving}
              className="px-4 py-2.5 text-sm font-medium text-[#6F6A64] hover:text-[#2B2B2B] hover:bg-[#F6F3EE] rounded-lg transition-colors disabled:opacity-50"
            >
              {t("continueEditing")}
            </button>
            <button
              onClick={() => onConfirm(edited)}
              disabled={isSaving}
              className="flex items-center gap-2 bg-[#7C2DE8] text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-[#6921C7] active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              {isSaving ? t("creating") : t("confirm")}
            </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
