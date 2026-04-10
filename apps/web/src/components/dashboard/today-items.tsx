"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Circle, Flag, Tag } from "lucide-react";
import { toggleTask, updateTodo } from "@/lib/db/actions";
import type { DashboardTodayItem } from "@/lib/types/database";

interface DashboardTodayItemsProps {
  items: DashboardTodayItem[];
}

const TIME_LABELS: Record<string, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
};

export function DashboardTodayItems({ items: initialItems }: DashboardTodayItemsProps) {
  const [items, setItems] = useState(initialItems);
  const [, startTransition] = useTransition();

  const handleToggle = (item: DashboardTodayItem) => {
    // Optimistic update
    setItems(prev =>
      prev.map(i => i.id === item.id ? { ...i, completed: !i.completed } : i)
    );

    startTransition(async () => {
      try {
        if (item.sourceType === "daily_task") {
          await toggleTask(item.id, !item.completed);
        } else {
          await updateTodo(item.id, { completed: !item.completed });
        }
      } catch {
        // Revert on error
        setItems(prev =>
          prev.map(i => i.id === item.id ? { ...i, completed: item.completed } : i)
        );
      }
    });
  };

  const groups = {
    morning: items.filter(i => i.timeSlot === "morning"),
    afternoon: items.filter(i => i.timeSlot === "afternoon"),
    evening: items.filter(i => i.timeSlot === "evening"),
  };

  const totalTasks = items.length;

  return (
    <div className="rounded-[18px] border border-[#E7DED2] bg-[#FFFDF9] p-6 shadow-[0_8px_24px_rgba(30,34,39,0.05)]">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-[#2B2B2B]">
            Today&apos;s To-Do List
          </h2>
          <p className="mt-1 text-sm text-[#6F6A64]">
            Tasks from your goals and personal to-dos.
          </p>
        </div>
        <span className="rounded-full bg-[#EAF3FD] px-3 py-1 text-xs font-semibold text-[#7FAEE6]">
          {totalTasks} items
        </span>
      </div>

      {totalTasks === 0 ? (
        <div className="py-10 text-center">
          <p className="text-sm text-[#6F6A64]">No tasks for today. Enjoy your day!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {(["morning", "afternoon", "evening"] as const).map((slot) => (
            <div
              key={slot}
              className="rounded-[18px] border border-[#E7DED2] bg-[#F1ECE4] p-5"
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-[#2B2B2B]">
                  {TIME_LABELS[slot]}
                </h3>
                <span className="text-[11px] font-semibold text-[#9B948B]">
                  {groups[slot].length} tasks
                </span>
              </div>
              {groups[slot].length === 0 ? (
                <p className="text-xs text-[#9B948B] py-2">No tasks</p>
              ) : (
                <ul className="space-y-3">
                  {groups[slot].map((item) => (
                    <li key={item.id} className="flex items-start gap-3">
                      <button
                        onClick={() => handleToggle(item)}
                        className="shrink-0 mt-0.5"
                      >
                        {item.completed ? (
                          <CheckCircle2 className="h-5 w-5 text-[#7FB38A] fill-[#7FB38A] stroke-white" />
                        ) : (
                          <Circle className="h-5 w-5 text-[#9B948B] hover:text-[#7FAEE6] transition-colors" />
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium ${item.completed ? "text-[#9B948B] line-through" : "text-[#2B2B2B]"}`}>
                          {item.title}
                        </p>
                        {item.description && (
                          <p className="text-[12px] text-[#6F6A64] mt-0.5 truncate">
                            {item.description}
                          </p>
                        )}
                        <span
                          className={`inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium ${
                            item.source === "goal"
                              ? "text-[#7FAEE6] bg-[#EAF3FD]"
                              : "text-[#7FB38A] bg-[rgba(77,139,106,0.10)]"
                          }`}
                        >
                          {item.source === "goal" ? (
                            <Flag className="h-2.5 w-2.5" />
                          ) : (
                            <Tag className="h-2.5 w-2.5" />
                          )}
                          {item.sourceLabel}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
