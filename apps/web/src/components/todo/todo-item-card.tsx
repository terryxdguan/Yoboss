"use client";

import { useState } from "react";
import { DateTimePicker } from "./date-time-picker";
import type { TodoItem } from "@/lib/types/database";

const PRIORITY_DOT: Record<string, string> = {
  high: "bg-[#D5847A]",
  medium: "bg-[#D4B06A]",
  low: "bg-[#7FB38A]",
};

/** Format deadline — time-only when todayOnly is true */
function formatDeadline(d: string, todayOnly?: boolean): string {
  const date = new Date(d);
  const h = date.getHours();
  const mins = date.getMinutes();

  if (todayOnly) {
    // Time-only for today view
    if (h === 0 && mins === 0) return "12:00 AM";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    const ap = h >= 12 ? "PM" : "AM";
    return `${h12}:${String(mins).padStart(2, "0")} ${ap}`;
  }

  const month = date.toLocaleString("en", { month: "short" });
  const day = date.getDate();
  const year = date.getFullYear();
  if (h === 0 && mins === 0) return `${month} ${day}, ${year}`;
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const ap = h >= 12 ? "PM" : "AM";
  return `${month} ${day}, ${year} ${h12}:${String(mins).padStart(2, "0")}${ap}`;
}

function isOverdue(item: { deadline: string | null; completed: boolean }): boolean {
  if (!item.deadline || item.completed) return false;
  return new Date(item.deadline) < new Date();
}

/** Border color variants */
export type CardVariant = "default" | "schedule" | "todo" | "high";

const VARIANT_BORDER: Record<CardVariant, string> = {
  default: "border-[#E7DED2]",
  schedule: "border-2 border-[#7FAEE6]/40",   // blue
  todo: "border-2 border-[#7FB38A]/40",       // green
  high: "border-2 border-[#D5847A]/50",       // red
};

const VARIANT_TIME_COLOR: Record<CardVariant, string> = {
  default: "text-[#9B948B]",
  schedule: "text-[#7FAEE6]",   // blue
  todo: "text-[#7FB38A]",       // green
  high: "text-[#D5847A]",       // red
};

interface TodoItemCardProps {
  item: {
    id: string;
    text: string;
    completed: boolean;
    deadline: string | null;
    priority: "high" | "medium" | "low";
    tag?: string;
  };
  /** Display-only time slot (e.g. "9:00-9:45 AM") — shown instead of deadline for schedule items */
  timeSlot?: string | null;
  /** Source label shown on Row 3 (e.g. "6-Day Seattle Trip" or "Work") */
  sourceLabel?: string | null;
  /** Border color variant */
  variant?: CardVariant;
  /** Show deadline as time-only (no date) */
  timeOnly?: boolean;
  onToggle: () => void;
  onUpdate: (patch: Partial<Pick<TodoItem, "text" | "deadline" | "priority">>) => void;
  onDelete: () => void;
  onSendToAI?: () => void;
  className?: string;
}

export function TodoItemCard({
  item, timeSlot, sourceLabel, variant = "default", timeOnly,
  onToggle, onUpdate, onDelete, onSendToAI, className,
}: TodoItemCardProps) {
  const overdue = isOverdue({ deadline: item.deadline, completed: item.completed });
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
    <div className={`rounded-lg border bg-[#FFFDF9] px-3 py-2 group/card hover:border-[#DDD3C7] transition-colors ${VARIANT_BORDER[variant]} ${className || ""}`}>
      {/* Row 1: checkbox + title + actions */}
      <div className="flex items-start gap-2">
        <button
          onClick={onToggle}
          className={`w-[18px] h-[18px] mt-0.5 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${
            item.completed ? "border-[#7FB38A] bg-[#7FB38A]" : "border-[#DDD3C7] hover:border-[#7FAEE6]"
          }`}
        >
          {item.completed && <span className="text-white text-[10px]">✓</span>}
        </button>
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
            className={`text-sm font-medium leading-snug flex-1 break-words cursor-text ${item.completed ? "text-[#9B948B] line-through" : "text-[#2B2B2B]"}`}
          >
            {item.text}
          </span>
        )}
        {onSendToAI && (
          <button
            onClick={onSendToAI}
            className="text-[#7FB38A] hover:text-[#3D7A5A] text-[13px] shrink-0 opacity-0 group-hover/card:opacity-100 transition-colors"
            title="Send to Team"
          >
            ▶
          </button>
        )}
        <button
          onClick={onDelete}
          className="text-[#DDD3C7] hover:text-[#D5847A] text-[10px] shrink-0 opacity-0 group-hover/card:opacity-100 transition-all"
        >
          ✕
        </button>
      </div>

      {/* Row 2: time/deadline + priority */}
      <div className="mt-1.5 ml-[26px] flex items-center gap-2 text-xs">
        {timeSlot ? (
          /* Schedule items: display-only time slot */
          <span className={`flex items-center gap-1 ${VARIANT_TIME_COLOR[variant]}`}>
            🕐 <span>{timeSlot}</span>
          </span>
        ) : editingDeadline ? (
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
              className={`flex items-center gap-1 hover:opacity-80 whitespace-nowrap ${overdue ? "text-[#D5847A] font-medium" : VARIANT_TIME_COLOR[variant]}`}
            >
              {overdue ? "⏰" : "🕐"}
              <span>{formatDeadline(item.deadline, timeOnly)}</span>
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

      {/* Row 3: source label (Goal name or category tag) */}
      {sourceLabel && (
        <div className="mt-1 ml-[26px]">
          <span className="text-[11px] text-[#9B948B] bg-[#F1ECE4] px-1.5 py-0.5 rounded">
            {sourceLabel}
          </span>
        </div>
      )}
    </div>
  );
}
