"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
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
  const [addTodoOpener, setAddTodoOpener] = useState<(() => void) | null>(null);
  const router = useRouter();

  // If the clicked item belongs to a Goal, route the chat into that
  // Goal's session by navigating to the goal page with URL params the
  // page reads on mount. This guarantees the user lands on the same
  // chat session as the Goal page Coach panel, with full goal context
  // (phases, milestones, weekly plan) loaded into the system prompt.
  // Personal todos keep the in-place dashboard task-assistant chat.
  const handleSendToChat = useCallback(
    (item: DashboardTodayItem) => {
      if (item.goalId) {
        const params = new URLSearchParams();
        params.set("chat", "1");
        params.set("taskTitle", item.title);
        if (item.description) params.set("taskTime", item.description);
        router.push(`/goals/${item.goalId}?${params.toString()}`);
        return;
      }
      setChatItem(item);
    },
    [router]
  );

  return (
    <div className="flex -mx-6 md:-mx-8 -mb-12">
      {/* Main content */}
      <div className="flex-1 min-w-0 px-6 md:px-8 pb-12">
        <DashboardChatContext.Provider value={handleSendToChat}>
          <DashboardAddTodoRegisterContext.Provider value={setAddTodoOpener}>
            <DashboardAddTodoContext.Provider value={addTodoOpener}>
              {children}
            </DashboardAddTodoContext.Provider>
          </DashboardAddTodoRegisterContext.Provider>
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

// Open the Add To-Do modal hosted in DashboardTodayItems. Publisher is
// today-items.tsx; consumers are e.g. WelcomeBanner's Stage 3 CTA.
export const DashboardAddTodoContext = createContext<(() => void) | null>(null);

export function useDashboardAddTodo() {
  return useContext(DashboardAddTodoContext);
}

// Channel used by today-items.tsx to register its modal-opener with the
// shell. Separate from DashboardAddTodoContext so consumers and producers
// don't clash on the same context.
export const DashboardAddTodoRegisterContext = createContext<
  ((opener: () => void) => void) | null
>(null);

export function useRegisterAddTodoOpener() {
  return useContext(DashboardAddTodoRegisterContext);
}
