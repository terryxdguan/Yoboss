"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Plus, X } from "lucide-react";
import { toggleTask, updateTodo, addTodo } from "@/lib/db/actions";
import { TodoItemCard } from "@/components/todo/todo-item-card";
import { DateTimePicker } from "@/components/todo/date-time-picker";
import type { DashboardTodayItem } from "@/lib/types/database";
import type { GoalWithPhases } from "@/lib/types/database";

interface DashboardTodayItemsProps {
  items: DashboardTodayItem[];
  highPriorityItems: DashboardTodayItem[];
  todoTags: string[];
  goals: GoalWithPhases[];
}

export function DashboardTodayItems({
  items: initialItems,
  highPriorityItems: initialHighPriority,
  todoTags,
  goals,
}: DashboardTodayItemsProps) {
  const [items, setItems] = useState(initialItems);
  const [highPriority, setHighPriority] = useState(initialHighPriority);
  const [, startTransition] = useTransition();

  // Add modal state
  const [showAdd, setShowAdd] = useState(false);
  const [newText, setNewText] = useState("");
  const [newDeadline, setNewDeadline] = useState("");
  const [newPriority, setNewPriority] = useState<"high" | "medium" | "low">("medium");
  const [newCategory, setNewCategory] = useState("personal"); // "personal" tag or "goal:{goalId}"
  const [showDeadlinePicker, setShowDeadlinePicker] = useState(false);

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
      } catch { /* rely on page refresh */ }
    });
  };

  const handleAddTodo = async () => {
    if (!newText.trim()) return;
    const isGoal = newCategory.startsWith("goal:");
    const goalId = isGoal ? newCategory.slice(5) : undefined;
    const tag = isGoal ? "Goal" : (newCategory || "Work");

    try {
      await addTodo(newText.trim(), tag, newPriority, newDeadline || null, goalId);
      // Reset form
      setNewText("");
      setNewDeadline("");
      setNewPriority("medium");
      setNewCategory("personal");
      setShowAdd(false);
      // Refresh page to show new item
      window.location.reload();
    } catch (err) {
      console.error("Failed to add todo:", err);
    }
  };

  const [tab, setTab] = useState<"pending" | "done">("pending");
  const pendingItems = items.filter(i => !i.completed);
  const doneItems = items.filter(i => i.completed);
  const visibleItems = tab === "pending" ? pendingItems : doneItems;
  const pendingHigh = highPriority.filter(i => !i.completed);

  // Unique tag list for category dropdown
  const defaultTags = ["Work", "Life", "Other"];
  const allTags = [...new Set([...defaultTags, ...todoTags])];
  const activeGoals = goals.filter(g => g.status === "active");

  function formatDeadlineShort(d: string): string {
    const date = new Date(d);
    const month = date.toLocaleString("en", { month: "short" });
    const day = date.getDate();
    const h = date.getHours();
    const mins = date.getMinutes();
    if (h === 0 && mins === 0) return `${month} ${day}`;
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    const ap = h >= 12 ? "PM" : "AM";
    return `${month} ${day} ${h12}:${String(mins).padStart(2, "0")}${ap}`;
  }

  return (
    <div className="rounded-2xl border border-[#E7DED2] bg-[#FFFDF9] p-6 shadow-[0_4px_16px_rgba(30,34,39,0.04)]">
      {/* Header: title + add button + tabs */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-[#2B2B2B]">To-Do List</h2>
          <button
            onClick={() => setShowAdd(true)}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-[#E7DED2] bg-[#FFFDF9] text-[#6F6A64] hover:bg-[#F1ECE4] hover:text-[#2B2B2B] transition-colors"
            title="Add To-Do"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
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

      <div className="border-b border-dashed border-[#E7DED2] mb-5" />

      {/* 1. Today's To-Dos */}
      <div className="mb-6">
        <div className="mb-3 flex items-baseline gap-3">
          <h3 className="text-base font-semibold text-[#2B2B2B]">
            {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
          </h3>
          <p className="text-sm text-[#9B948B]">
            Tasks from your goals and personal to-dos.
          </p>
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
                onDelete={() => {}}
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

      {/* Add To-Do Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" onClick={() => setShowAdd(false)} />
          <div className="relative bg-[#FFFDF9] rounded-2xl shadow-[0_24px_64px_rgba(30,34,39,0.15)] w-full max-w-md">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-[#E7DED2]">
              <h2 className="text-lg font-semibold text-[#2B2B2B]">Add To-Do</h2>
              <button onClick={() => setShowAdd(false)} className="p-2 rounded-lg text-[#6F6A64] hover:bg-[#F1ECE4]">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {/* Task */}
              <div>
                <label className="block text-sm font-medium text-[#2B2B2B] mb-1.5">Task</label>
                <input
                  autoFocus
                  value={newText}
                  onChange={(e) => setNewText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && newText.trim()) handleAddTodo(); }}
                  placeholder="What needs to be done?"
                  className="w-full px-3.5 py-2.5 text-sm border border-[#DDD3C7] rounded-xl text-[#2B2B2B] placeholder:text-[#9B948B] focus:outline-none focus:ring-2 focus:ring-[#7FAEE6]/30 focus:border-[#7FAEE6]"
                />
              </div>

              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-[#2B2B2B] mb-1.5">Category</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm border border-[#DDD3C7] rounded-xl text-[#2B2B2B] focus:outline-none focus:ring-2 focus:ring-[#7FAEE6]/30 focus:border-[#7FAEE6]"
                >
                  <optgroup label="Personal To-Dos">
                    {allTags.map(tag => (
                      <option key={tag} value={tag}>{tag}</option>
                    ))}
                  </optgroup>
                  {activeGoals.length > 0 && (
                    <optgroup label="Goal To-Dos">
                      {activeGoals.map(g => (
                        <option key={g.id} value={`goal:${g.id}`}>{g.title}</option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              {/* Deadline */}
              <div>
                <label className="block text-sm font-medium text-[#2B2B2B] mb-1.5">
                  Deadline <span className="text-[#9B948B] font-normal">(optional)</span>
                </label>
                <div className="relative">
                  <button
                    onClick={() => setShowDeadlinePicker(!showDeadlinePicker)}
                    className="w-full px-3.5 py-2.5 text-sm border border-[#DDD3C7] rounded-xl text-left text-[#6F6A64] hover:border-[#7FAEE6] transition-colors"
                  >
                    {newDeadline ? formatDeadlineShort(newDeadline) : "Click to set deadline..."}
                  </button>
                  {showDeadlinePicker && (
                    <DateTimePicker
                      value={newDeadline || null}
                      onChange={(iso) => { setNewDeadline(iso); setShowDeadlinePicker(false); }}
                      onClose={() => setShowDeadlinePicker(false)}
                    />
                  )}
                </div>
              </div>

              {/* Priority */}
              <div>
                <label className="block text-sm font-medium text-[#2B2B2B] mb-1.5">Priority</label>
                <select
                  value={newPriority}
                  onChange={(e) => setNewPriority(e.target.value as "high" | "medium" | "low")}
                  className="w-full px-3.5 py-2.5 text-sm border border-[#DDD3C7] rounded-xl text-[#2B2B2B] focus:outline-none focus:ring-2 focus:ring-[#7FAEE6]/30 focus:border-[#7FAEE6]"
                >
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#E7DED2]">
              <button
                onClick={() => setShowAdd(false)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-[#6F6A64] hover:bg-[#F1ECE4] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddTodo}
                disabled={!newText.trim()}
                className="px-5 py-2 rounded-xl text-sm font-medium bg-[#7FAEE6] text-white hover:bg-[#6A9DDA] disabled:opacity-40 transition-colors shadow-[0_2px_8px_rgba(127,174,230,0.3)]"
              >
                Add To-Do
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
