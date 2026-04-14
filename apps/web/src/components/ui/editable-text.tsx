"use client";

import { useState, useEffect, useRef, type KeyboardEvent } from "react";

interface EditableTextProps {
  /** The current text value. */
  value: string;
  /**
   * Called when the user commits a change (Enter or blur with a different
   * value). Parent should do optimistic UI + persist to DB and may throw to
   * signal failure; this component does not handle rollback itself.
   */
  onSave: (next: string) => void | Promise<void>;
  /** When true, renders a textarea (multi-line). Default: single-line input. */
  multiline?: boolean;
  /** Placeholder shown inside the input while editing. */
  placeholder?: string;
  /**
   * Tailwind classes to apply to BOTH the static span and the edit input,
   * so the layout doesn't shift when flipping between the two modes.
   * Typography classes (text-2xl / font-semibold / etc.) belong here.
   */
  className?: string;
  /**
   * Text to show in the static view when value is empty. Typically a
   * muted "Click to add description…" hint so users discover the affordance.
   */
  emptyHint?: string;
  /** Number of rows for multiline mode. Default 3. */
  rows?: number;
}

/**
 * Double-click-to-edit text component.
 *
 * - Static mode: renders a <span> that highlights on hover
 * - Edit mode (entered via double-click): renders an <input> or <textarea>
 *   with the same className so typography doesn't jump
 * - Enter commits (Shift+Enter for multiline inserts a newline), Escape
 *   cancels, blur commits
 * - Empty values render `emptyHint` in muted style but still double-click
 *   to edit; useful for letting the user fill in a missing description
 */
export function EditableText({
  value,
  onSave,
  multiline = false,
  placeholder,
  className = "",
  emptyHint,
  rows = 3,
}: EditableTextProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  // Keep draft in sync with external value when not editing. This handles
  // cases where the value is updated from another source (e.g. AI
  // regenerates the plan) while the user isn't actively editing.
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  // Focus + select all when entering edit mode so the user can start typing
  // immediately or tap to move the caret.
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const commit = async () => {
    const next = draft.trim();
    // No-op if nothing changed — avoids unnecessary DB writes and
    // state-flip jitter.
    if (next === (value ?? "").trim()) {
      setEditing(false);
      return;
    }
    try {
      await onSave(next);
    } finally {
      setEditing(false);
    }
  };

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  const handleKeyDown = (
    e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    if (e.key === "Escape") {
      e.preventDefault();
      cancel();
      return;
    }
    // Enter commits. For multiline, allow Shift+Enter to insert a newline.
    if (e.key === "Enter" && !(multiline && e.shiftKey)) {
      e.preventDefault();
      commit();
    }
  };

  if (editing) {
    const commonProps = {
      value: draft,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setDraft(e.target.value),
      onKeyDown: handleKeyDown,
      onBlur: commit,
      placeholder,
      className: `${className} bg-[#FFFDF9] border border-[#7FAEE6] rounded-md px-2 py-1 -mx-2 focus:outline-none focus:ring-2 focus:ring-[#7FAEE6]/30 w-full`,
    };
    if (multiline) {
      return (
        <textarea
          ref={(el) => {
            inputRef.current = el;
          }}
          rows={rows}
          {...commonProps}
          className={`${commonProps.className} resize-none`}
        />
      );
    }
    return (
      <input
        ref={(el) => {
          inputRef.current = el;
        }}
        type="text"
        {...commonProps}
      />
    );
  }

  const hasValue = Boolean(value && value.trim());
  const displayText = hasValue ? value : emptyHint ?? "";

  return (
    <span
      onDoubleClick={() => setEditing(true)}
      title="Double-click to edit"
      className={`${className} ${
        hasValue ? "" : "italic text-[#9B948B]"
      } inline-block cursor-text rounded-md px-2 -mx-2 py-0.5 -my-0.5 hover:bg-[#F1ECE4]/70 transition-colors`}
    >
      {displayText}
    </span>
  );
}
