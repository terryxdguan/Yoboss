"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  FileText,
  MessageSquare,
} from "lucide-react";
import type { DashboardOnboarding } from "@/lib/db/actions";
import { setPendingGoal } from "@/lib/pending-goal";
import { EXAMPLES as GOAL_EXAMPLES } from "@/components/landing/example-goals";

// Marker that survives a navigation to /todos and back. The celebration
// modal on the regular dashboard reads it to know whether to fire (i.e.
// "user just finished onboarding" vs "user has been done for a while").
export const ONBOARDING_ACTIVE_KEY = "yoboss-onboarding-active";

type StepId = "roadmap" | "weekly-plan" | "todo-item";

const GOAL_PLACEHOLDER = "How to lose 30 lbs (13.6 kg) in 6 months";

const employeeModes = [
  {
    icon: MessageSquare,
    label: "Strategist",
    description: "Clarifies fuzzy goals and turns them into a concrete plan.",
    items: [
      "Asks the right questions and surfaces constraints.",
      "Breaks goals into phases, tasks, and next actions.",
    ],
  },
  {
    icon: FileText,
    label: "Doer",
    description: "Takes over once the task is clear.",
    items: [
      "Drafts research briefs, files, and handoffs.",
      "Runs code and orchestrates multi-step workflows.",
    ],
  },
];

interface OnboardingDashboardProps {
  onboarding: DashboardOnboarding;
}

export function OnboardingDashboard({ onboarding }: OnboardingDashboardProps) {
  const router = useRouter();
  const [goalText, setGoalText] = useState("");

  // Each step's done state is derived from its own count so the user can
  // complete steps in any order (e.g. add a personal to-do first, before
  // creating a goal — Step 3 should still light up). The sequential
  // `stage` field is only used to gate Step 2's "Locked" UI (since you
  // can't generate a weekly plan without a goal).
  const step1Done = onboarding.goalCount > 0;
  const step2Done = onboarding.weeklyPlanCount > 0;
  const step3Done = onboarding.personalTodoCount > 0;

  // Mark "currently in onboarding" so the regular dashboard's celebration
  // modal knows to fire when stage flips to "done" on the next visit.
  useEffect(() => {
    try {
      window.sessionStorage.setItem(ONBOARDING_ACTIVE_KEY, "1");
    } catch {
      // sessionStorage unavailable (private mode etc.) — celebration
      // simply won't fire; not a real failure.
    }
  }, []);

  const handleStep1 = () => {
    const text = goalText.trim();
    if (text) setPendingGoal(text);
    router.push("/goals");
  };

  const handleStep2 = () => {
    if (!step1Done) return;
    if (onboarding.singleGoalId) {
      router.push(`/goals/${onboarding.singleGoalId}`);
    } else {
      router.push("/goals");
    }
  };

  const handleStep3 = () => router.push("/todos");

  const handleGoalKeyDown = (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    // Tab: autofill placeholder when empty (mirrors landing page).
    if (e.key === "Tab" && !goalText.trim()) {
      e.preventDefault();
      setGoalText(GOAL_PLACEHOLDER);
      return;
    }
    // Enter (no shift): submit.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleStep1();
    }
  };

  const steps: Array<{
    id: StepId;
    label: string;
    tag: string;
    title: string;
    detailPending: string;
    detailDone: string;
    actionPending: string;
    actionDone: string;
    done: boolean;
    locked: boolean;
    onClick: () => void;
  }> = [
    {
      id: "roadmap",
      label: "Step 1",
      tag: "Goal",
      title: "Create your first goal roadmap",
      detailPending:
        "Start from a goal and let your team turn it into a roadmap.",
      detailDone: "Roadmap created — open the goal to refine it any time.",
      actionPending: "Start",
      actionDone: "Review",
      done: step1Done,
      locked: false,
      onClick: handleStep1,
    },
    {
      id: "weekly-plan",
      label: "Step 2",
      tag: "Plan",
      title: "Create your first weekly plan",
      detailPending: step1Done
        ? "Open your goal and generate a weekly plan."
        : "Requires your first roadmap.",
      detailDone: "Weekly plan ready — daily tasks have been generated.",
      actionPending: step1Done ? "Open" : "Locked",
      actionDone: "Review",
      done: step2Done,
      locked: !step1Done,
      onClick: handleStep2,
    },
    {
      id: "todo-item",
      label: "Step 3",
      tag: "To-Do",
      title: "Create your first personal to-do",
      detailPending: "Open the To-Dos page and add one personal task.",
      detailDone: "Personal to-do added.",
      actionPending: "Open To-Dos",
      actionDone: "Review",
      done: step3Done,
      locked: false,
      onClick: handleStep3,
    },
  ];

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_380px]">
        {/* Left column */}
        <div className="space-y-5">
          {/* Recommended first action — hidden once Step 1 is done */}
          {step1Done ? null : (
            <section className="relative">
              <div
                aria-hidden
                className="pointer-events-none absolute -inset-1 animate-glow-pulse rounded-2xl bg-[#7FAEE6] opacity-50 blur-xl"
              />

              <div className="relative rounded-2xl border-2 border-[#7FAEE6] bg-[#FFFDF9] p-5 shadow-[0_8px_28px_rgba(127,174,230,0.18)]">
              {/* Top row: copy on the left, planner illustration on the right.
                  Image container is wider than tall (2:1) and uses object-cover
                  to crop the whitespace baked into the PNG so the figure sits
                  flush with the heading block. */}
              <div className="mb-4 flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h2 className="text-2xl font-semibold leading-tight text-[#2B2B2B] md:text-3xl">
                    Welcome. Start with one goal you want to do
                  </h2>
                  <p className="mt-1.5 text-sm text-[#6F6A64] md:text-base">
                    Describe your goal and we&apos;ll help you create an actionable plan
                  </p>
                </div>
                <div className="hidden h-24 w-48 shrink-0 overflow-hidden md:block lg:h-28 lg:w-56">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/goal_planner.png"
                    alt=""
                    aria-hidden
                    className="h-full w-full select-none object-cover object-center"
                  />
                </div>
              </div>

              {/* Unified input: textarea + Tab hint + submit feel like one block */}
              <div className="rounded-xl border border-[#DDD3C7] bg-[#F6F3EE] p-3">
                <textarea
                  aria-label="Your goal"
                  value={goalText}
                  onChange={(e) => setGoalText(e.target.value)}
                  onKeyDown={handleGoalKeyDown}
                  placeholder={GOAL_PLACEHOLDER}
                  className="min-h-[72px] w-full resize-none bg-transparent px-2 py-1.5 text-base text-[#2B2B2B] outline-none placeholder:text-[#9B948B]"
                />
                <div className="flex items-center justify-between gap-3 px-1 pt-1">
                  <span className="text-xs text-[#9B948B]">
                    Press{" "}
                    <kbd className="rounded border border-[#E7DED2] bg-[#F1ECE4] px-1.5 py-0.5 text-[10px] font-medium text-[#6F6A64]">
                      Tab
                    </kbd>{" "}
                    to autofill the example text
                  </span>
                  <button
                    onClick={handleStep1}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-[#7FAEE6] px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#6A9DDA]"
                  >
                    Create roadmap
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* 6 starter chips — click fills textarea with the full prompt */}
              <div className="mt-3 flex flex-wrap gap-2">
                {GOAL_EXAMPLES.map((ex) => (
                  <button
                    key={ex.title}
                    type="button"
                    onClick={() => setGoalText(ex.text)}
                    className="rounded-full border border-[#E7DED2] bg-[#FFFDF9] px-3 py-1 text-xs text-[#6F6A64] transition-colors hover:border-[#9FC3EF] hover:bg-[#F8FBFF] hover:text-[#2B2B2B]"
                  >
                    {ex.title}
                  </button>
                ))}
              </div>
            </div>
          </section>
          )}

          {/* Today's next steps */}
          <section className="rounded-lg border border-[#E7DED2] bg-[#FFFDF9] p-5">
            <div className="mb-4">
              <div className="mb-2 inline-flex rounded-full bg-[#EAF3FD] px-2.5 py-1 text-[11px] font-semibold text-[#5E8FCE]">
                3-step setup
              </div>
              <h2 className="text-base font-semibold text-[#2B2B2B]">
                Today&apos;s next steps
              </h2>
              <p className="mt-1 text-sm text-[#6F6A64]">
                Each step opens the real workflow. Status updates
                automatically once the step is complete.
              </p>
            </div>

            <div className="space-y-2">
              {steps.map((step) => {
                const detail = step.done ? step.detailDone : step.detailPending;
                const action = step.done ? step.actionDone : step.actionPending;
                return (
                  <div
                    key={step.id}
                    className={`flex items-center gap-3 rounded-lg border px-3 py-3 transition-colors ${
                      step.locked
                        ? "border-[#E7DED2] bg-[#F8F5EF] opacity-70"
                        : "border-[#E7DED2] bg-[#FFFDF9] hover:border-[#9FC3EF] hover:bg-[#F8FBFF]"
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                        step.done
                          ? "border-[#6EAF79] bg-[#6EAF79] text-white"
                          : "border-[#DDD3C7] bg-white"
                      }`}
                    >
                      {step.done && <CheckCircle2 className="h-3.5 w-3.5" />}
                    </span>

                    <button
                      onClick={step.onClick}
                      disabled={step.locked}
                      className="group min-w-0 flex-1 text-left disabled:cursor-not-allowed"
                    >
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[11px] font-semibold text-[#7FAEE6]">
                              {step.label}
                            </span>
                            <span className="rounded bg-[#F1ECE4] px-1.5 py-0.5 text-[10px] text-[#6F6A64]">
                              {step.locked ? "Locked" : step.tag}
                            </span>
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                step.done
                                  ? "bg-[#E6F2E8] text-[#3F7C4A]"
                                  : "bg-[#FBF1E5] text-[#A77F3D]"
                              }`}
                            >
                              {step.done ? "Done" : "Pending"}
                            </span>
                          </div>
                          <p
                            className={`mt-0.5 truncate text-sm font-medium ${
                              step.done
                                ? "text-[#8A8177] line-through"
                                : "text-[#2B2B2B]"
                            }`}
                          >
                            {step.title}
                          </p>
                          <p className="mt-0.5 text-xs leading-relaxed text-[#9B948B]">
                            {detail}
                          </p>
                        </div>
                        <span
                          className={`inline-flex shrink-0 items-center justify-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold ${
                            step.locked
                              ? "bg-[#EDE8E1] text-[#9B948B]"
                              : "bg-[#EAF3FD] text-[#5E8FCE] group-hover:bg-[#DCEEFF]"
                          }`}
                        >
                          {action}
                          {!step.locked && (
                            <ArrowRight className="h-3.5 w-3.5" />
                          )}
                        </span>
                      </div>
                    </button>
                    <ChevronRight
                      className={`hidden h-4 w-4 md:block ${
                        step.locked ? "text-[#DDD3C7]" : "text-[#CFC3B5]"
                      }`}
                    />
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* Right column — Employee */}
        <aside className="space-y-5">
          <section className="rounded-lg border border-[#E7DED2] bg-[#FFFDF9] p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-[#F4C7C3]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/pink.png"
                    alt=""
                    aria-hidden
                    className="h-full w-full select-none object-cover"
                  />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-[#2B2B2B]">
                    Employee
                  </h2>
                  <p className="text-xs text-[#9B948B]">
                    A teammate for planning and execution.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => window.dispatchEvent(new Event("yoboss:open-chat"))}
                className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-[#CFC3B5] bg-[#FFFDF9] px-3 py-1.5 text-xs font-semibold text-[#6F6A64] hover:bg-[#F1ECE4]"
              >
                Ask Team
                <MessageSquare className="h-3.5 w-3.5" />
              </button>
            </div>

            <p className="mb-4 text-sm leading-relaxed text-[#6F6A64]">
              Use it first to think through unclear goals, then hand over
              concrete work that needs output, research, or automation.
            </p>

            <div className="space-y-3">
              {employeeModes.map((mode) => {
                const Icon = mode.icon;
                return (
                  <div
                    key={mode.label}
                    className="rounded-lg border border-[#E7DED2] bg-[#F6F3EE] p-3"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#EAF3FD] text-[#7FAEE6]">
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-[#2B2B2B]">
                          {mode.label}
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-[#6F6A64]">
                          {mode.description}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 space-y-2">
                      {mode.items.map((item) => (
                        <div key={item} className="flex items-start gap-2">
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#6EAF79]" />
                          <p className="text-xs leading-relaxed text-[#6F6A64]">
                            {item}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </aside>
      </div>

    </div>
  );
}
