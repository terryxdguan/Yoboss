"use client";

// Free-text-only card rendered in the goal-wizard chat when the user
// clicks "Adjust" on the roadmap preview or weekly plan modal. Visual
// pattern mirrors AskQuestionCard's isFreeTextOnly branch so the user
// experiences the same idiom they already know from the final
// "Anything else?" clarifying question.

import { useState } from "react";
import { useTranslations } from "next-intl";

interface AdjustRequestCardProps {
  /** "goal" or "weekly" — picks which i18n string to show as the
   *  question prompt so the wording matches the surrounding flow. */
  kind: "goal" | "weekly";
  onSubmit: (text: string) => void;
  /** True once the user has submitted (or while a streamed response
   *  is in flight). Disables editing and hides the action row. */
  disabled?: boolean;
}

export function AdjustRequestCard({
  kind,
  onSubmit,
  disabled = false,
}: AdjustRequestCardProps) {
  const t = useTranslations("goals.adjust");
  const [text, setText] = useState("");
  const trimmed = text.trim();
  const canSubmit = !disabled && trimmed.length > 0;

  const handleSubmit = () => {
    if (!canSubmit) return;
    onSubmit(trimmed);
  };

  const question = kind === "weekly" ? t("weeklyPrompt") : t("goalPrompt");

  return (
    <div className="border border-[#E7DED2] rounded-lg bg-[#FFFDF9] p-4 mt-2">
      <p className="text-sm font-medium text-[#2B2B2B] mb-3">{question}</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={disabled}
        rows={3}
        placeholder={t("placeholder")}
        onKeyDown={(e) => {
          // Cmd/Ctrl+Enter to submit, mirroring AskQuestionCard.
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canSubmit) {
            e.preventDefault();
            handleSubmit();
          }
        }}
        className="w-full resize-none border border-[#DDD3C7] rounded-lg px-3 py-2 text-sm text-[#2B2B2B] placeholder:text-[#9B948B] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/40 focus:border-transparent bg-[#FFFDF9] mb-3 disabled:opacity-60"
      />
      {!disabled && (
        <div className="flex items-center gap-2">
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="bg-[#007AFF] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#0066D6] active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {t("submit")}
          </button>
          <span className="text-[11px] text-[#9B948B]">{t("hint")}</span>
        </div>
      )}
    </div>
  );
}
