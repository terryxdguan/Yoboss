"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Circle, Clock } from "lucide-react";
import { createClient } from "@/lib/db/client";
import type { Goal, Phase } from "@/lib/types/database";

export default function GoalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [goal, setGoal] = useState<Goal | null>(null);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();

    // Fetch goal
    supabase
      .from("goals")
      .select("*")
      .eq("id", id)
      .single()
      .then(({ data }) => setGoal(data));

    // Fetch phases
    supabase
      .from("phases")
      .select("*")
      .eq("goal_id", id)
      .order("sort_order")
      .then(({ data }) => {
        setPhases(data || []);
        setLoading(false);
      });
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-sm text-[#8C939B]">Loading...</div>
      </div>
    );
  }

  if (!goal) {
    return (
      <div className="text-center py-24">
        <p className="text-[#626A73]">Goal not found</p>
        <button
          onClick={() => router.push("/goals")}
          className="text-sm text-[#4C7CF0] mt-2 hover:underline"
        >
          Back to Goals
        </button>
      </div>
    );
  }

  const totalWeeks = phases.reduce(
    (sum, p) => sum + (p.estimated_weeks || 0),
    0
  );

  return (
    <div>
      {/* Header */}
      <button
        onClick={() => router.push("/goals")}
        className="flex items-center gap-1.5 text-sm text-[#626A73] hover:text-[#1E2227] transition-colors mb-4"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Goals
      </button>

      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-[#1E2227]">
          {goal.title}
        </h1>
        {goal.description && (
          <p className="text-sm text-[#626A73] mt-1">{goal.description}</p>
        )}
        <div className="flex items-center gap-3 mt-3">
          <span className="text-xs font-medium px-2 py-1 rounded-full bg-[#4D8B6A]/10 text-[#4D8B6A]">
            {goal.status}
          </span>
          <span className="text-xs text-[#8C939B]">
            {phases.length} phases, ~{totalWeeks} weeks
          </span>
        </div>
      </div>

      {/* Phase timeline */}
      <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-2">
        {phases.map((phase, idx) => (
          <div key={phase.id} className="flex items-center">
            <div
              className={`flex items-center justify-center shrink-0 w-10 h-10 rounded-xl text-sm font-semibold ${
                phase.status === "completed"
                  ? "bg-[#4D8B6A] text-white"
                  : phase.status === "active"
                    ? "bg-[#4C7CF0] text-white"
                    : "bg-[#E6E1D8] text-[#8C939B]"
              }`}
            >
              {phase.status === "completed" ? (
                <CheckCircle2 className="h-5 w-5" />
              ) : (
                idx + 1
              )}
            </div>
            {idx < phases.length - 1 && (
              <div
                className={`w-8 h-0.5 ${
                  phase.status === "completed"
                    ? "bg-[#4D8B6A]"
                    : "bg-[#E6E1D8]"
                }`}
              />
            )}
          </div>
        ))}
      </div>

      {/* Phase cards */}
      <div className="space-y-4">
        {phases.map((phase, idx) => (
          <div
            key={phase.id}
            className={`rounded-[18px] border bg-white p-6 shadow-[0_8px_24px_rgba(30,34,39,0.05)] ${
              phase.status === "active"
                ? "border-[#4C7CF0]/30"
                : "border-[#E6E1D8]"
            }`}
          >
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      phase.status === "active"
                        ? "bg-[#4C7CF0]/10 text-[#4C7CF0]"
                        : phase.status === "completed"
                          ? "bg-[#4D8B6A]/10 text-[#4D8B6A]"
                          : "bg-[#F1EEE8] text-[#8C939B]"
                    }`}
                  >
                    Phase {idx + 1}
                  </span>
                  {phase.status === "active" && (
                    <span className="text-xs text-[#4C7CF0] font-medium">
                      Current
                    </span>
                  )}
                </div>
                <h3 className="text-lg font-semibold text-[#1E2227] mt-1">
                  {phase.title}
                </h3>
                {phase.description && (
                  <p className="text-sm text-[#626A73] mt-0.5">
                    {phase.description}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-[#8C939B]">
                <Clock className="h-3.5 w-3.5" />
                {phase.estimated_weeks} week{phase.estimated_weeks !== 1 ? "s" : ""}
              </div>
            </div>

            {/* Weekly plan placeholder */}
            {phase.status === "active" && (
              <div className="mt-4 pt-4 border-t border-[#E6E1D8]">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-[#1E2227]">
                    Weekly Plan
                  </h4>
                  <button className="text-xs text-[#4C7CF0] font-medium hover:underline">
                    Generate with AI
                  </button>
                </div>
                <div className="text-center py-8">
                  <Circle className="h-8 w-8 text-[#E6E1D8] mx-auto mb-2" />
                  <p className="text-sm text-[#8C939B]">
                    No weekly plan yet
                  </p>
                  <p className="text-xs text-[#8C939B] mt-1">
                    Click &quot;Generate with AI&quot; to create this week&apos;s schedule
                  </p>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
