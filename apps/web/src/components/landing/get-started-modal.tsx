"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  X,
  Dumbbell,
  Briefcase,
  Timer,
  Globe,
  ShoppingBag,
  Plane,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { GoalInput } from "./goal-input";

interface GetStartedModalProps {
  open: boolean;
  onClose: () => void;
  // Fires once the user has either picked an example or submitted
  // custom text. The parent owns what happens next (set pendingGoal,
  // push to /goals, or open AuthModal).
  onSubmit: (text: string) => void;
}

const EXAMPLE_KEYS: { key: string; icon: LucideIcon; color: string }[] = [
  { key: "lose", icon: Dumbbell, color: "#E8858B" },
  { key: "job", icon: Briefcase, color: "#D4C5A0" },
  { key: "marathon", icon: Timer, color: "#C9B88C" },
  { key: "language", icon: Globe, color: "#7BA8D9" },
  { key: "shop", icon: ShoppingBag, color: "#8BC5A3" },
  { key: "trip", icon: Plane, color: "#7C2DE8" },
];

export function GetStartedModal({ open, onClose, onSubmit }: GetStartedModalProps) {
  const t = useTranslations("landing.picker");
  const tExamples = useTranslations("landing.examples");

  const [view, setView] = useState<"examples" | "customize">("examples");
  const [customText, setCustomText] = useState("");
  // Visual feedback while we hand off — keeps the picked chip highlighted
  // for ~120ms so the user sees their click registered before parent
  // state changes can unmount the modal.
  const [picking, setPicking] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);

  // Reset to examples view whenever the modal reopens. Custom text is
  // intentionally NOT cleared so the user can close, reopen, and keep
  // typing.
  useEffect(() => {
    if (open) {
      setView("examples");
      setPicking(null);
    }
  }, [open]);

  // ESC closes; click on overlay closes. Focus the dialog when opened
  // for screen-reader and keyboard users.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    dialogRef.current?.focus();
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const handlePick = (key: string) => {
    if (picking) return;
    setPicking(key);
    const text = tExamples(`${key}.text`);
    // Brief visual delay so the user sees the highlight before the
    // parent (likely) replaces this view with AuthModal or /goals.
    setTimeout(() => onSubmit(text), 120);
  };

  const handleCustomSubmit = (text: string) => {
    if (!text.trim()) return;
    onSubmit(text.trim());
  };

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          ref={dialogRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label={t("title")}
          className="relative w-full max-w-2xl rounded-3xl bg-white shadow-[0_24px_64px_rgba(26,24,41,0.18)] outline-none overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Ink header strip — v1.1 mock §5.3 */}
          <div className="relative bg-[#1A1829] px-6 pt-6 pb-7 md:px-8 md:pt-7 md:pb-8">
            <button
              onClick={onClose}
              aria-label={t("closeAria")}
              className="absolute right-4 top-4 rounded-md p-1.5 text-white/55 transition-colors hover:bg-white/10 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
            {view === "customize" && (
              <button
                onClick={() => setView("examples")}
                className="mb-3 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-white/65 transition-colors hover:bg-white/10 hover:text-white"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                {t("back")}
              </button>
            )}
            <span
              className="inline-block rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em]"
              style={{ backgroundColor: "rgba(124,45,232,0.22)", color: "#C9A8F7" }}
            >
              {t("eyebrow")}
            </span>
            <h2 className="mt-3 font-display text-2xl md:text-3xl font-bold leading-tight tracking-[-0.02em] text-white">
              {view === "examples" ? t("title") : t("customizeTitle")}
            </h2>
            <p className="mt-1.5 text-sm text-white/65">{t("subtitle")}</p>
          </div>

          <div className="p-6 md:p-8">
            {view === "examples" ? (
              <>
                {/* 6-cell example grid */}
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 md:grid-cols-3">
                  {EXAMPLE_KEYS.map(({ key, icon: Icon, color }) => {
                    const isPicked = picking === key;
                    return (
                      <button
                        key={key}
                        onClick={() => handlePick(key)}
                        disabled={picking !== null}
                        className={`group flex items-center gap-2 rounded-xl border px-3.5 py-3 text-left transition-all disabled:cursor-default ${
                          isPicked
                            ? "border-[#7C2DE8] bg-[#F3ECFB] shadow-[0_0_0_3px_rgba(124,45,232,0.18)]"
                            : "border-[#E7DED2] bg-white hover:border-[#C9A8F7] hover:bg-[#F3ECFB]"
                        }`}
                      >
                        <Icon
                          className="h-4 w-4 shrink-0"
                          strokeWidth={1.75}
                          style={{ color }}
                        />
                        <span className="text-xs font-medium leading-snug text-[#1A1829]">
                          {tExamples(`${key}.title`)}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Customize */}
                <button
                  onClick={() => setView("customize")}
                  className="mt-3 w-full rounded-xl border border-[#DDD3C7] bg-white px-3.5 py-3 text-left text-sm font-medium text-[#1A1829] transition-colors hover:border-[#C9A8F7] hover:bg-[#F3ECFB]"
                >
                  {t("customize")}
                </button>
              </>
            ) : (
              <GoalInput
                value={customText}
                onChange={setCustomText}
                onSubmit={handleCustomSubmit}
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
}
