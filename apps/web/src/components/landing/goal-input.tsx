"use client";

import { useRef } from "react";

const PLACEHOLDER = "I want to launch my own business and earn my first dollar in 30 days...";

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
      <div className="absolute inset-[-50%] animate-spin-slow bg-[conic-gradient(#4C7CF0,#a78bfa,#f59e0b,#ef4444,#4C7CF0)]" />

      {/* Glow layer */}
      <div className="absolute inset-[-50%] animate-spin-slow bg-[conic-gradient(#4C7CF0,#a78bfa,#f59e0b,#ef4444,#4C7CF0)] blur-lg opacity-50" />

      {/* Card */}
      <div className="relative bg-white rounded-xl p-3">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full bg-transparent border-none focus:ring-0 focus:outline-none text-lg md:text-xl py-4 px-7 min-h-[90px] resize-none text-[#1E2227] placeholder:text-[#8C939B]"
          placeholder={PLACEHOLDER}
        />
        <div className="flex justify-end items-center px-4 pb-2">
          <button
            onClick={() => value.trim() && onSubmit(value.trim())}
            className="bg-[#4C7CF0] text-white h-12 w-12 flex items-center justify-center rounded-lg hover:bg-[#3F6FE4] transition-all active:scale-95 shadow-sm"
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
