"use client";

// Settings UI for User Memory (long-term, cross-session prefs).
// Reads the user's current entries, lets them edit/delete each one,
// or wipe everything. Mutations call the server actions in db/actions.ts;
// list state is held client-side for snappy feedback after each change.

import { useState, useTransition } from "react";
import { Trash2, AlertTriangle } from "lucide-react";
import {
  updateUserMemoryEntry,
  deleteUserMemoryEntry,
  clearAllUserMemory,
} from "@/lib/db/actions";
import type { UserMemory, UserMemoryImportance } from "@/lib/types/database";

const IMPORTANCE_OPTIONS: { value: UserMemoryImportance; label: string }[] = [
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

const IMPORTANCE_BADGE: Record<UserMemoryImportance, string> = {
  high: "bg-[#D5847A]/10 text-[#9C5651]",
  medium: "bg-[#7FAEE6]/10 text-[#4A7AB0]",
  low: "bg-[#9B948B]/10 text-[#6F6A64]",
};

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function UserMemorySection({
  initialEntries,
}: {
  initialEntries: UserMemory[];
}) {
  const [entries, setEntries] = useState<UserMemory[]>(initialEntries);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmingClearAll, setConfirmingClearAll] = useState(false);

  const startEdit = (entry: UserMemory) => {
    setEditingId(entry.id);
    setDraft(entry.content);
    setError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft("");
  };

  const saveEdit = (entry: UserMemory) => {
    const next = draft.trim();
    if (!next) {
      setError("Memory content cannot be empty.");
      return;
    }
    if (next === entry.content) {
      cancelEdit();
      return;
    }
    setEntries((prev) =>
      prev.map((e) => (e.id === entry.id ? { ...e, content: next } : e)),
    );
    cancelEdit();
    startTransition(async () => {
      try {
        await updateUserMemoryEntry(entry.id, { content: next });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Save failed");
        // Revert optimistic update so DB and UI agree
        setEntries((prev) =>
          prev.map((e) => (e.id === entry.id ? entry : e)),
        );
      }
    });
  };

  const changeImportance = (entry: UserMemory, importance: UserMemoryImportance) => {
    setEntries((prev) =>
      prev.map((e) => (e.id === entry.id ? { ...e, importance } : e)),
    );
    startTransition(async () => {
      try {
        await updateUserMemoryEntry(entry.id, { importance });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Update failed");
        setEntries((prev) =>
          prev.map((e) => (e.id === entry.id ? entry : e)),
        );
      }
    });
  };

  const removeOne = (entry: UserMemory) => {
    setEntries((prev) => prev.filter((e) => e.id !== entry.id));
    startTransition(async () => {
      try {
        await deleteUserMemoryEntry(entry.id);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Delete failed");
        // Restore on failure
        setEntries((prev) => [...prev, entry]);
      }
    });
  };

  const clearAll = () => {
    const previous = entries;
    setEntries([]);
    setConfirmingClearAll(false);
    startTransition(async () => {
      try {
        await clearAllUserMemory();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Clear failed");
        setEntries(previous);
      }
    });
  };

  return (
    <section className="bg-white border border-[#E7DED2] rounded-2xl p-6">
      <div className="flex items-start justify-between gap-6 mb-4">
        <div>
          <h2 className="text-base font-semibold text-[#2B2B2B]">
            User memory
          </h2>
          <p className="mt-1 text-sm text-[#6F6A64]">
            Long-term preferences your agents have picked up across chats.
            They&apos;re injected into every conversation so you don&apos;t have to
            repeat yourself. Edit or delete anything that&apos;s wrong or stale.
          </p>
        </div>
        {entries.length > 0 && (
          <button
            type="button"
            onClick={() => setConfirmingClearAll(true)}
            className="shrink-0 text-xs text-[#9B948B] hover:text-[#D5847A] underline-offset-2 hover:underline"
          >
            Clear all
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-[#D5847A]/30 bg-[#D5847A]/5 px-3 py-2 text-xs text-[#9C5651]">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {confirmingClearAll && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-[#D5847A]/30 bg-[#D5847A]/5 px-3 py-2 text-xs text-[#9C5651]">
          <span>Delete all {entries.length} memory entries? This cannot be undone.</span>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setConfirmingClearAll(false)}
              className="px-2 py-1 rounded text-[#6F6A64] hover:text-[#2B2B2B]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={clearAll}
              className="px-2 py-1 rounded bg-[#D5847A] text-white hover:bg-[#C57570]"
            >
              Delete all
            </button>
          </div>
        </div>
      )}

      {entries.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[#E7DED2] bg-[#F8F5EF]/50 px-4 py-8 text-center text-sm text-[#9B948B]">
          No memory yet. Your agents will start remembering preferences after a
          few longer conversations.
        </div>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => {
            const isEditing = editingId === entry.id;
            return (
              <li
                key={entry.id}
                className="group rounded-lg border border-[#E7DED2] bg-[#FFFFFF] px-3 py-2.5 hover:border-[#DDD3C7]"
              >
                <div className="flex items-start gap-2.5">
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${IMPORTANCE_BADGE[entry.importance]}`}
                  >
                    {entry.importance}
                  </span>
                  <div className="min-w-0 flex-1">
                    {isEditing ? (
                      <textarea
                        autoFocus
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        onBlur={() => saveEdit(entry)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                            e.preventDefault();
                            saveEdit(entry);
                          } else if (e.key === "Escape") {
                            e.preventDefault();
                            cancelEdit();
                          }
                        }}
                        rows={2}
                        className="block w-full resize-none rounded border border-[#7FAEE6] bg-white px-2 py-1 text-sm text-[#2B2B2B] focus:outline-none focus:ring-2 focus:ring-[#7FAEE6]/30"
                      />
                    ) : (
                      <p
                        className="cursor-text text-sm leading-snug text-[#2B2B2B]"
                        onDoubleClick={() => startEdit(entry)}
                        title="Double-click to edit"
                      >
                        {entry.content}
                      </p>
                    )}
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-[#9B948B]">
                      {entry.category && (
                        <>
                          <span>{entry.category}</span>
                          <span>·</span>
                        </>
                      )}
                      <span>added {formatRelative(entry.created_at)}</span>
                      {entry.last_used_at !== entry.created_at && (
                        <>
                          <span>·</span>
                          <span>used {formatRelative(entry.last_used_at)}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <select
                      value={entry.importance}
                      onChange={(e) =>
                        changeImportance(
                          entry,
                          e.target.value as UserMemoryImportance,
                        )
                      }
                      className="rounded border border-[#E7DED2] bg-white px-1.5 py-1 text-[11px] text-[#6F6A64] focus:outline-none focus:ring-1 focus:ring-[#7FAEE6]"
                      aria-label="Importance"
                    >
                      {IMPORTANCE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => removeOne(entry)}
                      className="rounded p-1.5 text-[#9B948B] opacity-0 transition-opacity hover:bg-[#D5847A]/10 hover:text-[#D5847A] group-hover:opacity-100"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
