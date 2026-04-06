"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, Flag, ChevronRight } from "lucide-react";
import { GoalInput } from "@/components/landing/goal-input";
import { ExampleGoals } from "@/components/landing/example-goals";
import { GoalChat } from "@/components/goals/goal-chat";
import { createClient } from "@/lib/db/client";
import type { Goal } from "@/lib/types/database";

export default function GoalsPage() {
  const router = useRouter();
  const [goalText, setGoalText] = useState("");
  const [chatActive, setChatActive] = useState(false);
  const [submittedGoal, setSubmittedGoal] = useState("");
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  // Fetch existing goals
  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("goals")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setGoals(data || []);
        setLoading(false);
      });
  }, []);

  const handleSubmitGoal = (text: string) => {
    setSubmittedGoal(text);
    setChatActive(true);
    setShowCreate(false);
  };

  const handleCancel = () => {
    setChatActive(false);
    setSubmittedGoal("");
    setGoalText("");
    setShowCreate(false);
  };

  // Chat view (goal creation flow)
  if (chatActive) {
    return (
      <GoalChat initialGoal={submittedGoal} onCancel={handleCancel} />
    );
  }

  // Loading
  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-sm text-[#8C939B]">Loading...</div>
      </div>
    );
  }

  // Create view (no goals yet, or user clicked "New Goal")
  if (goals.length === 0 || showCreate) {
    return (
      <div>
        {goals.length > 0 && (
          <button
            onClick={() => setShowCreate(false)}
            className="text-sm text-[#626A73] hover:text-[#1E2227] mb-4 flex items-center gap-1"
          >
            ← Back to Goals
          </button>
        )}
        <section className="max-w-4xl mx-auto text-center">
          <div className="overflow-hidden max-h-[280px] md:max-h-[340px]">
            <img
              src="/Goal_Planner.PNG"
              alt="YoBoss — Goal Planner"
              className="mx-auto max-w-2xl w-full h-auto object-cover object-top"
            />
          </div>

          <p className="text-xl md:text-2xl text-[#1E2227] mb-4 max-w-4xl mx-auto whitespace-nowrap">
            Describe your goal and your digital employees plan &amp; execute
          </p>

          <GoalInput
            value={goalText}
            onChange={setGoalText}
            onSubmit={handleSubmitGoal}
          />

          <ExampleGoals onSelect={(text) => setGoalText(text)} />
        </section>
      </div>
    );
  }

  // Goals list view
  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-[#1E2227]">My Goals</h1>
          <p className="text-sm text-[#626A73] mt-1">
            {goals.length} goal{goals.length !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-[#4C7CF0] text-white text-sm font-medium px-4 py-2.5 rounded-lg hover:bg-[#3F6FE4] active:scale-[0.98] transition-all"
        >
          <Plus className="h-4 w-4" />
          New Goal
        </button>
      </div>

      <div className="space-y-3">
        {goals.map((goal) => (
          <button
            key={goal.id}
            onClick={() => router.push(`/goals/${goal.id}`)}
            className="w-full text-left rounded-[18px] border border-[#E6E1D8] bg-white p-5 shadow-[0_8px_24px_rgba(30,34,39,0.05)] hover:border-[#4C7CF0]/30 transition-all group"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-[#EAF0FF] text-[#4C7CF0]">
                  <Flag className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-[#1E2227]">
                    {goal.title}
                  </h3>
                  {goal.description && (
                    <p className="text-sm text-[#626A73] mt-0.5 line-clamp-1">
                      {goal.description}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs font-medium px-2 py-1 rounded-full ${
                    goal.status === "active"
                      ? "bg-[#4D8B6A]/10 text-[#4D8B6A]"
                      : goal.status === "completed"
                        ? "bg-[#4C7CF0]/10 text-[#4C7CF0]"
                        : "bg-[#F1EEE8] text-[#8C939B]"
                  }`}
                >
                  {goal.status}
                </span>
                <ChevronRight className="h-5 w-5 text-[#8C939B] group-hover:text-[#4C7CF0] transition-colors" />
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
