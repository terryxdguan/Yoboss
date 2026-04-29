"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Send, X } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  useGoalSession,
  type UseGoalSessionInitialDraft,
} from "@/lib/hooks/use-goal-session";
import { ChatMessage } from "./chat-message";
import { RoadmapPreview } from "./roadmap-preview";
import { PlanPreviewModal } from "./plan-preview-modal";
import { GoalDraftList } from "./goal-draft-list";
import { GoalInput } from "@/components/landing/goal-input";
import { ExampleGoals } from "@/components/landing/example-goals";
import {
  createDailyTasks,
  createWeeklyPlan,
  getOrCreateGoalSession,
} from "@/lib/db/actions";
import { getTodayDayOfWeek, getWeekStart } from "@/lib/utils/date";

// ---------------------------------------------------------------
// Shared slide-out chrome — resize handle + close button + header.
// Mirrors GoalChatPanel styling so both right-side panels feel
// the same to users.
// ---------------------------------------------------------------

function useResize(initial: number, min: number, max: number) {
  const [width, setWidth] = useState(initial);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startW = useRef(0);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      dragging.current = true;
      startX.current = e.clientX;
      startW.current = width;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      const onMouseMove = (ev: MouseEvent) => {
        if (!dragging.current) return;
        const delta = startX.current - ev.clientX;
        setWidth(Math.min(max, Math.max(min, startW.current + delta)));
      };
      const onMouseUp = () => {
        dragging.current = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    },
    [width, min, max],
  );

  return { width, onMouseDown };
}

// ---------------------------------------------------------------
// Props
// ---------------------------------------------------------------

interface CommonProps {
  onClose: () => void;
}

interface GoalCreationProps extends CommonProps {
  intent: "goal-creation";
  /** Pre-fills the input (or auto-starts chat when `autoStart` is true).
   *  Set from the landing-page handoff when a logged-out visitor typed a
   *  goal before signing in. */
  initialGoalText?: string;
  /** Skip the landing view and immediately kick off chat with
   *  `initialGoalText` as the opening user message. Used by the pending-goal
   *  handoff so the user doesn't re-click Submit after signing in. */
  autoStart?: boolean;
  /** Called with the new goal's id once confirmPlan writes to DB. Host
   *  typically navigates to /goals/{id}. */
  onGoalCreated: (goalId: string) => void;
}

interface WeeklyPlanningProps extends CommonProps {
  intent: "weekly-planning";
  goalId: string;
  goal: { title: string; description: string };
  phase: {
    id: string;
    title: string;
    description: string;
    estimatedWeeks: number;
  };
  /** Milestones for the CURRENT phase. The AI uses them as the "what
   *  must this week advance toward" anchor. Empty list is fine for legacy
   *  goals created before milestones existed. */
  phaseMilestones: string[];
  /** All phases of the goal (in order) — gives the AI the full roadmap
   *  for context-aware pacing decisions. */
  roadmap: {
    title: string;
    description: string;
    estimated_weeks: number;
  }[];
  /** Called once the weekly_plan + daily_tasks rows are written. Host
   *  typically calls router.refresh() and closes the panel. */
  onWeeklyPlanSaved: () => void;
}

type GoalWizardPanelProps = GoalCreationProps | WeeklyPlanningProps;

// ---------------------------------------------------------------
// Entry component
// ---------------------------------------------------------------

export function GoalWizardPanel(props: GoalWizardPanelProps) {
  const t = useTranslations("goals.wizard");
  // Default to the max width so the panel feels generous on first open;
  // the user can still drag the handle leftward to anything ≥ 360.
  const { width, onMouseDown } = useResize(720, 360, 720);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [props]);

  return (
    <div
      className="fixed right-0 top-16 bottom-0 z-[45] border-l border-[#E7DED2] bg-[#F6F3EE] flex flex-col shadow-[0_0_48px_rgba(30,34,39,0.08)]"
      style={{ width }}
    >
      <div
        onMouseDown={onMouseDown}
        className="absolute left-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-[#007AFF]/20 active:bg-[#007AFF]/30 transition-colors z-10"
      />
      <div className="flex items-center justify-between h-14 px-4 border-b border-[#E7DED2]">
        <h2 className="text-sm font-semibold text-[#2B2B2B]">
          {props.intent === "goal-creation"
            ? t("headerCreate")
            : t("headerWeekly")}
        </h2>
        <button
          onClick={props.onClose}
          className="p-1.5 rounded-md text-[#6F6A64] hover:bg-[#F1ECE4] hover:text-[#2B2B2B] transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {props.intent === "goal-creation" ? (
        <GoalCreationBody {...props} />
      ) : (
        <WeeklyPlanningBody {...props} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------
// Goal creation body
//
// Two sub-states:
//   - "landing" — big input + draft list + examples (matches the old
//     /goals/create page hero)
//   - "chatting" — conversation powered by useGoalSession
//
// When the host passes `autoStart` (pending-goal handoff), we skip the
// landing view and go straight into "chatting".
// ---------------------------------------------------------------

function GoalCreationBody({
  initialGoalText,
  autoStart,
  onGoalCreated,
}: GoalCreationProps) {
  const t = useTranslations("goals.wizard");
  const [goalText, setGoalText] = useState(initialGoalText ?? "");
  const [submittedGoal, setSubmittedGoal] = useState(
    autoStart && initialGoalText ? initialGoalText : "",
  );
  const [resumeDraft, setResumeDraft] =
    useState<UseGoalSessionInitialDraft | null>(null);
  const [chatActive, setChatActive] = useState(Boolean(autoStart && initialGoalText));
  const [draftListRefresh, setDraftListRefresh] = useState(0);

  const startFresh = (text: string) => {
    setSubmittedGoal(text);
    setResumeDraft(null);
    setChatActive(true);
  };

  const resume = (draft: UseGoalSessionInitialDraft) => {
    setResumeDraft(draft);
    setSubmittedGoal("");
    setChatActive(true);
  };

  const backToLanding = () => {
    setChatActive(false);
    setSubmittedGoal("");
    setGoalText("");
    setResumeDraft(null);
    // Re-fetch draft list so a confirmed/cancelled draft disappears.
    setDraftListRefresh((n) => n + 1);
  };

  if (!chatActive) {
    return (
      <div className="flex-1 overflow-y-auto px-5 py-6">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-[#2B2B2B]">
            {t("landingTitle")}
          </h3>
          <p className="text-xs text-[#6F6A64] mt-1">
            {t("landingSubtitle")}
          </p>
        </div>
        <GoalDraftList onResume={resume} refreshKey={draftListRefresh} />
        <GoalInput
          value={goalText}
          onChange={setGoalText}
          onSubmit={startFresh}
        />
        <div className="mt-3">
          <ExampleGoals onSelect={setGoalText} compact />
        </div>
      </div>
    );
  }

  return (
    <GoalCreationChat
      initialGoal={submittedGoal}
      initialDraft={resumeDraft}
      onBack={backToLanding}
      onCreated={onGoalCreated}
    />
  );
}

function GoalCreationChat({
  initialGoal,
  initialDraft,
  onBack,
  onCreated,
}: {
  initialGoal: string;
  initialDraft: UseGoalSessionInitialDraft | null;
  onBack: () => void;
  onCreated: (goalId: string) => void;
}) {
  const {
    messages,
    stage,
    isStreaming,
    plan,
    error,
    startChat,
    sendMessage,
    answerQuestion,
    confirmPlan,
    editPlan,
  } = useGoalSession({ initialDraft });

  const t = useTranslations("goals.wizard");
  const [inputText, setInputText] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const started = useRef(false);
  const lastGoalIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (initialDraft) {
      started.current = true;
      return;
    }
    if (!started.current) {
      started.current = true;
      startChat(initialGoal);
    }
  }, [initialDraft, initialGoal, startChat]);

  useEffect(() => {
    if (scrollRef.current)
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isStreaming]);

  useEffect(() => {
    if (stage === "done" && lastGoalIdRef.current) {
      onCreated(lastGoalIdRef.current);
    }
  }, [stage, onCreated]);

  const handleSend = () => {
    if (!inputText.trim() || isStreaming) return;
    sendMessage(inputText.trim());
    setInputText("");
    inputRef.current?.focus();
  };

  const handleConfirm = async () => {
    const goalId = await confirmPlan();
    if (goalId) lastGoalIdRef.current = goalId;
  };

  return (
    <>
      <div className="border-b border-[#E7DED2] px-4 py-2">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-xs text-[#6F6A64] hover:text-[#2B2B2B] transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("back")}
        </button>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
      >
        {messages.map((msg, idx) => (
          <ChatMessage
            key={msg.id}
            message={msg}
            onAnswer={answerQuestion}
            isStreaming={
              isStreaming && idx === messages.length - 1 && msg.role === "assistant"
            }
          />
        ))}
        {error && (
          <div className="bg-[#D5847A]/5 border border-[#D5847A]/20 rounded-lg px-4 py-2 text-xs text-[#D5847A]">
            {error}
          </div>
        )}
      </div>

      <div className="border-t border-[#E7DED2] px-4 py-3">
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={t("messagePlaceholder")}
            disabled={isStreaming}
            className="flex-1 border border-[#DDD3C7] rounded-lg px-3 py-2 text-sm text-[#2B2B2B] placeholder:text-[#9B948B] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/40 focus:border-transparent bg-[#FFFDF9] disabled:opacity-50"
          />
          <button
            onClick={handleSend}
            disabled={!inputText.trim() || isStreaming}
            className="h-9 w-9 flex items-center justify-center rounded-lg bg-[#007AFF] text-white hover:bg-[#0066D6] active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>

      {(stage === "preview" || stage === "saving") && plan && (
        <RoadmapPreview
          plan={plan}
          onConfirm={handleConfirm}
          onEdit={editPlan}
          isSaving={stage === "saving"}
          error={error}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------
// Weekly planning body
//
// Always starts with a clean slate — the unified session keeps prior
// goal-creation + weekly attempts, but we don't want to render them.
// We pass an empty rebuilt history while keeping the sessionId so new
// messages persist to the same DB row. Kickoff fires once on mount.
// ---------------------------------------------------------------

function WeeklyPlanningBody({
  goalId,
  goal,
  phase,
  phaseMilestones,
  roadmap,
  onWeeklyPlanSaved,
}: WeeklyPlanningProps) {
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const todayDow = getTodayDayOfWeek();
  const weekStart = getWeekStart();

  // Fetch (or lazy-create) the unified goal session server-side. The
  // panel needs its id to persist chat messages.
  useEffect(() => {
    let cancelled = false;
    getOrCreateGoalSession(goalId)
      .then((s) => {
        if (!cancelled) setSessionId(s.id);
      })
      .catch((err) => {
        if (!cancelled) {
          console.error("[goal-wizard] getOrCreateGoalSession failed:", err);
          setSaveError(
            err instanceof Error ? err.message : "Failed to open session",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [goalId]);

  if (!sessionId) {
    return <WeeklyPlanningLoading saveError={saveError} />;
  }

  return (
    <WeeklyPlanningChat
      sessionId={sessionId}
      goal={goal}
      phase={phase}
      phaseMilestones={phaseMilestones}
      roadmap={roadmap}
      weekStart={weekStart}
      todayDow={todayDow}
      isSaving={isSaving}
      setIsSaving={setIsSaving}
      saveError={saveError}
      setSaveError={setSaveError}
      onSaved={() => {
        router.refresh();
        onWeeklyPlanSaved();
      }}
    />
  );
}

function SaveFailedToast({ error }: { error: string }) {
  const t = useTranslations("goals.wizard");
  return (
    <div className="absolute bottom-4 right-4 left-4 z-[70] rounded-xl border border-[#E5A79D] bg-[#FFF4F1] px-4 py-3 shadow-[0_12px_32px_rgba(30,34,39,0.12)]">
      <p className="text-sm font-medium text-[#A8503F]">{t("saveFailed")}</p>
      <p className="text-xs text-[#6F6A64] mt-1">{error}</p>
    </div>
  );
}

function WeeklyPlanningLoading({ saveError }: { saveError: string | null }) {
  const t = useTranslations("goals.wizard");
  return (
    <div className="flex-1 flex items-center justify-center text-sm text-[#9B948B]">
      {saveError ? saveError : t("loadingSession")}
    </div>
  );
}

function WeeklyPlanningChat({
  sessionId,
  goal,
  phase,
  phaseMilestones,
  roadmap,
  weekStart,
  todayDow,
  isSaving,
  setIsSaving,
  saveError,
  setSaveError,
  onSaved,
}: {
  sessionId: string;
  goal: { title: string; description: string };
  phase: { id: string; title: string; description: string; estimatedWeeks: number };
  phaseMilestones: string[];
  roadmap: { title: string; description: string; estimated_weeks: number }[];
  weekStart: string;
  todayDow: number;
  isSaving: boolean;
  setIsSaving: (v: boolean) => void;
  saveError: string | null;
  setSaveError: (v: string | null) => void;
  onSaved: () => void;
}) {
  const sessionHook = useGoalSession({
    initialDraft: {
      sessionId,
      rebuilt: {
        uiMessages: [],
        apiMessages: [],
        latestGoalPlan: null,
        latestWeeklyPlan: null,
        latestToolUseId: null,
        lastAssistantInterrupted: false,
      },
      sessionSummary: null,
    },
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
      phaseMilestones,
      roadmap,
    },
  });

  const kickedOffRef = useRef(false);
  useEffect(() => {
    if (kickedOffRef.current) return;
    if (sessionHook.isStreaming) return;
    if (sessionHook.messages.length > 0) return;
    kickedOffRef.current = true;
    sessionHook.sendMessage("Let's plan this week.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionHook.isStreaming]);

  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current)
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [sessionHook.messages, sessionHook.isStreaming]);

  const handleConfirm = async () => {
    if (!sessionHook.weeklyPreview) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const created = await createWeeklyPlan({
        phase_id: phase.id,
        week_start: weekStart,
        ai_summary: sessionHook.weeklyPreview.ai_summary,
      });
      // Defense-in-depth: the chat prompt already tells the model to plan
      // only from today onward, but a non-zero portion of generations still
      // emit past-day tasks. Drop them so the user never sees stale rows.
      const futureTasks = sessionHook.weeklyPreview.tasks.filter(
        (t) => t.day_of_week >= todayDow,
      );
      if (futureTasks.length === 0) {
        throw new Error(
          "Saved plan but every generated task fell on a past day — try regenerating.",
        );
      }
      const inserted = await createDailyTasks(
        created.id,
        futureTasks.map((t) => ({
          day_of_week: t.day_of_week,
          title: t.title,
          description: t.description,
          time_estimate_minutes: t.time_estimate_minutes,
          time_slot: t.time_slot,
          sort_order: t.sort_order,
        })),
      );
      if (!inserted || inserted.length === 0) {
        throw new Error(
          "Saved plan but no daily tasks were persisted (empty insert response).",
        );
      }
      onSaved();
    } catch (err) {
      console.error("[goal-wizard] save weekly plan failed:", err);
      setSaveError(
        err instanceof Error ? err.message : "Failed to save the weekly plan.",
      );
      setIsSaving(false);
    }
  };

  return (
    <>
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
      >
        {sessionHook.messages.map((m, i) => (
          <ChatMessage
            key={m.id}
            message={m}
            onAnswer={sessionHook.answerQuestion}
            isStreaming={
              sessionHook.isStreaming && i === sessionHook.messages.length - 1
            }
          />
        ))}
        {sessionHook.error && (
          <div className="bg-[#D5847A]/5 border border-[#D5847A]/20 rounded-lg px-4 py-2 text-xs text-[#D5847A]">
            {sessionHook.error}
          </div>
        )}
      </div>

      {sessionHook.weeklyPreview && (
        <PlanPreviewModal
          plan={sessionHook.weeklyPreview}
          onConfirm={handleConfirm}
          onEdit={sessionHook.requestEdit}
          isSaving={isSaving}
        />
      )}

      {saveError && <SaveFailedToast error={saveError} />}
    </>
  );
}
