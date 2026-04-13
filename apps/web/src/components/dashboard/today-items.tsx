"use client";

import { useState, useTransition } from "react";
import { AlertTriangle } from "lucide-react";
import { toggleTask, updateTodo } from "@/lib/db/actions";
import { TodoItemCard } from "@/components/todo/todo-item-card";
import type { DashboardTodayItem } from "@/lib/types/database";

interface DashboardTodayItemsProps {
  items: DashboardTodayItem[];
  highPriorityItems: DashboardTodayItem[];
}

export function DashboardTodayItems({
  items: initialItems,
  highPriorityItems: initialHighPriority,
}: DashboardTodayItemsProps) {
  const [items, setItems] = useState(initialItems);
  const [highPriority, setHighPriority] = useState(initialHighPriority);
  const [, startTransition] = useTransition();

  const handleToggle = (item: DashboardTodayItem, list: "today" | "high") => {
    const setter = list === "today" ? setItems : setHighPriority;
    setter(prev =>
      prev.map(i => (i.id === item.id ? { ...i, completed: !i.completed } : i))
    );
    startTransition(async () => {
      try {
        if (item.sourceType === "daily_task") {
          await toggleTask(item.id, !item.completed);
        } else {
          await updateTodo(item.id, { completed: !item.completed });
        }
      } catch {
        setter(prev =>
          prev.map(i => (i.id === item.id ? { ...i, completed: item.completed } : i))
        );
      }
    });
  };

  const handleUpdate = (item: DashboardTodayItem, list: "today" | "high", patch: Record<string, unknown>) => {
    const setter = list === "today" ? setItems : setHighPriority;
    setter(prev => prev.map(i => (i.id === item.id ? { ...i, ...patch } : i)));
    startTransition(async () => {
      try {
        if (item.sourceType === "todo") {
          await updateTodo(item.id, patch as Parameters<typeof updateTodo>[1]);
        }
      } catch {
        // revert would be complex; rely on page refresh
      }
    });
  };

  const [tab, setTab] = useState<"pending" | "done">("pending");
  const pendingItems = items.filter(i => !i.completed);
  const doneItems = items.filter(i => i.completed);
  const visibleItems = tab === "pending" ? pendingItems : doneItems;
  const pendingHigh = highPriority.filter(i => !i.completed);

  return (
    <div>
      <div className="mb-5">
        <h2 className="text-xl font-semibold text-[#2B2B2B]">To-Do List</h2>
      </div>

      {/* 1. Today's To-Dos */}
      <div className="mb-6">
        <div className="mb-3 flex items-center justify-between gap-4">
          <div className="flex items-baseline gap-3">
            <h3 className="text-base font-semibold text-[#2B2B2B]">
              {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
            </h3>
            <p className="text-sm text-[#9B948B]">
              Tasks from your goals and personal to-dos.
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setTab("pending")}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                tab === "pending" ? "bg-[#7FAEE6] text-white" : "text-[#9B948B] hover:bg-[#F1ECE4]"
              }`}
            >
              Pending ({pendingItems.length})
            </button>
            <button
              onClick={() => setTab("done")}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                tab === "done" ? "bg-[#7FAEE6] text-white" : "text-[#9B948B] hover:bg-[#F1ECE4]"
              }`}
            >
              Done ({doneItems.length})
            </button>
          </div>
        </div>

        {visibleItems.length === 0 ? (
          <div className="py-6 text-center">
            <p className="text-sm text-[#6F6A64]">
              {tab === "pending" ? "No pending tasks. Enjoy your day!" : "No completed tasks yet."}
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-3">
            {visibleItems.map(item => (
              <TodoItemCard
                key={item.id}
                item={{
                  id: item.id,
                  text: item.title,
                  completed: item.completed,
                  deadline: item.deadline,
                  priority: item.priority,
                  tag: item.tag,
                }}
                onToggle={() => handleToggle(item, "today")}
                onUpdate={(patch) => handleUpdate(item, "today", patch)}
                onDelete={() => {}} // No delete from dashboard
              />
            ))}
          </div>
        )}
      </div>

      {/* 2. High Priority */}
      {pendingHigh.length > 0 && (
        <div>
          <div className="mb-3 flex items-baseline gap-3">
            <h3 className="text-base font-semibold text-[#D5847A] flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4" />
              High Priority
            </h3>
            <p className="text-sm text-[#9B948B]">
              {pendingHigh.length} items need attention
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {pendingHigh.map(item => (
              <TodoItemCard
                key={`high-${item.id}`}
                item={{
                  id: item.id,
                  text: item.title,
                  completed: item.completed,
                  deadline: item.deadline,
                  priority: item.priority,
                  tag: item.tag,
                }}
                onToggle={() => handleToggle(item, "high")}
                onUpdate={(patch) => handleUpdate(item, "high", patch)}
                onDelete={() => {}}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
