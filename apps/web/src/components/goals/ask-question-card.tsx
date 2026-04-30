"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { useTranslations } from "next-intl";
import type { AskQuestionData, UserAnswer } from "@/lib/types/goal-chat";

interface AskQuestionCardProps {
  data: AskQuestionData;
  onAnswer: (answer: UserAnswer) => void;
  disabled?: boolean;
}

export function AskQuestionCard({
  data,
  onAnswer,
  disabled = false,
}: AskQuestionCardProps) {
  const t = useTranslations("goals.askQuestion");
  const [selected, setSelected] = useState<string[]>([]);
  const [otherText, setOtherText] = useState("");
  const [showOther, setShowOther] = useState(false);

  // Free-text-only mode is the wizard's "anything else?" final-check step.
  // The model emits ask_question with empty options + allow_other=true; we
  // render a textarea + Submit + Skip instead of the option-toggle dance.
  const isFreeTextOnly =
    data.options.length === 0 && data.allow_other === true;

  const toggleOption = (value: string) => {
    if (disabled) return;
    if (data.allow_multiple) {
      setSelected((prev) =>
        prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
      );
    } else {
      setSelected([value]);
      setShowOther(false);
    }
  };

  const toggleOther = () => {
    if (disabled) return;
    if (data.allow_multiple) {
      setShowOther(!showOther);
    } else {
      setSelected([]);
      setShowOther(true);
    }
  };

  const handleSubmit = () => {
    const answer: UserAnswer = {
      question: data.question,
      selected: showOther && !data.allow_multiple ? ["other"] : selected,
      other_text: showOther ? otherText : undefined,
    };
    onAnswer(answer);
  };

  // Free-text-only path: submit whatever's in the textarea (or skip empty).
  // The selected[] stays empty; the model reads `other_text` as the answer.
  const handleFreeTextSubmit = () => {
    const trimmed = otherText.trim();
    onAnswer({
      question: data.question,
      selected: [],
      other_text: trimmed || undefined,
    });
  };

  const canSubmit =
    (selected.length > 0 || (showOther && otherText.trim())) && !disabled;

  if (isFreeTextOnly) {
    return (
      <div className="border border-[#E7DED2] rounded-lg bg-[#FFFDF9] p-4 mt-2">
        <p className="text-sm font-medium text-[#2B2B2B] mb-3">
          {data.question}
        </p>
        <textarea
          value={otherText}
          onChange={(e) => setOtherText(e.target.value)}
          disabled={disabled}
          rows={3}
          placeholder={t("freeTextPlaceholder")}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && !disabled) {
              e.preventDefault();
              handleFreeTextSubmit();
            }
          }}
          className="w-full resize-none border border-[#DDD3C7] rounded-lg px-3 py-2 text-sm text-[#2B2B2B] placeholder:text-[#9B948B] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/40 focus:border-transparent bg-[#FFFDF9] mb-3 disabled:opacity-60"
        />
        {!disabled && (
          <div className="flex items-center gap-2">
            <button
              onClick={handleFreeTextSubmit}
              className="bg-[#007AFF] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#0066D6] active:scale-[0.98] transition-all"
            >
              {otherText.trim() ? t("submit") : t("skipAndContinue")}
            </button>
            <span className="text-[11px] text-[#9B948B]">{t("freeTextHint")}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="border border-[#E7DED2] rounded-lg bg-[#FFFDF9] p-4 mt-2">
      <p className="text-sm font-medium text-[#2B2B2B] mb-3">
        {data.question}
      </p>

      <div className="space-y-2 mb-3">
        {data.options.map((opt) => {
          const isSelected = selected.includes(opt.value);
          return (
            <button
              key={opt.value}
              onClick={() => toggleOption(opt.value)}
              disabled={disabled}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all border ${
                isSelected
                  ? "bg-[#E6F2FF] border-[#007AFF] text-[#2B2B2B]"
                  : "bg-[#F1ECE4] border-transparent text-[#2B2B2B] hover:border-[#DDD3C7]"
              } ${disabled ? "opacity-60 cursor-default" : "cursor-pointer"}`}
            >
              <span className="flex items-center gap-2.5">
                <span
                  className={`flex items-center justify-center shrink-0 w-4.5 h-4.5 rounded${
                    data.allow_multiple ? "" : "-full"
                  } border ${
                    isSelected
                      ? "bg-[#007AFF] border-[#007AFF]"
                      : "border-[#DDD3C7] bg-[#FFFDF9]"
                  }`}
                  style={{ width: 18, height: 18 }}
                >
                  {isSelected && <Check className="h-3 w-3 text-white" />}
                </span>
                {opt.label}
              </span>
            </button>
          );
        })}

        {data.allow_other && (
          <>
            <button
              onClick={toggleOther}
              disabled={disabled}
              className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all border ${
                showOther
                  ? "bg-[#E6F2FF] border-[#007AFF] text-[#2B2B2B]"
                  : "bg-[#F1ECE4] border-transparent text-[#2B2B2B] hover:border-[#DDD3C7]"
              } ${disabled ? "opacity-60 cursor-default" : "cursor-pointer"}`}
            >
              <span className="flex items-center gap-2.5">
                <span
                  className={`flex items-center justify-center shrink-0 rounded${
                    data.allow_multiple ? "" : "-full"
                  } border ${
                    showOther
                      ? "bg-[#007AFF] border-[#007AFF]"
                      : "border-[#DDD3C7] bg-[#FFFDF9]"
                  }`}
                  style={{ width: 18, height: 18 }}
                >
                  {showOther && <Check className="h-3 w-3 text-white" />}
                </span>
                {t("other")}
              </span>
            </button>
            {showOther && (
              <input
                type="text"
                value={otherText}
                onChange={(e) => setOtherText(e.target.value)}
                placeholder={t("otherPlaceholder")}
                className="w-full border border-[#DDD3C7] rounded-lg px-3 py-2 text-sm text-[#2B2B2B] placeholder:text-[#9B948B] focus:outline-none focus:ring-2 focus:ring-[#007AFF]/40 focus:border-transparent bg-[#FFFDF9]"
                disabled={disabled}
              />
            )}
          </>
        )}
      </div>

      {!disabled && (
        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="bg-[#007AFF] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#0066D6] active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {t("continue")}
        </button>
      )}
    </div>
  );
}
