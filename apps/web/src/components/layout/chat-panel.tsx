"use client";

import { useEffect, useRef } from "react";
import { X, Send } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

interface ChatPanelProps {
  open: boolean;
  onClose: () => void;
}

export function ChatPanel({ open, onClose }: ChatPanelProps) {
  const t = useTranslations("coachChat");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [open]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/5"
          onClick={onClose}
        />
      )}

      <div
        className={cn(
          "fixed top-0 right-0 z-50 h-full w-80 flex flex-col",
          "bg-[#F6F3EE]",
          "shadow-[-4px_0_16px_rgba(30,34,39,0.06)]",
          "transition-transform duration-200 ease-out",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        <div className="flex items-center justify-between h-14 px-4 border-b border-[#E7DED2]">
          <span className="text-sm font-medium text-[#2B2B2B]">
            {t("title")}
          </span>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-[#6F6A64] hover:bg-[#F6F3EE] hover:text-[#2B2B2B] transition-colors"
            aria-label={t("closeAria")}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          <div className="max-w-[85%]">
            <div className="bg-[#F6F3EE] rounded-md px-3 py-2.5">
              <p className="text-sm leading-relaxed text-[#2B2B2B]">
                {t("greeting")}
              </p>
            </div>
          </div>
        </div>

        <div className="border-t border-[#E7DED2] px-4 py-3">
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              placeholder={t("inputPlaceholder")}
              className="flex-1 text-sm bg-transparent outline-none placeholder:text-[#9B948B] text-[#2B2B2B]"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                }
              }}
            />
            <button
              className="p-1.5 text-[#7C2DE8] hover:text-[#6921C7] transition-colors"
              aria-label={t("sendAria")}
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
