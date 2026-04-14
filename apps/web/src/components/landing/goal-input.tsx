"use client";

import { useRef } from "react";

const PLACEHOLDER = "How to lose 30 lbs (13.6 kg) in 6 months";

interface GoalInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
}

export function GoalInput({ value, onChange, onSubmit }: GoalInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Tab key: auto-fill placeholder text
    if (e.key === "Tab" && !value.trim()) {
      e.preventDefault();
      onChange(PLACEHOLDER);
      return;
    }

    // Enter key: submit
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim()) {
        onSubmit(value.trim());
      }
    }
  };

  return (
    <div className="relative max-w-4xl mx-auto group mb-16 rounded-2xl p-[1.5px] overflow-hidden">
      {/* Spinning gradient background */}
      <div className="absolute inset-[-50%] animate-spin-slow bg-[conic-gradient(#7FAEE6,#a78bfa,#f59e0b,#ef4444,#7FAEE6)]" />

      {/* Glow layer */}
      <div className="absolute inset-[-50%] animate-spin-slow bg-[conic-gradient(#7FAEE6,#a78bfa,#f59e0b,#ef4444,#7FAEE6)] blur-lg opacity-50" />

      {/* Card */}
      <div className="relative bg-[#FFFDF9] rounded-xl p-3">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full bg-transparent border-none focus:ring-0 focus:outline-none text-lg md:text-xl py-4 px-7 min-h-[90px] resize-none text-[#2B2B2B] placeholder:text-[#9B948B]"
          placeholder={PLACEHOLDER}
        />
        <div className="flex justify-between items-center px-4 pb-2 gap-3">
          <span className="text-xs text-[#9B948B] leading-snug text-left">
            Press <kbd className="px-1.5 py-0.5 rounded border border-[#E7DED2] bg-[#F1ECE4] text-[10px] font-medium text-[#6F6A64]">Tab</kbd> to autofill the example text
          </span>
          <button
            onClick={() => value.trim() && onSubmit(value.trim())}
            className="bg-[#7FAEE6] text-white h-12 w-12 flex items-center justify-center rounded-lg hover:bg-[#6A9DDA] transition-all active:scale-95 shadow-sm shrink-0"
            aria-label="Submit goal"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
