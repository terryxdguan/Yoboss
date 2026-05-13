"use client";

import { useEffect, useState, useTransition } from "react";
import { Plus, X, ListChecks } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { toggleTask, updateTodo, addTodo, deleteTodo, deleteTask } from "@/lib/db/actions";
import { TodoItemCard } from "@/components/todo/todo-item-card";
import { DateTimePicker } from "@/components/todo/date-time-picker";
import { useDashboardChat, useRegisterAddTodoOpener } from "@/components/dashboard/dashboard-shell";
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
  const t = useTranslations("dashboard.todayItems");
  const tCommon = useTranslations("common");
  const locale = useLocale();
  const [items, setItems] = useState(initialItems);
  const [highPriority, setHighPriority] = useState(initialHighPriority);
  const [, startTransition] = useTransition();

  // AI chat — provided by DashboardShell
  const sendToAI = useDashboardChat();

  // Add modal state — default deadline is today 11:59 PM so item shows on Dashboard immediately
  const getTodayEndOfDay = () => {
    const d = new Date();
    d.setHours(23, 59, 0, 0);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T23:59`;
  };
  const [showAdd, setShowAdd] = useState(false);
  const registerAddTodoOpener = useRegisterAddTodoOpener();
  useEffect(() => {
    if (!registerAddTodoOpener) return;
    // setAddTodoOpener is a React setState; passing a function arg makes
    // React treat it as an updater. Wrap the actual opener in another
    // function so it gets stored as the value, not invoked.
    registerAddTodoOpener(() => () => setShowAdd(true));
    return () => registerAddTodoOpener(() => () => {});
  }, [registerAddTodoOpener]);
  const [newText, setNewText] = useState("");
  const [newDeadline, setNewDeadline] = useState(getTodayEndOfDay);
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

  // Delete handler. Mirrors handleToggle: optimistically remove from local
  // state, fire the server action in a transition, roll back on error.
  // Branches on sourceType because todos and daily_tasks live in different
  // tables and need different delete actions.
  const handleDelete = (item: DashboardTodayItem, list: "today" | "high") => {
    const setter = list === "today" ? setItems : setHighPriority;
    // Snapshot for rollback
    const prevItems = list === "today" ? items : highPriority;
    setter(prev => prev.filter(i => i.id !== item.id));
    // If the item also lives in the other list (merged via dedupe), remove there too.
    if (list === "today") {
      setHighPriority(prev => prev.filter(i => i.id !== item.id));
    } else {
      setItems(prev => prev.filter(i => i.id !== item.id));
    }
    startTransition(async () => {
      try {
        if (item.sourceType === "daily_task") {
          await deleteTask(item.id);
        } else {
          await deleteTodo(item.id);
        }
      } catch (err) {
        console.error("Failed to delete item:", err);
        // Rollback
        setter(prevItems);
      }
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
      setNewDeadline(getTodayEndOfDay());
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
  // Category filter toggles — start with everything visible. Clicking a
  // legend button adds/removes the category here; the visibleItems
  // pipeline below excludes filtered-out categories. Uses the same
  // variant-assignment rule as TodoItemCard below (high priority wins
  // over schedule wins over plain to-do).
  const [hiddenCategories, setHiddenCategories] = useState<
    Set<"schedule" | "todo" | "high">
  >(new Set());
  const toggleCategory = (cat: "schedule" | "todo" | "high") => {
    setHiddenCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  // Filter high priority: only show if its deadline is today. The
  // dashboard's "Today's To-Do List" must reflect items the user has
  // explicitly committed to do today — high-priority items without a
  // deadline are aspirational, not scheduled, and clutter the list. They
  // remain visible on /todos and still feed into the AI chat context
  // (see dashboard-shell.tsx's buildChatContext).
  const todayStr = new Date().toISOString().split("T")[0];
  const filteredHighPriority = highPriority.filter(i => {
    if (!i.deadline) return false;               // no deadline → not today's
    return i.deadline.startsWith(todayStr);      // deadline is today → show
  });

  // Merge all items (today + filtered high priority) into one unified list, deduped
  const highPriorityIds = new Set(filteredHighPriority.map(i => i.id));
  const allItems = [...items, ...filteredHighPriority.filter(i => !items.some(t => t.id === i.id))];
  const pendingItems = allItems.filter(i => !i.completed);
  const doneItems = allItems.filter(i => i.completed);
  const tabItems = tab === "pending" ? pendingItems : doneItems;
  const visibleItems = tabItems.filter((item) => {
    const isSchedule = item.sourceType === "daily_task";
    const isHigh = item.priority === "high";
    const variant = isHigh ? "high" : isSchedule ? "schedule" : "todo";
    return !hiddenCategories.has(variant);
  });

  // Unique tag list for category dropdown
  const defaultTags = ["Work", "Life", "Other"];
  const allTags = [...new Set([...defaultTags, ...todoTags])];
  const activeGoals = goals.filter(g => g.status === "active");

  function formatDeadlineShort(d: string): string {
    const date = new Date(d);
    return date.toLocaleString(locale, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  return (
    <div className="rounded-2xl border border-[#E7DED2] bg-[#FFFFFF] p-6 shadow-[0_4px_16px_rgba(30,34,39,0.04)]">
      {/* Header: title + add button + tabs */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-semibold text-[#2B2B2B]">{t("title")}</h2>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#7C2DE8] text-white text-xs font-semibold hover:bg-[#6921C7] transition-colors shadow-[0_2px_8px_rgba(124,45,232,0.25)]"
          >
            <Plus className="h-3.5 w-3.5" />
            {t("add")}
          </button>
        </div>
        {/* Pending/Done toggle — design-system pill: selected half is
            #7C2DE8/white, unselected half is transparent over the shared
            #F5F5F5 track. */}
        <div className="flex items-center rounded-full bg-[#F6F3EE] p-0.5">
          <button
            onClick={() => setTab("pending")}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              tab === "pending" ? "bg-[#7C2DE8] text-white" : "text-[#000000]/60 hover:text-[#000000]/80"
            }`}
          >
            {t("pending", { count: pendingItems.length })}
          </button>
          <button
            onClick={() => setTab("done")}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-colors ${
              tab === "done" ? "bg-[#7C2DE8] text-white" : "text-[#000000]/60 hover:text-[#000000]/80"
            }`}
          >
            {t("done", { count: doneItems.length })}
          </button>
        </div>
      </div>

      <div className="border-b border-dashed border-[#E7DED2] mb-4" />

      {/* Color legend + date header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <h3 className="text-base font-semibold text-[#2B2B2B]">
            {new Date().toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" })}
          </h3>
        </div>
        <div className="flex items-center gap-1">
          {(
            [
              { key: "schedule", labelKey: "schedule", border: "border-[#7C2DE8]/50" },
              { key: "todo", labelKey: "todo", border: "border-[#7FB38A]/50" },
            ] as const
          ).map(({ key, labelKey, border }) => {
            const hidden = hiddenCategories.has(key);
            const label = t(labelKey);
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggleCategory(key)}
                aria-pressed={!hidden}
                title={hidden ? t("showItems", { label }) : t("hideItems", { label })}
                className={`flex items-center gap-1.5 text-[11px] rounded-md px-2 py-1 transition-colors hover:bg-[#F6F3EE] ${
                  hidden
                    ? "text-[#9B948B] line-through opacity-60"
                    : "text-[#6F6A64]"
                }`}
              >
                <span
                  className={`w-3 h-3 rounded border-2 ${border} ${hidden ? "opacity-30" : ""}`}
                />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Unified item grid */}
      {visibleItems.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#E7DED2] bg-[#FFFFFF] p-8 text-center mb-6">
          <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-[#F6F3EE] flex items-center justify-center">
            <ListChecks className="h-5 w-5 text-[#9B948B]" />
          </div>
          <p className="text-sm text-[#6F6A64]">
            {tab === "pending" ? t("emptyPending") : t("emptyDone")}
          </p>
          {tab === "pending" && (
            <button
              onClick={() => setShowAdd(true)}
              className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium text-[#7C2DE8] bg-[#F3ECFB] hover:bg-[#7C2DE8]/20 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              {t("addTask")}
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mb-6">
          {visibleItems.map(item => {
            const isSchedule = item.sourceType === "daily_task";
            const isHigh = item.priority === "high";
            const variant = isHigh ? "high" as const : isSchedule ? "schedule" as const : "todo" as const;

            return (
              <TodoItemCard
                key={item.id}
                item={{
                  id: item.id,
                  text: item.title,
                  completed: item.completed,
                  deadline: isSchedule ? null : item.deadline,
                  priority: item.priority,
                  tag: item.tag,
                }}
                variant={variant}
                timeOnly
                timeSlot={isSchedule ? (item.description || null) : undefined}
                sourceLabel={isSchedule ? (item.sourceLabel || "Goal") : (item.tag || null)}
                onToggle={() => handleToggle(item, "today")}
                onUpdate={(patch) => handleUpdate(item, "today", patch)}
                onDelete={() => handleDelete(item, "today")}
                onSendToAI={() => sendToAI?.(item)}
              />
            );
          })}
          {/* Add more card */}
          <button
            onClick={() => setShowAdd(true)}
            className="rounded-lg border border-dashed border-[#DDD3C7] bg-transparent flex flex-col items-center justify-center py-6 text-[#9B948B] hover:border-[#7C2DE8] hover:text-[#7C2DE8] transition-colors cursor-pointer min-h-[80px]"
          >
            <Plus className="h-5 w-5 mb-1" />
            <span className="text-xs">{t("addMore")}</span>
          </button>
        </div>
      )}

      {/* Add To-Do Modal */}
      {showAdd && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" onClick={() => setShowAdd(false)} />
          <div className="relative bg-[#FFFFFF] rounded-2xl shadow-[0_24px_64px_rgba(30,34,39,0.15)] w-full max-w-md">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-[#E7DED2]">
              <h2 className="text-lg font-semibold text-[#2B2B2B]">{t("modalTitle")}</h2>
              <button onClick={() => setShowAdd(false)} className="p-2 rounded-lg text-[#6F6A64] hover:bg-[#F6F3EE]">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              {/* Task */}
              <div>
                <label className="block text-sm font-medium text-[#2B2B2B] mb-1.5">{t("fieldTask")}</label>
                <input
                  autoFocus
                  value={newText}
                  onChange={(e) => setNewText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && newText.trim()) handleAddTodo(); }}
                  placeholder={t("fieldTaskPlaceholder")}
                  className="w-full px-3.5 py-2.5 text-sm border border-[#DDD3C7] rounded-xl text-[#2B2B2B] placeholder:text-[#9B948B] focus:outline-none focus:ring-2 focus:ring-[#7C2DE8]/30 focus:border-[#7C2DE8]"
                />
              </div>

              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-[#2B2B2B] mb-1.5">{t("fieldCategory")}</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm border border-[#DDD3C7] rounded-xl text-[#2B2B2B] focus:outline-none focus:ring-2 focus:ring-[#7C2DE8]/30 focus:border-[#7C2DE8]"
                >
                  <optgroup label={t("groupPersonal")}>
                    {allTags.map(tag => (
                      <option key={tag} value={tag}>{tag}</option>
                    ))}
                  </optgroup>
                  {activeGoals.length > 0 && (
                    <optgroup label={t("groupGoals")}>
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
                  {t("fieldDeadline")} <span className="text-[#9B948B] font-normal">{t("fieldDeadlineOptional")}</span>
                </label>
                <div className="relative">
                  <button
                    onClick={() => setShowDeadlinePicker(!showDeadlinePicker)}
                    className="w-full px-3.5 py-2.5 text-sm border border-[#DDD3C7] rounded-xl text-left text-[#6F6A64] hover:border-[#7C2DE8] transition-colors"
                  >
                    {newDeadline ? formatDeadlineShort(newDeadline) : t("fieldDeadlinePlaceholder")}
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
                <label className="block text-sm font-medium text-[#2B2B2B] mb-1.5">{t("fieldPriority")}</label>
                <select
                  value={newPriority}
                  onChange={(e) => setNewPriority(e.target.value as "high" | "medium" | "low")}
                  className="w-full px-3.5 py-2.5 text-sm border border-[#DDD3C7] rounded-xl text-[#2B2B2B] focus:outline-none focus:ring-2 focus:ring-[#7C2DE8]/30 focus:border-[#7C2DE8]"
                >
                  <option value="high">{t("priorityHigh")}</option>
                  <option value="medium">{t("priorityMedium")}</option>
                  <option value="low">{t("priorityLow")}</option>
                </select>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#E7DED2]">
              <button
                onClick={() => setShowAdd(false)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-[#6F6A64] hover:bg-[#F6F3EE] transition-colors"
              >
                {tCommon("cancel")}
              </button>
              <button
                onClick={handleAddTodo}
                disabled={!newText.trim()}
                className="px-5 py-2 rounded-xl text-sm font-medium bg-[#7C2DE8] text-white hover:bg-[#6921C7] disabled:opacity-40 transition-colors shadow-[0_2px_8px_rgba(124,45,232,0.3)]"
              >
                {t("submit")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
