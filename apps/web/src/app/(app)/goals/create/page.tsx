"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { GoalInput } from "@/components/landing/goal-input";
import { ExampleGoals } from "@/components/landing/example-goals";
import { GoalChat } from "@/components/goals/goal-chat";

export default function CreateGoalPage() {
  const router = useRouter();
  const [goalText, setGoalText] = useState("");
  const [chatActive, setChatActive] = useState(false);
  const [submittedGoal, setSubmittedGoal] = useState("");

  const handleSubmitGoal = (text: string) => {
    setSubmittedGoal(text);
    setChatActive(true);
  };

  const handleCancel = () => {
    setChatActive(false);
    setSubmittedGoal("");
    setGoalText("");
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
          <GoalChat initialGoal={submittedGoal} onCancel={handleCancel} />
        ) : (
          <section className="max-w-3xl mx-auto text-center">
            <div className="overflow-hidden h-[140px] md:h-[170px] mb-2">
              <img
                src="/Goal_Planner.PNG"
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
