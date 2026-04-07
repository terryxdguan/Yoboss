"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { X, FileText, Check } from "lucide-react";
import { getGoalNote, upsertGoalNote } from "@/lib/db/actions";

interface NotesPanelProps {
  goalId: string;
  onClose: () => void;
}

export function NotesPanel({ goalId, onClose }: NotesPanelProps) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef("");

  useEffect(() => {
    getGoalNote(goalId).then((note) => {
      const text = note?.content || "";
      setContent(text);
      lastSavedRef.current = text;
      setLoading(false);
    });
  }, [goalId]);

  const save = useCallback(
    async (text: string) => {
      if (text === lastSavedRef.current) return;
      setSaveStatus("saving");
      try {
        await upsertGoalNote(goalId, text);
        lastSavedRef.current = text;
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 1500);
      } catch (err) {
        console.error("Save note error:", err);
        setSaveStatus("idle");
      }
    },
    [goalId]
  );

  const handleChange = (text: string) => {
    setContent(text);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => save(text), 1000);
  };

  const handleBlur = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    save(content);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div className="w-96 shrink-0 border-l border-[#E6E1D8] bg-[#F7F5F1] flex flex-col h-[calc(100vh-96px)] sticky top-0">
      {/* Header */}
      <div className="flex items-center justify-between h-14 px-4 border-b border-[#E6E1D8]">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-[#4C7CF0]" />
          <span className="text-sm font-medium text-[#1E2227]">Notes</span>
          {saveStatus === "saving" && (
            <span className="text-[10px] text-[#8C939B]">Saving...</span>
          )}
          {saveStatus === "saved" && (
            <span className="text-[10px] text-[#4D8B6A] flex items-center gap-0.5">
              <Check className="h-3 w-3" />
              Saved
            </span>
          )}
        </div>
        <button
          onClick={() => { handleBlur(); onClose(); }}
          className="p-1.5 rounded-md text-[#626A73] hover:bg-[#F1EEE8] hover:text-[#1E2227] transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Editor */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-[#8C939B]">Loading...</p>
        </div>
      ) : (
        <textarea
          value={content}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={handleBlur}
          placeholder="Write your notes here...&#10;&#10;Supports plain text and markdown formatting."
          className="flex-1 px-4 py-4 text-sm text-[#1E2227] bg-transparent outline-none resize-none placeholder:text-[#C4BFB6] leading-relaxed"
          autoFocus
        />
      )}
    </div>
  );
}
