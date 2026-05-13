"use client";

import { useRef } from "react";
import { useTranslations } from "next-intl";

interface GoalInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
}

export function GoalInput({ value, onChange, onSubmit }: GoalInputProps) {
  const t = useTranslations("landing");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const placeholder = t("goalInputPlaceholder");

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Tab key: auto-fill placeholder text
    if (e.key === "Tab" && !value.trim()) {
      e.preventDefault();
      onChange(placeholder);
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

  // Split the hint at the {key} placeholder so we can render the kbd in
  // the middle without breaking the translatable string.
  const hintTemplate = t("goalInputHint", { key: "__KEY__" });
  const [hintBefore, hintAfter] = hintTemplate.split("__KEY__");

  return (
    <div className="relative max-w-4xl mx-auto mb-4">
      {/* Card — violet focus ring via :focus-within */}
      <div className="relative rounded-2xl border border-[#E7DED2] bg-white p-3 transition-all focus-within:border-[#7C2DE8] focus-within:shadow-[0_0_0_4px_rgba(124,45,232,0.12)]">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full bg-transparent border-none focus:ring-0 focus:outline-none font-display text-xl md:text-2xl font-bold tracking-[-0.015em] py-3 px-5 min-h-[80px] resize-none text-[#1A1829] placeholder:text-[#9B948B] placeholder:font-normal"
          placeholder={placeholder}
        />
        <div className="flex justify-between items-center px-3 pb-1 gap-3">
          <span className="text-xs text-[#9B948B] leading-snug text-left">
            {hintBefore}
            <kbd className="px-1.5 py-0.5 rounded border border-[#E7DED2] bg-[#F6F3EE] text-[10px] font-medium text-[#6F6A64]">Tab</kbd>
            {hintAfter}
          </span>
          <button
            onClick={() => value.trim() && onSubmit(value.trim())}
            className="bg-[#7C2DE8] text-white h-11 px-5 flex items-center gap-2 rounded-xl text-sm font-semibold hover:bg-[#6921C7] transition-all active:scale-95 shadow-brand shrink-0 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
            disabled={!value.trim()}
            aria-label={t("goalInputSubmitLabel")}
          >
            {t("goalInputSubmitLabel")}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
