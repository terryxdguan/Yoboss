"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { GoalInput } from "@/components/landing/goal-input";
import { ExampleGoals } from "@/components/landing/example-goals";
import { GoalChat } from "@/components/goals/goal-chat";
import { GoalDraftList } from "@/components/goals/goal-draft-list";
import type { UseGoalSessionInitialDraft } from "@/lib/hooks/use-goal-session";
import { getPendingGoal, clearPendingGoal } from "@/lib/pending-goal";

export default function CreateGoalPage() {
  const router = useRouter();
  const [goalText, setGoalText] = useState("");
  const [chatActive, setChatActive] = useState(false);
  const [submittedGoal, setSubmittedGoal] = useState("");
  // When the user resumes a draft from the list we hand this to GoalChat.
  // Non-null means "resume mode"; GoalChat will skip startChat and rehydrate
  // from the persisted messages instead.
  const [resumeDraft, setResumeDraft] =
    useState<UseGoalSessionInitialDraft | null>(null);
  // Bumped on chat exit so GoalDraftList re-fetches and reflects the new
  // state (a just-confirmed or deleted draft should drop off the list).
  const [draftListRefresh, setDraftListRefresh] = useState(0);

  // One-shot handoff from the marketing landing page: if the visitor
  // typed a goal before signing in, the pending-goal helper holds it
  // (cookie + sessionStorage so it survives the email round-trip).
  // Read + clear on first render so the input below renders pre-filled.
  useEffect(() => {
    const pending = getPendingGoal();
    if (pending) {
      setGoalText(pending);
      clearPendingGoal();
    }
  }, []);

  const handleSubmitGoal = (text: string) => {
    setSubmittedGoal(text);
    setResumeDraft(null);
    setChatActive(true);
  };

  const handleResumeDraft = (draft: UseGoalSessionInitialDraft) => {
    setResumeDraft(draft);
    // initialGoal is unused in resume mode but we clear it so the
    // component's initialGoal prop doesn't carry stale state from a
    // previous fresh-chat attempt.
    setSubmittedGoal("");
    setChatActive(true);
  };

  const handleCancel = () => {
    setChatActive(false);
    setSubmittedGoal("");
    setGoalText("");
    setResumeDraft(null);
    // Re-fetch in case the chat produced or touched a draft — even
    // cancelling leaves a draft row behind (we don't auto-delete on
    // cancel; the user can dismiss from the list).
    setDraftListRefresh((n) => n + 1);
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-full px-6 py-6">
        {/* Back button */}
        <button
          onClick={() => router.push("/goals")}
          className="flex items-center gap-1.5 text-sm text-[#9B948B] hover:text-[#2B2B2B] transition-colors mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Goals
        </button>

        {chatActive ? (
          <GoalChat
            initialGoal={submittedGoal}
            onCancel={handleCancel}
            initialDraft={resumeDraft}
          />
        ) : (
          <section className="max-w-3xl mx-auto text-center">
            <div className="overflow-hidden h-[140px] md:h-[170px] mb-2">
              <img
                src="/goal_planner.png"
                alt="YoBoss — Goal Planner"
                className="mx-auto max-w-xs w-full h-auto object-cover object-center"
              />
            </div>

            <h1 className="text-xl md:text-2xl font-semibold text-[#2B2B2B] mb-1">
              What&apos;s the next thing you want to do?
            </h1>
            <p className="text-xs text-[#6F6A64] mb-4">
              Describe your goal and we&apos;ll help you create an actionable plan
            </p>

            <GoalDraftList
              onResume={handleResumeDraft}
              refreshKey={draftListRefresh}
            />

            <GoalInput
              value={goalText}
              onChange={setGoalText}
              onSubmit={handleSubmitGoal}
            />

            <div className="mt-3">
              <ExampleGoals onSelect={(text) => setGoalText(text)} compact />
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
