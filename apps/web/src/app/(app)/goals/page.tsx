"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { GoalInput } from "@/components/landing/goal-input";
import { ExampleGoals } from "@/components/landing/example-goals";
import { GoalChat } from "@/components/goals/goal-chat";
import { createClient } from "@/lib/db/client";
import type { Goal } from "@/lib/types/database";

type ActiveTab = "new" | string; // "new" or goal.id

export default function GoalsPage() {
  const router = useRouter();
  const [goalText, setGoalText] = useState("");
  const [chatActive, setChatActive] = useState(false);
  const [submittedGoal, setSubmittedGoal] = useState("");
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ActiveTab>("new");
  const [showHistory, setShowHistory] = useState(false);
  const tabsRef = useRef<HTMLDivElement>(null);

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
  };

  const handleCancel = () => {
    setChatActive(false);
    setSubmittedGoal("");
    setGoalText("");
  };

  const handleCloseTab = async (goalId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    // Archive the goal (soft delete)
    const supabase = createClient();
    await supabase.from("goals").update({ status: "archived" }).eq("id", goalId);
    setGoals((prev) => prev.filter((g) => g.id !== goalId));
    if (activeTab === goalId) setActiveTab("new");
  };

  const scrollTabs = (direction: "left" | "right") => {
    if (tabsRef.current) {
      tabsRef.current.scrollBy({ left: direction === "left" ? -200 : 200, behavior: "smooth" });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-sm text-[#9B948B]">Loading...</div>
      </div>
    );
  }

  const activeGoals = goals.filter((g) => g.status !== "archived");

  return (
    <div className="-mx-6 md:-mx-8 -mb-12">
      {/* Tab Bar */}
      <div className="flex items-center border-b border-[#E7DED2] bg-[#F6F3EE] px-2">
        {/* Scroll left */}
        {activeGoals.length > 4 && (
          <button
            onClick={() => scrollTabs("left")}
            className="p-1 text-[#9B948B] hover:text-[#2B2B2B] shrink-0"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}

        {/* Tabs */}
        <div ref={tabsRef} className="flex-1 flex items-center overflow-x-auto scrollbar-hide">
          {/* Goal tab — always first, clicking goes to create view */}
          <button
            onClick={() => { setActiveTab("new"); setChatActive(false); }}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors shrink-0 ${
              activeTab === "new"
                ? "border-[#7FAEE6] text-[#7FAEE6] bg-[#FFFDF9]"
                : "border-transparent text-[#6F6A64] hover:text-[#2B2B2B] hover:bg-[#F1ECE4]"
            }`}
          >
            Goal
          </button>

          {/* Goal tabs */}
          {activeGoals.map((goal) => (
            <div
              key={goal.id}
              onClick={() => { setActiveTab(goal.id); setChatActive(false); }}
              className={`group flex items-center gap-1.5 pl-4 pr-2 py-2.5 text-xs font-medium whitespace-nowrap border-b-2 transition-colors shrink-0 max-w-[200px] cursor-pointer ${
                activeTab === goal.id
                  ? "border-[#7FAEE6] text-[#2B2B2B] bg-[#FFFDF9]"
                  : "border-transparent text-[#6F6A64] hover:text-[#2B2B2B] hover:bg-[#F1ECE4]"
              }`}
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${
                goal.status === "active" ? "bg-[#7FB38A]" : "bg-[#9B948B]"
              }`} />
              <span className="truncate">{goal.title}</span>
              <button
                onClick={(e) => handleCloseTab(goal.id, e)}
                className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-[#D5847A]/10 transition-all shrink-0 ml-1"
              >
                <X className="h-3 w-3 text-[#9B948B] hover:text-[#D5847A]" />
              </button>
            </div>
          ))}
        </div>

        {/* Scroll right */}
        {activeGoals.length > 4 && (
          <button
            onClick={() => scrollTabs("right")}
            className="p-1 text-[#9B948B] hover:text-[#2B2B2B] shrink-0"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        )}

        {/* History button */}
        <button
          onClick={() => setShowHistory(true)}
          className="flex items-center gap-1 px-3 py-2 text-xs text-[#9B948B] hover:text-[#2B2B2B] transition-colors shrink-0 border-l border-[#E7DED2] ml-1"
        >
          <Clock className="h-3.5 w-3.5" />
          History
        </button>
      </div>

      {/* Tab Content */}
      <div className="px-6 md:px-8 pt-3 pb-12">
        {activeTab === "new" ? (
          chatActive ? (
            <GoalChat initialGoal={submittedGoal} onCancel={handleCancel} />
          ) : (
            <NewGoalView
              goalText={goalText}
              setGoalText={setGoalText}
              onSubmit={handleSubmitGoal}
            />
          )
        ) : (
          <GoalRedirect goalId={activeTab} />
        )}
      </div>

      {/* History Modal */}
      {showHistory && (
        <HistoryModal
          goals={goals}
          onSelect={(id) => { setActiveTab(id); setShowHistory(false); }}
          onClose={() => setShowHistory(false)}
        />
      )}
    </div>
  );
}

function NewGoalView({
  goalText,
  setGoalText,
  onSubmit,
}: {
  goalText: string;
  setGoalText: (v: string) => void;
  onSubmit: (text: string) => void;
}) {
  return (
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
        onSubmit={onSubmit}
      />

      <div className="mt-3">
        <ExampleGoals onSelect={(text) => setGoalText(text)} compact />
      </div>
    </section>
  );
}

function GoalRedirect({ goalId }: { goalId: string }) {
  const router = useRouter();

  useEffect(() => {
    router.push(`/goals/${goalId}`);
  }, [goalId, router]);

  return (
    <div className="flex items-center justify-center py-24">
      <div className="text-sm text-[#9B948B]">Loading goal...</div>
    </div>
  );
}

function HistoryModal({
  goals,
  onSelect,
  onClose,
}: {
  goals: Goal[];
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative bg-[#FFFDF9] rounded-2xl shadow-[0_24px_64px_rgba(30,34,39,0.15)] w-full max-w-2xl max-h-[70vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-[#E7DED2]">
          <div>
            <h2 className="text-lg font-semibold text-[#2B2B2B]">Goal History</h2>
            <p className="text-sm text-[#6F6A64] mt-0.5">{goals.length} goals total</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-[#6F6A64] hover:bg-[#F1ECE4]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-2">
          {goals.map((goal) => (
            <button
              key={goal.id}
              onClick={() => onSelect(goal.id)}
              className="w-full text-left rounded-xl border border-[#E7DED2] bg-[#FFFDF9] p-4 hover:border-[#7FAEE6]/30 transition-all group"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-[#2B2B2B]">{goal.title}</h3>
                  {goal.description && (
                    <p className="text-xs text-[#6F6A64] mt-0.5 line-clamp-1">{goal.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-3">
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                    goal.status === "active" ? "bg-[#7FB38A]/10 text-[#7FB38A]"
                    : goal.status === "completed" ? "bg-[#7FAEE6]/10 text-[#7FAEE6]"
                    : "bg-[#F1ECE4] text-[#9B948B]"
                  }`}>
                    {goal.status}
                  </span>
                  <span className="text-[10px] text-[#9B948B]">
                    {new Date(goal.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
