"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
  getTodos, addTodo, updateTodo, deleteTodo, reorderTodos,
  getTodoTags, addTodoTag, updateTodoTag, deleteTodoTag, reorderTodoTags,
} from "@/lib/db/actions";
import type { TodoItem, TodoTag } from "@/lib/types/database";
import { DateTimePicker } from "@/components/todo/date-time-picker";
import { GoalChatPanel } from "@/components/goals/goal-chat-panel";
import { GripVertical, Plus } from "lucide-react";

const PRIORITY_DOT: Record<string, string> = { high: "bg-[#D5847A]", medium: "bg-[#D4B06A]", low: "bg-[#7FB38A]" };
const PRIORITY_PILL_ACTIVE: Record<string, string> = {
  high: "bg-[#FFF5F3] text-[#9A615B]",
  medium: "bg-[#FFF8E8] text-[#8E6B2E]",
  low: "bg-[#F1FAF3] text-[#3F7C4A]",
};
// Soft pastel band per category column. Cycles by index so adding columns
// just reuses the palette (no per-name hard-coding).
const COLUMN_COLORS = [
  { band: "border-[#BFDCC5] bg-[#F4FBF5]", text: "text-[#3F7C4A]" }, // green
  { band: "border-[#E8D5A4] bg-[#FFF9EA]", text: "text-[#8E6B2E]" }, // yellow
  { band: "border-[#B9D4E8] bg-[#F2F8FC]", text: "text-[#5E8FCE]" }, // blue
  { band: "border-[#BFD9CF] bg-[#F2FAF6]", text: "text-[#4F8A77]" }, // teal-green
  { band: "border-[#D9CFA9] bg-[#FFF9E8]", text: "text-[#7B6A2E]" }, // tan
  { band: "border-[#D5C8BD] bg-[#F9F5F1]", text: "text-[#7B6A60]" }, // warm beige
  { band: "border-[#E0B7B4] bg-[#FFF3F1]", text: "text-[#9A615B]" }, // rose
  { band: "border-[#D8D0C6] bg-[#F8F5EF]", text: "text-[#6F6A64]" }, // stone
];

function formatDeadline(d: string): string {
  const date = new Date(d);
  const month = date.toLocaleString("en", { month: "short" });
  const day = date.getDate();
  const year = date.getFullYear();
  const h = date.getHours();
  const mins = date.getMinutes();
  if (h === 0 && mins === 0) return `${month} ${day}, ${year}`;
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const ap = h >= 12 ? "PM" : "AM";
  return `${month} ${day}, ${year} ${h12}:${String(mins).padStart(2, "0")}${ap}`;
}

function isOverdue(item: TodoItem): boolean {
  if (!item.deadline || item.completed) return false;
  return new Date(item.deadline) < new Date();
}

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

/* ── TodoCard ── */
function TodoCard({
  item,
  onToggle,
  onDelete,
  onUpdate,
  onSendToAI,
  insertBefore,
  insertAfter,
  onDragOverCard,
  onDragLeaveCard,
  onCardDrop,
  onDragStartCard,
  onDragEndCard,
}: {
  item: TodoItem;
  onToggle: () => void;
  onDelete: () => void;
  onUpdate: (patch: Partial<TodoItem>) => void;
  onSendToAI: () => void;
  insertBefore: boolean;
  insertAfter: boolean;
  onDragOverCard: (position: "before" | "after") => void;
  onDragLeaveCard: () => void;
  onCardDrop: (draggedId: string, position: "before" | "after") => void;
  onDragStartCard: () => void;
  onDragEndCard: () => void;
}) {
  const overdue = isOverdue(item);
  const [editingDeadline, setEditingDeadline] = useState(false);
  const [editingText, setEditingText] = useState(false);
  const [editText, setEditText] = useState(item.text);

  const commitTextEdit = () => {
    const trimmed = editText.trim();
    if (trimmed && trimmed !== item.text) onUpdate({ text: trimmed });
    else setEditText(item.text);
    setEditingText(false);
  };

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", item.id);
        e.dataTransfer.setData("application/x-todo-id", item.id);
        e.dataTransfer.effectAllowed = "move";
        requestAnimationFrame(() => onDragStartCard());
      }}
      onDragEnd={onDragEndCard}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        const position = e.clientY < rect.top + rect.height / 2 ? "before" : "after";
        onDragOverCard(position);
        e.dataTransfer.dropEffect = "move";
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) onDragLeaveCard();
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const draggedId = e.dataTransfer.getData("application/x-todo-id") || e.dataTransfer.getData("text/plain");
        if (draggedId && draggedId !== item.id) {
          const rect = e.currentTarget.getBoundingClientRect();
          const position = e.clientY < rect.top + rect.height / 2 ? "before" : "after";
          onCardDrop(draggedId, position);
        }
        onDragLeaveCard();
      }}
      className="relative rounded-lg border border-[#E7DED2] bg-[#FFFDF9] px-3 py-2 group/card hover:border-[#DDD3C7] transition-colors cursor-grab active:cursor-grabbing"
    >
      {insertBefore && <div className="absolute -top-1.5 left-0 right-0 h-0.5 bg-[#7FAEE6] rounded-full z-10 pointer-events-none" />}
      {insertAfter && <div className="absolute -bottom-1.5 left-0 right-0 h-0.5 bg-[#7FAEE6] rounded-full z-10 pointer-events-none" />}
      {/* Row 1: checkbox + title + actions */}
      <div className="flex items-start gap-2">
        <button
          onClick={onToggle}
          className="w-[18px] h-[18px] mt-0.5 rounded-full border-2 border-[#DDD3C7] hover:border-[#7FAEE6] shrink-0 flex items-center justify-center transition-colors"
        />
        {editingText ? (
          <input
            autoFocus
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onBlur={commitTextEdit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitTextEdit();
              if (e.key === "Escape") { setEditText(item.text); setEditingText(false); }
            }}
            className="text-sm text-[#2B2B2B] font-medium leading-snug flex-1 bg-[#F6F3EE] border border-[#7FAEE6] rounded px-1.5 py-0.5 outline-none"
          />
        ) : (
          <span
            onDoubleClick={() => { setEditText(item.text); setEditingText(true); }}
            className="text-sm text-[#2B2B2B] font-medium leading-snug flex-1 break-words cursor-text"
          >
            {item.text}
          </span>
        )}
        <button
          onClick={onSendToAI}
          className="text-[#7FB38A] hover:text-[#3D7A5A] text-[13px] shrink-0 transition-colors"
          title="Send to Team"
        >
          ▶
        </button>
        <button
          onClick={onDelete}
          className="text-[#DDD3C7] hover:text-[#D5847A] text-[10px] shrink-0 transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Row 2: deadline + priority */}
      <div className="mt-1.5 ml-[26px] flex items-center gap-2 text-xs">
        {editingDeadline ? (
          <span className="relative inline-block">
            <span className="text-xs px-1 py-0.5 rounded bg-[#F1ECE4] border border-[#7FAEE6] text-[#6F6A64] inline-block">
              {item.deadline ? formatDeadline(item.deadline) : formatDeadline(new Date().toISOString())}
            </span>
            <DateTimePicker
              value={item.deadline ?? null}
              onChange={(v) => onUpdate({ deadline: v })}
              onClose={() => setEditingDeadline(false)}
            />
          </span>
        ) : item.deadline ? (
          <span className="flex items-center gap-1">
            <button
              onClick={() => setEditingDeadline(true)}
              className={`flex items-center gap-1 hover:opacity-80 whitespace-nowrap ${overdue ? "text-[#D5847A] font-medium" : "text-[#9B948B]"}`}
            >
              {overdue ? "⏰" : "📅"}
              <span>{formatDeadline(item.deadline)}</span>
            </button>
            <button
              onClick={() => onUpdate({ deadline: null })}
              className="text-[#DDD3C7] hover:text-[#D5847A] opacity-0 group-hover/card:opacity-100 transition-opacity"
            >
              ✕
            </button>
          </span>
        ) : (
          <button
            onClick={() => setEditingDeadline(true)}
            className="text-[#DDD3C7] hover:text-[#9B948B] transition-colors"
          >
            + deadline
          </button>
        )}

        <span className="ml-auto" />

        <span className={`w-2 h-2 rounded-full ${PRIORITY_DOT[item.priority]}`} />
        <select
          value={item.priority}
          onChange={(e) => onUpdate({ priority: e.target.value as TodoItem["priority"] })}
          className="text-[11px] px-1 py-0.5 rounded bg-transparent border border-transparent hover:border-[#E7DED2] text-[#9B948B] outline-none cursor-pointer"
        >
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>
    </div>
  );
}

/* ── Column Header ── */
function ColumnHeader({
  tag,
  color,
  count,
  onRename,
  onDelete,
  onDragStart,
  onDragEnd,
}: {
  tag: { id: string; name: string };
  color: { band: string; text: string };
  count: number;
  onRename: (name: string) => void;
  onDelete: () => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(tag.name);

  const commit = () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== tag.name) onRename(trimmed);
    else setEditName(tag.name);
    setEditing(false);
  };

  const isDraggable = tag.id !== "__other__" && !!onDragStart;

  return (
    <div className={`group flex items-center justify-between rounded-lg border px-3 py-2 ${color.band}`}>
      <div className="flex min-w-0 items-center gap-2">
        {isDraggable && (
          <button
            draggable
            aria-label={`Drag ${tag.name} category`}
            title="Drag to reorder"
            onDragStart={(e) => {
              e.dataTransfer.setData("application/x-todo-tag-id", tag.id);
              e.dataTransfer.effectAllowed = "move";
              requestAnimationFrame(() => onDragStart?.());
            }}
            onDragEnd={() => onDragEnd?.()}
            className="flex h-6 w-6 shrink-0 cursor-grab items-center justify-center rounded-md text-[#9B948B] hover:bg-[#FFFDF9] active:cursor-grabbing"
          >
            <GripVertical className="h-4 w-4" />
          </button>
        )}
        {editing ? (
          <input
            autoFocus
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") commit();
              if (e.key === "Escape") { setEditName(tag.name); setEditing(false); }
            }}
            className={`min-w-0 flex-1 border-b border-current bg-transparent text-sm font-semibold outline-none ${color.text}`}
          />
        ) : (
          <span
            onDoubleClick={() => { if (tag.id !== "__other__") { setEditName(tag.name); setEditing(true); } }}
            className={`text-sm font-semibold ${color.text} ${tag.id !== "__other__" ? "cursor-text" : ""}`}
          >
            {tag.name}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-[#FFFDF9]/70 px-2 py-0.5 text-[11px] font-semibold text-[#6F6A64]">
          {count}
        </span>
        {tag.id !== "__other__" && (
          <button
            onClick={onDelete}
            className="text-[10px] text-[#9B948B] opacity-0 transition-opacity hover:text-[#D5847A] group-hover:opacity-100"
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Main ── */
export default function TodosPage() {
  const [items, setItems] = useState<TodoItem[]>([]);
  const [showChat, setShowChat] = useState(false);
  const [chatTask, setChatTask] = useState<TodoItem | null>(null);
  const [tags, setTags] = useState<TodoTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeStatus, setActiveStatus] = useState<"pending" | "done">("pending");
  const [newText, setNewText] = useState("");
  const [newTag, setNewTag] = useState("");
  const [newPriority, setNewPriority] = useState<"high" | "medium" | "low">("medium");
  const [newDeadline, setNewDeadline] = useState<string | null>(null);
  const [showDeadlinePicker, setShowDeadlinePicker] = useState(false);
  const [addingTag, setAddingTag] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [selectedDone, setSelectedDone] = useState<Set<string>>(new Set());
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
  const [cardInsert, setCardInsert] = useState<{ id: string; position: "before" | "after" } | null>(null);
  const [draggingTagId, setDraggingTagId] = useState<string | null>(null);
  const [tagInsert, setTagInsert] = useState<{ tagId: string; position: "before" | "after" } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    Promise.all([getTodos(), getTodoTags()]).then(([todos, t]) => {
      setItems(todos);
      setTags(t);
      if (t.length > 0) setNewTag(t[0].name);
      setLoading(false);
    });
  }, []);

  const pendingItems = items.filter((i) => !i.completed);
  const doneItems = items.filter((i) => i.completed);

  const handleAdd = async () => {
    const text = newText.trim();
    if (!text) return;
    const item = await addTodo(text, newTag || "Work", newPriority, newDeadline);
    setItems((prev) => [...prev, item]);
    setNewText("");
    setNewPriority("medium");
    setNewDeadline(null);
    setShowDeadlinePicker(false);
    inputRef.current?.focus();
  };

  const handleToggle = async (id: string) => {
    const item = items.find((i) => i.id === id);
    if (!item) return;
    await updateTodo(id, { completed: !item.completed });
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, completed: !i.completed, completed_at: !i.completed ? new Date().toISOString() : null } : i))
    );
  };

  const handleUpdate = async (id: string, patch: Partial<TodoItem>) => {
    await updateTodo(id, patch);
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  };

  const handleDelete = async (id: string) => {
    await deleteTodo(id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const handleAddTag = async () => {
    const name = newTagName.trim();
    if (!name) return;
    const tag = await addTodoTag(name);
    setTags((prev) => [...prev, tag]);
    setNewTagName("");
    setAddingTag(false);
  };

  const handleCardReorder = (targetCardId: string, draggedId: string, position: "before" | "after", columnTagName: string) => {
    if (!draggedId || draggedId === targetCardId) return;
    setCardInsert(null);
    setDraggingCardId(null);

    const draggedItem = items.find((i) => i.id === draggedId);
    if (!draggedItem) return;

    // If different column, change tag
    if (draggedItem.tag !== columnTagName) {
      handleUpdate(draggedId, { tag: columnTagName });
      return;
    }

    // Same column: reorder
    const colItems = [...pendingItems.filter((i) => i.tag === columnTagName)].sort((a, b) => a.sort_order - b.sort_order);
    const withoutDragged = colItems.filter((i) => i.id !== draggedId);
    const targetIdx = withoutDragged.findIndex((i) => i.id === targetCardId);
    if (targetIdx < 0) return;
    const insertIdx = position === "before" ? targetIdx : targetIdx + 1;
    withoutDragged.splice(insertIdx, 0, draggedItem);
    const orderedIds = withoutDragged.map((i) => i.id);

    // Optimistic update first (immediate visual feedback)
    setItems((prev) => {
      return prev.map((item) => {
        const newIdx = orderedIds.indexOf(item.id);
        if (newIdx >= 0) {
          return { ...item, sort_order: newIdx };
        }
        return item;
      });
    });

    // Then persist to DB
    reorderTodos(orderedIds).catch(console.error);
  };

  const handleCardDropOnColumn = (tagName: string, draggedId: string) => {
    const item = items.find((i) => i.id === draggedId);
    if (item && item.tag !== tagName) {
      handleUpdate(draggedId, { tag: tagName });
    }
  };

  const handleSendToAI = (item: TodoItem) => {
    setChatTask(item);
    setShowChat(true);
  };

  const handleColumnReorder = (draggedTagId: string, targetTagId: string, position: "before" | "after") => {
    if (!draggedTagId || draggedTagId === targetTagId) return;
    setTagInsert(null);
    setDraggingTagId(null);

    const sorted = [...tags].sort((a, b) => a.sort_order - b.sort_order);
    const without = sorted.filter((t) => t.id !== draggedTagId);
    const targetIdx = without.findIndex((t) => t.id === targetTagId);
    if (targetIdx < 0) return;
    const dragged = sorted.find((t) => t.id === draggedTagId);
    if (!dragged) return;

    const insertIdx = position === "before" ? targetIdx : targetIdx + 1;
    without.splice(insertIdx, 0, dragged);
    const orderedIds = without.map((t) => t.id);

    // Optimistic local sort_order update; persist in background.
    setTags((prev) =>
      prev.map((t) => {
        const newIdx = orderedIds.indexOf(t.id);
        return newIdx >= 0 ? { ...t, sort_order: newIdx } : t;
      }),
    );
    reorderTodoTags(orderedIds).catch(console.error);
  };

  // Build columns by tag, ordered by sort_order so column drag-to-reorder
  // is reflected in the render.
  const sortedTags = [...tags].sort((a, b) => a.sort_order - b.sort_order);
  const columnsByTag = sortedTags.map((tag) => ({
    tag,
    items: pendingItems.filter((i) => i.tag === tag.name).sort((a, b) => a.sort_order - b.sort_order),
  }));
  const knownTagNames = new Set(sortedTags.map((t) => t.name));
  const untaggedItems = pendingItems.filter((i) => !knownTagNames.has(i.tag)).sort((a, b) => a.sort_order - b.sort_order);
  if (untaggedItems.length > 0) {
    columnsByTag.push({
      tag: { id: "__other__", name: "Other", user_id: "", color: null, is_default: false, sort_order: 999, created_at: "" },
      items: untaggedItems,
    });
  }

  return (
    <div className={`flex ${showChat ? "-mx-6 md:-mx-8 -mb-12" : ""}`}>
      {/* Main content */}
      <div className={`${showChat ? "flex-1 min-w-0 px-6 md:px-8 pb-12" : "w-full"}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-[#2B2B2B]">Personal To-Dos</h1>
      </div>

      {/* Section 1: Quick Add — labeled grid, 5 columns at xl, wraps below */}
      <section className="mb-6 rounded-lg border border-[#D7CABB] bg-[#FFFDF9] p-4 shadow-[0_8px_24px_rgba(43,43,43,0.04)]">
        <div className="mb-3">
          <h2 className="text-lg font-semibold text-[#2B2B2B]">Add a new to-do item</h2>
        </div>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(320px,1fr)_150px_220px_180px_auto]">
          {/* Task */}
          <div className="rounded-lg border border-[#DDD3C7] bg-[#F6F3EE] px-3 py-2">
            <label
              htmlFor="quick-add-task"
              className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9B948B]"
            >
              Task
            </label>
            <input
              id="quick-add-task"
              ref={inputRef}
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
              placeholder="What needs to be done?"
              className="mt-0.5 w-full bg-transparent text-sm text-[#2B2B2B] outline-none placeholder:text-[#9B948B]"
            />
          </div>

          {/* Category */}
          <div className="rounded-lg border border-[#DDD3C7] bg-[#FFFDF9] px-3 py-2">
            <label
              htmlFor="quick-add-category"
              className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9B948B]"
            >
              Category
            </label>
            <select
              id="quick-add-category"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              className="mt-0.5 w-full bg-transparent text-sm font-medium text-[#2B2B2B] outline-none"
            >
              {sortedTags.map((t) => (
                <option key={t.id} value={t.name}>{t.name}</option>
              ))}
            </select>
          </div>

          {/* Priority pills */}
          <div className="rounded-lg border border-[#DDD3C7] bg-[#FFFDF9] px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9B948B]">
              Priority
            </p>
            <div className="mt-1.5 grid grid-cols-3 gap-1">
              {(["high", "medium", "low"] as const).map((p) => {
                const active = newPriority === p;
                return (
                  <button
                    key={p}
                    onClick={() => setNewPriority(p)}
                    className={`flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors ${
                      active ? PRIORITY_PILL_ACTIVE[p] : "bg-[#F6F3EE] text-[#6F6A64] hover:bg-[#EFEAE2]"
                    }`}
                  >
                    <span className={`h-2 w-2 rounded-full ${PRIORITY_DOT[p]}`} />
                    {p[0].toUpperCase() + p.slice(1)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Deadline */}
          <div className="relative rounded-lg border border-[#DDD3C7] bg-[#FFFDF9] px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9B948B]">
              Deadline
            </p>
            <div className="mt-0.5 flex items-center justify-between gap-2">
              <button
                onClick={() => setShowDeadlinePicker((v) => !v)}
                className={`min-w-0 flex-1 truncate text-left text-sm font-medium outline-none ${
                  newDeadline ? "text-[#2B2B2B]" : "text-[#9B948B]"
                }`}
              >
                {newDeadline ? formatDeadlineShort(newDeadline) : "Set deadline"}
              </button>
              {newDeadline && (
                <button
                  onClick={() => setNewDeadline(null)}
                  className="shrink-0 text-[#9B948B] hover:text-[#D5847A]"
                  aria-label="Clear deadline"
                >
                  ✕
                </button>
              )}
            </div>
            {showDeadlinePicker && (
              <DateTimePicker
                value={newDeadline}
                onChange={(iso) => { setNewDeadline(iso); setShowDeadlinePicker(false); }}
                onClose={() => setShowDeadlinePicker(false)}
              />
            )}
          </div>

          {/* Add Task */}
          <button
            onClick={handleAdd}
            disabled={!newText.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#7FAEE6] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#6A9DDA] disabled:opacity-40"
          >
            <Plus className="h-4 w-4" />
            Add Task
          </button>
        </div>
      </section>

      {/* Section 2 header: title (left) + Add Category + Pending/Done (right) */}
      <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h2 className="text-base font-semibold text-[#2B2B2B]">ToDos Board</h2>
        <div className="flex flex-wrap items-center gap-2">
          {activeStatus === "pending" && (
            addingTag ? (
              <div className="flex items-center gap-1">
                <input
                  autoFocus
                  value={newTagName}
                  onChange={(e) => setNewTagName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddTag();
                    if (e.key === "Escape") { setAddingTag(false); setNewTagName(""); }
                  }}
                  placeholder="Category name"
                  className="w-32 rounded-lg border border-[#DDD3C7] bg-[#FFFDF9] px-2 py-1 text-xs text-[#2B2B2B] outline-none focus:border-[#7FAEE6]"
                />
                <button onClick={handleAddTag} className="px-1 text-xs text-[#7FAEE6]">✓</button>
                <button onClick={() => { setAddingTag(false); setNewTagName(""); }} className="px-1 text-xs text-[#9B948B]">✕</button>
              </div>
            ) : (
              <button
                onClick={() => setAddingTag(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#7FAEE6] px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#6A9DDA]"
              >
                <Plus className="h-4 w-4" />
                Add category
              </button>
            )
          )}
          <div className="flex rounded-lg border border-[#E7DED2] bg-[#F6F3EE] p-1">
            <button
              onClick={() => setActiveStatus("pending")}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
                activeStatus === "pending"
                  ? "bg-[#FFFDF9] text-[#2B2B2B] shadow-sm"
                  : "text-[#6F6A64]"
              }`}
            >
              Pending {pendingItems.length}
            </button>
            <button
              onClick={() => setActiveStatus("done")}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${
                activeStatus === "done"
                  ? "bg-[#FFFDF9] text-[#2B2B2B] shadow-sm"
                  : "text-[#6F6A64]"
              }`}
            >
              Done {doneItems.length}
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      {loading && (
        <div className="text-center py-12 text-sm text-[#9B948B]">Loading...</div>
      )}

      {/* PENDING: Kanban columns */}
      {!loading && activeStatus === "pending" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {columnsByTag.map(({ tag, items: colItems }, idx) => {
            const color = COLUMN_COLORS[idx % COLUMN_COLORS.length];
            const isTagDropTarget = tagInsert?.tagId === tag.id;
            return (
              <div
                key={tag.id}
                className={`relative rounded-lg border bg-[#FFFDF9] p-3 ${
                  isTagDropTarget ? "border-[#7FAEE6] ring-2 ring-[#7FAEE6]/20" : "border-[#E7DED2]"
                }`}
                onDragOver={(e) => {
                  // Tag drag-over: highlight whole column as drop target.
                  // For card drag-over, the inner area handles position-aware drop.
                  if (draggingTagId && draggingTagId !== tag.id && tag.id !== "__other__") {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    const rect = e.currentTarget.getBoundingClientRect();
                    const position = e.clientX < rect.left + rect.width / 2 ? "before" : "after";
                    setTagInsert({ tagId: tag.id, position });
                    return;
                  }
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    if (tagInsert?.tagId === tag.id) setTagInsert(null);
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const draggedTagId = e.dataTransfer.getData("application/x-todo-tag-id");
                  if (draggedTagId && tag.id !== "__other__") {
                    const position = tagInsert?.tagId === tag.id ? tagInsert.position : "after";
                    handleColumnReorder(draggedTagId, tag.id, position);
                    return;
                  }
                  const draggedId = e.dataTransfer.getData("application/x-todo-id") || e.dataTransfer.getData("text/plain");
                  if (draggedId) {
                    if (cardInsert) {
                      handleCardReorder(cardInsert.id, draggedId, cardInsert.position, tag.name);
                    } else {
                      handleCardDropOnColumn(tag.name, draggedId);
                    }
                  }
                }}
              >
                <ColumnHeader
                  tag={tag}
                  color={color}
                  count={colItems.length}
                  onRename={(name) => {
                    updateTodoTag(tag.id, { name });
                    setTags((prev) => prev.map((t) => (t.id === tag.id ? { ...t, name } : t)));
                    setItems((prev) => prev.map((i) => (i.tag === tag.name ? { ...i, tag: name } : i)));
                  }}
                  onDelete={() => {
                    deleteTodoTag(tag.id);
                    setTags((prev) => prev.filter((t) => t.id !== tag.id));
                    setItems((prev) => prev.map((i) => (i.tag === tag.name ? { ...i, tag: "Other" } : i)));
                  }}
                  onDragStart={() => setDraggingTagId(tag.id)}
                  onDragEnd={() => { setDraggingTagId(null); setTagInsert(null); }}
                />
                <div className="mt-3 min-h-[60px] space-y-2">
                  {colItems.length === 0 && (
                    <div className="rounded-lg border border-dashed border-[#DDD3C7] bg-[#F6F3EE] px-3 py-8 text-center text-sm text-[#B1A79B]">
                      No items yet
                    </div>
                  )}
                  {colItems.map((item) => (
                    <TodoCard
                      key={item.id}
                      item={item}
                      onToggle={() => handleToggle(item.id)}
                      onDelete={() => handleDelete(item.id)}
                      onUpdate={(patch) => handleUpdate(item.id, patch)}
                      onSendToAI={() => handleSendToAI(item)}
                      insertBefore={cardInsert?.id === item.id && cardInsert.position === "before"}
                      insertAfter={cardInsert?.id === item.id && cardInsert.position === "after"}
                      onDragOverCard={(position) => setCardInsert({ id: item.id, position })}
                      onDragLeaveCard={() => setCardInsert(null)}
                      onCardDrop={(draggedId, position) => handleCardReorder(item.id, draggedId, position, tag.name)}
                      onDragStartCard={() => setDraggingCardId(item.id)}
                      onDragEndCard={() => { setDraggingCardId(null); setCardInsert(null); }}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* DONE: flat list */}
      {!loading && activeStatus === "done" && (
        <div>
          {doneItems.length === 0 && (
            <div className="text-center py-12 text-sm text-[#9B948B]">No completed items</div>
          )}
          {doneItems.length > 0 && (
            <div className="mb-3 flex items-center gap-3">
              <button
                onClick={() => {
                  if (selectedDone.size === doneItems.length) setSelectedDone(new Set());
                  else setSelectedDone(new Set(doneItems.map((i) => i.id)));
                }}
                className={`w-[18px] h-[18px] rounded border-2 shrink-0 flex items-center justify-center transition-colors ${
                  selectedDone.size === doneItems.length && doneItems.length > 0
                    ? "bg-[#7FAEE6] border-[#7FAEE6] text-white"
                    : "border-[#DDD3C7] hover:border-[#7FAEE6]"
                }`}
              >
                {selectedDone.size === doneItems.length && doneItems.length > 0 && <span className="text-[10px]">✓</span>}
              </button>
              <span className="text-xs text-[#9B948B]">Select all</span>
              {selectedDone.size > 0 && (
                <button
                  onClick={() => {
                    selectedDone.forEach((id) => handleDelete(id));
                    setSelectedDone(new Set());
                  }}
                  className="text-xs px-3 py-1 rounded-lg bg-[#D5847A] text-white hover:bg-[#C06E64] transition-colors"
                >
                  Delete selected ({selectedDone.size})
                </button>
              )}
            </div>
          )}
          {doneItems.map((item) => (
            <div
              key={item.id}
              onClick={() => {
                const next = new Set(selectedDone);
                if (next.has(item.id)) next.delete(item.id);
                else next.add(item.id);
                setSelectedDone(next);
              }}
              className={`flex items-center gap-3 px-4 py-2.5 border-b border-[#E7DED2] hover:bg-[#F1ECE4]/50 transition-colors group cursor-pointer ${
                selectedDone.has(item.id) ? "bg-[#7FAEE6]/5" : ""
              }`}
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${PRIORITY_DOT[item.priority]}`} />
              <button
                onClick={(e) => { e.stopPropagation(); handleToggle(item.id); }}
                className="w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center bg-[#7FB38A] border-[#7FB38A] text-white"
              >
                <span className="text-[10px]">✓</span>
              </button>
              <span className="flex-1 text-sm truncate text-[#9B948B] line-through">{item.text}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#F1ECE4] text-[#9B948B] shrink-0">{item.tag}</span>
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}
                className="text-[#DDD3C7] hover:text-[#D5847A] text-xs opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
              >
                🗑
              </button>
            </div>
          ))}
        </div>
      )}
      </div>{/* end main content */}

      {/* Chat panel — slides in from right */}
      {showChat && (
        <GoalChatPanel
          goalId="__todo__"
          goalContext={{
            goalTitle: "Task Assistant",
            goalDescription: "Help the user break down, plan, and complete their TODO tasks",
            phases: [],
            weeklyTasks: items.filter((i) => !i.completed).map((i) => ({
              dayOfWeek: 0,
              title: `[${i.tag}] ${i.text}${i.deadline ? ` (due: ${i.deadline})` : ""} — ${i.priority} priority`,
              timeSlot: null,
              completed: i.completed,
            })),
            weekSummary: `${items.filter((i) => !i.completed).length} pending, ${items.filter((i) => i.completed).length} done`,
          }}
          taskContext={chatTask ? {
            id: chatTask.id,
            weekly_plan_id: "",
            day_of_week: 0,
            title: chatTask.text,
            description: `Category: ${chatTask.tag}, Priority: ${chatTask.priority}${chatTask.deadline ? `, Deadline: ${chatTask.deadline}` : ""}`,
            time_slot: chatTask.deadline,
            time_estimate_minutes: null,
            completed: chatTask.completed,
            completed_at: chatTask.completed_at,
            sort_order: chatTask.sort_order,
          } : undefined}
          onClose={() => { setShowChat(false); setChatTask(null); }}
          panelTitle="Task Assistant"
        />
      )}
    </div>
  );
}
