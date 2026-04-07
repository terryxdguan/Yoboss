"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import {
  getTodos, addTodo, updateTodo, deleteTodo, reorderTodos,
  getTodoTags, addTodoTag, updateTodoTag, deleteTodoTag,
} from "@/lib/db/actions";
import type { TodoItem, TodoTag } from "@/lib/types/database";
import { DateTimePicker } from "@/components/todo/date-time-picker";
import { GoalChatPanel } from "@/components/goals/goal-chat-panel";

const PRIORITY_DOT: Record<string, string> = { high: "bg-[#C65B52]", medium: "bg-[#C6923D]", low: "bg-[#4D8B6A]" };
const COLUMN_COLORS = [
  { bg: "bg-[#4D8B6A]/10", text: "text-[#4D8B6A]", border: "border-[#4D8B6A]/30" },
  { bg: "bg-[#C6923D]/10", text: "text-[#C6923D]", border: "border-[#C6923D]/30" },
  { bg: "bg-[#626A73]/10", text: "text-[#626A73]", border: "border-[#626A73]/30" },
  { bg: "bg-[#4C7CF0]/10", text: "text-[#4C7CF0]", border: "border-[#4C7CF0]/30" },
  { bg: "bg-[#7C6DB0]/10", text: "text-[#7C6DB0]", border: "border-[#7C6DB0]/30" },
  { bg: "bg-[#C65B52]/10", text: "text-[#C65B52]", border: "border-[#C65B52]/30" },
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
      className="relative rounded-lg border border-[#E6E1D8] bg-white px-3 py-2 group/card hover:border-[#D8D1C6] transition-colors cursor-grab active:cursor-grabbing"
    >
      {insertBefore && <div className="absolute -top-1.5 left-0 right-0 h-0.5 bg-[#4C7CF0] rounded-full z-10 pointer-events-none" />}
      {insertAfter && <div className="absolute -bottom-1.5 left-0 right-0 h-0.5 bg-[#4C7CF0] rounded-full z-10 pointer-events-none" />}
      {/* Row 1: checkbox + title + actions */}
      <div className="flex items-start gap-2">
        <button
          onClick={onToggle}
          className="w-[18px] h-[18px] mt-0.5 rounded-full border-2 border-[#D8D1C6] hover:border-[#4C7CF0] shrink-0 flex items-center justify-center transition-colors"
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
            className="text-sm text-[#1E2227] font-medium leading-snug flex-1 bg-[#F7F5F1] border border-[#4C7CF0] rounded px-1.5 py-0.5 outline-none"
          />
        ) : (
          <span
            onDoubleClick={() => { setEditText(item.text); setEditingText(true); }}
            className="text-sm text-[#1E2227] font-medium leading-snug flex-1 break-words cursor-text"
          >
            {item.text}
          </span>
        )}
        <button
          onClick={onSendToAI}
          className="text-[#4D8B6A] hover:text-[#3D7A5A] text-[13px] shrink-0 transition-colors"
          title="Send to AI"
        >
          ▶
        </button>
        <button
          onClick={onDelete}
          className="text-[#D8D1C6] hover:text-[#C65B52] text-[10px] shrink-0 transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Row 2: deadline + priority */}
      <div className="mt-1.5 ml-[26px] flex items-center gap-2 text-xs">
        {editingDeadline ? (
          <span className="relative inline-block">
            <span className="text-xs px-1 py-0.5 rounded bg-[#F1EEE8] border border-[#4C7CF0] text-[#626A73] inline-block">
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
              className={`flex items-center gap-1 hover:opacity-80 whitespace-nowrap ${overdue ? "text-[#C65B52] font-medium" : "text-[#8C939B]"}`}
            >
              {overdue ? "⏰" : "📅"}
              <span>{formatDeadline(item.deadline)}</span>
            </button>
            <button
              onClick={() => onUpdate({ deadline: null })}
              className="text-[#D8D1C6] hover:text-[#C65B52] opacity-0 group-hover/card:opacity-100 transition-opacity"
            >
              ✕
            </button>
          </span>
        ) : (
          <button
            onClick={() => setEditingDeadline(true)}
            className="text-[#D8D1C6] hover:text-[#8C939B] transition-colors"
          >
            + deadline
          </button>
        )}

        <span className="ml-auto" />

        <span className={`w-2 h-2 rounded-full ${PRIORITY_DOT[item.priority]}`} />
        <select
          value={item.priority}
          onChange={(e) => onUpdate({ priority: e.target.value as TodoItem["priority"] })}
          className="text-[11px] px-1 py-0.5 rounded bg-transparent border border-transparent hover:border-[#E6E1D8] text-[#8C939B] outline-none cursor-pointer"
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
  onRename,
  onDelete,
}: {
  tag: { id: string; name: string };
  color: { bg: string; text: string; border: string };
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(tag.name);

  const commit = () => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== tag.name) onRename(trimmed);
    else setEditName(tag.name);
    setEditing(false);
  };

  return (
    <div className={`flex items-center justify-between px-3 py-1.5 rounded-t-lg border ${color.border} ${color.bg} group`}>
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
          className={`text-xs font-semibold ${color.text} bg-transparent border-b border-current outline-none w-full`}
        />
      ) : (
        <span
          onDoubleClick={() => { if (tag.id !== "__other__") { setEditName(tag.name); setEditing(true); } }}
          className={`text-xs font-semibold ${color.text} ${tag.id !== "__other__" ? "cursor-text" : ""}`}
        >
          {tag.name}
        </span>
      )}
      {tag.id !== "__other__" && (
        <button
          onClick={onDelete}
          className="text-[#8C939B] hover:text-[#C65B52] text-[10px] opacity-0 group-hover:opacity-100 transition-opacity ml-2 shrink-0"
        >
          ✕
        </button>
      )}
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
  const [addingTag, setAddingTag] = useState(false);
  const [newTagName, setNewTagName] = useState("");
  const [selectedDone, setSelectedDone] = useState<Set<string>>(new Set());
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
  const [cardInsert, setCardInsert] = useState<{ id: string; position: "before" | "after" } | null>(null);
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
    const item = await addTodo(text, newTag || "Work", "medium");
    setItems((prev) => [...prev, item]);
    setNewText("");
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

  // Build columns by tag
  const columnsByTag = tags.map((tag) => ({
    tag,
    items: pendingItems.filter((i) => i.tag === tag.name).sort((a, b) => a.sort_order - b.sort_order),
  }));
  const knownTagNames = new Set(tags.map((t) => t.name));
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
        <h1 className="text-2xl font-semibold text-[#1E2227]">TODO List</h1>
      </div>

      {/* Task bar */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        {/* Pending/Done tabs */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setActiveStatus("pending")}
            className={`text-xs px-3 py-1.5 rounded-full transition-colors ${
              activeStatus === "pending"
                ? "bg-[#4C7CF0] text-white"
                : "text-[#8C939B] hover:text-[#1E2227] hover:bg-[#F1EEE8]"
            }`}
          >
            Pending ({pendingItems.length})
          </button>
          <button
            onClick={() => setActiveStatus("done")}
            className={`text-xs px-3 py-1.5 rounded-full transition-colors ${
              activeStatus === "done"
                ? "bg-[#4C7CF0] text-white"
                : "text-[#8C939B] hover:text-[#1E2227] hover:bg-[#F1EEE8]"
            }`}
          >
            Done ({doneItems.length})
          </button>
        </div>

        {/* Add input (pending only) */}
        {activeStatus === "pending" && (
          <>
            <input
              ref={inputRef}
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
              placeholder="Add a new task..."
              className="flex-1 text-sm px-3 py-1.5 rounded-lg bg-white border border-[#D8D1C6] text-[#1E2227] placeholder-[#8C939B] outline-none focus:border-[#4C7CF0] focus:ring-1 focus:ring-[#4C7CF0]/30"
            />
            <select
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              className="text-xs px-2 py-1.5 rounded-lg bg-white border border-[#D8D1C6] text-[#626A73] outline-none"
            >
              {tags.map((t) => (
                <option key={t.id} value={t.name}>{t.name}</option>
              ))}
            </select>
            <button
              onClick={handleAdd}
              disabled={!newText.trim()}
              className="text-sm px-6 py-1.5 rounded-lg bg-[#4C7CF0] hover:bg-[#3F6FE4] text-white font-medium transition-colors disabled:opacity-40"
            >
              Add
            </button>
          </>
        )}

        {/* New Category */}
        {activeStatus === "pending" && (
          addingTag ? (
            <div className="flex items-center gap-1 shrink-0">
              <input
                autoFocus
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddTag();
                  if (e.key === "Escape") { setAddingTag(false); setNewTagName(""); }
                }}
                placeholder="Category name"
                className="text-xs px-2 py-1 rounded-lg bg-white border border-[#D8D1C6] text-[#1E2227] w-28 outline-none focus:border-[#4C7CF0]"
              />
              <button onClick={handleAddTag} className="text-xs text-[#4C7CF0]">✓</button>
              <button onClick={() => { setAddingTag(false); setNewTagName(""); }} className="text-xs text-[#8C939B]">✕</button>
            </div>
          ) : (
            <button
              onClick={() => setAddingTag(true)}
              className="text-xs px-3 py-1 rounded-lg border border-dashed border-[#D8D1C6] text-[#8C939B] hover:text-[#4C7CF0] hover:border-[#4C7CF0] transition-colors shrink-0"
            >
              + New Category
            </button>
          )
        )}
      </div>

      {/* Content */}
      {loading && (
        <div className="text-center py-12 text-sm text-[#8C939B]">Loading...</div>
      )}

      {/* PENDING: Kanban columns */}
      {!loading && activeStatus === "pending" && (
        <div className="flex gap-4 items-start flex-wrap">
          {columnsByTag.map(({ tag, items: colItems }, idx) => {
            const color = COLUMN_COLORS[idx % COLUMN_COLORS.length];
            return (
              <div
                key={tag.id}
                className="w-[300px] shrink-0"
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                }}
                onDrop={(e) => {
                  e.preventDefault();
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
                />
                <div className="space-y-2 mt-2 min-h-[60px]">
                  {colItems.length === 0 && (
                    <div className="text-xs text-[#D8D1C6] text-center py-6">No items</div>
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
            <div className="text-center py-12 text-sm text-[#8C939B]">No completed items</div>
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
                    ? "bg-[#4C7CF0] border-[#4C7CF0] text-white"
                    : "border-[#D8D1C6] hover:border-[#4C7CF0]"
                }`}
              >
                {selectedDone.size === doneItems.length && doneItems.length > 0 && <span className="text-[10px]">✓</span>}
              </button>
              <span className="text-xs text-[#8C939B]">Select all</span>
              {selectedDone.size > 0 && (
                <button
                  onClick={() => {
                    selectedDone.forEach((id) => handleDelete(id));
                    setSelectedDone(new Set());
                  }}
                  className="text-xs px-3 py-1 rounded-lg bg-[#C65B52] text-white hover:bg-[#B04A42] transition-colors"
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
              className={`flex items-center gap-3 px-4 py-2.5 border-b border-[#E6E1D8] hover:bg-[#F1EEE8]/50 transition-colors group cursor-pointer ${
                selectedDone.has(item.id) ? "bg-[#4C7CF0]/5" : ""
              }`}
            >
              <span className={`w-2 h-2 rounded-full shrink-0 ${PRIORITY_DOT[item.priority]}`} />
              <button
                onClick={(e) => { e.stopPropagation(); handleToggle(item.id); }}
                className="w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center bg-[#4D8B6A] border-[#4D8B6A] text-white"
              >
                <span className="text-[10px]">✓</span>
              </button>
              <span className="flex-1 text-sm truncate text-[#8C939B] line-through">{item.text}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#F1EEE8] text-[#8C939B] shrink-0">{item.tag}</span>
              <button
                onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}
                className="text-[#D8D1C6] hover:text-[#C65B52] text-xs opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
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
