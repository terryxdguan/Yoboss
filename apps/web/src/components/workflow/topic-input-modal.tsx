"use client";

import { useState } from "react";
import { X, Play } from "lucide-react";
import { useTranslations } from "next-intl";

interface TopicInputModalProps {
  templateName: string;
  placeholder?: string;
  onSubmit: (topic: string) => void;
  onClose: () => void;
}

export function TopicInputModal({ templateName, placeholder, onSubmit, onClose }: TopicInputModalProps) {
  const t = useTranslations("workflows.topicModal");
  const [topic, setTopic] = useState("");

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative bg-[#FFFDF9] rounded-2xl shadow-[0_24px_64px_rgba(43,43,43,0.15)] w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-3">
          <div>
            <h2 className="text-lg font-semibold text-[#2B2B2B]">{t("title")}</h2>
            <p className="text-xs text-[#9B948B] mt-0.5">{templateName}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-[#6F6A64] hover:bg-[#F1ECE4]">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 pb-6">
          <label className="text-sm font-medium text-[#2B2B2B] block mb-2">
            What topic or task should this workflow focus on?
          </label>
          <textarea
            autoFocus
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Tab" && !topic.trim()) {
                e.preventDefault();
                const example = (placeholder || "").replace(/^e\.g\.\,?\s*/, "");
                if (example) setTopic(example);
              }
              if (e.key === "Enter" && !e.shiftKey && topic.trim()) {
                e.preventDefault();
                onSubmit(topic.trim());
              }
            }}
            placeholder={placeholder || "e.g., Tesla vs Rivian vs Lucid in the EV market"}
            rows={3}
            className="w-full px-4 py-3 text-sm bg-[#FFFDF9] border border-[#DDD3C7] rounded-xl text-[#2B2B2B] placeholder:text-[#9B948B] outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF] resize-none leading-relaxed"
          />
          <p className="text-[10px] text-[#9B948B] mt-1">
            Press <kbd className="px-1 py-0.5 rounded bg-[#F1ECE4] text-[#6F6A64] font-mono text-[9px]">Tab</kbd> to use the example topic. It will be injected into each step for this run only.
          </p>

          {/* Action */}
          <div className="mt-4">
            <button
              onClick={() => topic.trim() && onSubmit(topic.trim())}
              disabled={!topic.trim()}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#007AFF] text-white text-sm font-medium hover:bg-[#0066D6] transition-colors disabled:opacity-40"
            >
              <Play className="h-4 w-4" />
              Run
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
