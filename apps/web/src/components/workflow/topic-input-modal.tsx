"use client";

import { useState } from "react";
import { X, Play, Save } from "lucide-react";

interface TopicInputModalProps {
  templateName: string;
  placeholder?: string;
  onSubmit: (topic: string, autoRun: boolean) => void;
  onClose: () => void;
}

export function TopicInputModal({ templateName, placeholder, onSubmit, onClose }: TopicInputModalProps) {
  const [topic, setTopic] = useState("");

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative bg-[#FFFDF9] rounded-2xl shadow-[0_24px_64px_rgba(43,43,43,0.15)] w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-3">
          <div>
            <h2 className="text-lg font-semibold text-[#2B2B2B]">Use Template</h2>
            <p className="text-xs text-[#9B948B] mt-0.5">{templateName}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-[#6F6A64] hover:bg-[#F1ECE4]">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 pb-6">
          <label className="text-sm font-medium text-[#2B2B2B] block mb-2">
            What specific topic or task do you want to work on?
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
            }}
            placeholder={placeholder || "e.g., Tesla vs Rivian vs Lucid in the EV market"}
            rows={3}
            className="w-full px-4 py-3 text-sm bg-[#FFFDF9] border border-[#DDD3C7] rounded-xl text-[#2B2B2B] placeholder:text-[#9B948B] outline-none focus:ring-2 focus:ring-[#7FAEE6]/30 focus:border-[#7FAEE6] resize-none leading-relaxed"
          />
          <p className="text-[10px] text-[#9B948B] mt-1">Press <kbd className="px-1 py-0.5 rounded bg-[#F1ECE4] text-[#6F6A64] font-mono text-[9px]">Tab</kbd> to use the example topic</p>

          {/* Actions */}
          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={() => topic.trim() && onSubmit(topic.trim(), true)}
              disabled={!topic.trim()}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#7FAEE6] text-white text-sm font-medium hover:bg-[#6A9DDA] transition-colors disabled:opacity-40"
            >
              <Play className="h-4 w-4" />
              Create & Run
            </button>
            <button
              onClick={() => topic.trim() && onSubmit(topic.trim(), false)}
              disabled={!topic.trim()}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-[#DDD3C7] text-sm font-medium text-[#6F6A64] hover:bg-[#F1ECE4] transition-colors disabled:opacity-40"
            >
              <Save className="h-4 w-4" />
              Create Only
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
