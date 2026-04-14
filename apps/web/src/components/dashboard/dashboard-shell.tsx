"use client";

import { useState } from "react";
import { GoalChatPanel } from "@/components/goals/goal-chat-panel";
import type { GoalDetailChatContext } from "@/lib/ai/goal-detail-chat";
import type { DashboardTodayItem, DailyTask } from "@/lib/types/database";

interface DashboardShellProps {
  children: React.ReactNode;
  allItems: DashboardTodayItem[];
  highPriorityItems: DashboardTodayItem[];
}

function buildChatContext(allItems: DashboardTodayItem[], highItems: DashboardTodayItem[]): GoalDetailChatContext {
  const allPending = [...allItems, ...highItems].filter(i => !i.completed);
  return {
    goalTitle: "Task Assistant",
    goalDescription: "Help the user break down, plan, and complete their tasks",
    phases: [],
    weeklyTasks: allPending.map(i => ({
      dayOfWeek: 0,
      title: `[${i.sourceType === "daily_task" ? i.sourceLabel : i.tag}] ${i.title}${i.deadline ? ` (due: ${i.deadline})` : ""} — ${i.priority} priority`,
      timeSlot: i.description || null,
      completed: i.completed,
    })),
    weekSummary: `${allPending.length} pending tasks`,
  };
}

function buildTaskContext(item: DashboardTodayItem): DailyTask {
  return {
    id: item.id,
    weekly_plan_id: "",
    day_of_week: 0,
    title: item.title,
    description: item.sourceType === "daily_task"
      ? `Goal: ${item.sourceLabel}, Time: ${item.description || "unset"}`
      : `Category: ${item.tag}, Priority: ${item.priority}${item.deadline ? `, Deadline: ${item.deadline}` : ""}`,
    time_slot: item.description || item.deadline,
    time_estimate_minutes: null,
    completed: item.completed,
    completed_at: null,
    sort_order: 0,
  };
}

export function DashboardShell({ children, allItems, highPriorityItems }: DashboardShellProps) {
  const [chatItem, setChatItem] = useState<DashboardTodayItem | null>(null);

  return (
    <div className="flex -mx-6 md:-mx-8 -mb-12">
      {/* Main content */}
      <div className="flex-1 min-w-0 px-6 md:px-8 pb-12">
        <DashboardChatContext.Provider value={setChatItem}>
          {children}
        </DashboardChatContext.Provider>
      </div>

      {/* Right panel — same pattern as Goal detail page */}
      {chatItem && (
        <GoalChatPanel
          goalId="__dashboard__"
          goalContext={buildChatContext(allItems, highPriorityItems)}
          taskContext={buildTaskContext(chatItem)}
          panelTitle="Task Assistant"
          onClose={() => setChatItem(null)}
        />
      )}
    </div>
  );
}

// Context to let child components trigger the chat panel
import { createContext, useContext } from "react";

export const DashboardChatContext = createContext<((item: DashboardTodayItem) => void) | null>(null);

export function useDashboardChat() {
  return useContext(DashboardChatContext);
}
