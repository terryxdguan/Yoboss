"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { X, FileText, Check } from "lucide-react";
import { useTranslations } from "next-intl";
import { getGoalNote, upsertGoalNote } from "@/lib/db/actions";

interface NotesPanelProps {
  goalId: string;
  onClose: () => void;
}

export function NotesPanel({ goalId, onClose }: NotesPanelProps) {
  const t = useTranslations("goals.notes");
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
    <div className="fixed right-0 top-16 bottom-0 z-[45] w-96 border-l border-[#E7DED2] bg-[#FFFDF9] flex flex-col shadow-[0_0_48px_rgba(30,34,39,0.08)]">
      {/* Header */}
      <div className="flex items-center justify-between h-14 px-4 border-b border-[#E7DED2]">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-[#007AFF]" />
          <span className="text-sm font-medium text-[#2B2B2B]">{t("title")}</span>
          {saveStatus === "saving" && (
            <span className="text-[10px] text-[#9B948B]">{t("saving")}</span>
          )}
          {saveStatus === "saved" && (
            <span className="text-[10px] text-[#7FB38A] flex items-center gap-0.5">
              <Check className="h-3 w-3" />
              {t("saved")}
            </span>
          )}
        </div>
        <button
          onClick={() => { handleBlur(); onClose(); }}
          className="p-1.5 rounded-md text-[#6F6A64] hover:bg-[#F1ECE4] hover:text-[#2B2B2B] transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Editor */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-sm text-[#9B948B]">{t("loading")}</p>
        </div>
      ) : (
        <textarea
          value={content}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={handleBlur}
          placeholder={t("placeholder")}
          className="flex-1 px-4 py-4 text-sm text-[#2B2B2B] bg-transparent outline-none resize-none placeholder:text-[#9B948B] leading-relaxed"
          autoFocus
        />
      )}
    </div>
  );
}
