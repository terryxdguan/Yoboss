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
  { key: "trip", icon: Plane, color: "#007AFF" },
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
          className="relative w-full max-w-2xl rounded-2xl bg-[#FFFDF9] p-6 shadow-[0_24px_64px_rgba(30,34,39,0.16)] outline-none md:p-8"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close */}
          <button
            onClick={onClose}
            aria-label={t("closeAria")}
            className="absolute right-4 top-4 rounded-md p-1.5 text-[#9B948B] transition-colors hover:bg-[#F1ECE4] hover:text-[#2B2B2B]"
          >
            <X className="h-5 w-5" />
          </button>

          {view === "examples" ? (
            <>
              <h2 className="mb-5 text-xl font-semibold text-[#2B2B2B] md:text-2xl">
                {t("title")}
              </h2>

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
                          ? "border-[#007AFF] bg-[#F8FBFF] shadow-[0_0_0_3px_rgba(0,122,255,0.15)]"
                          : "border-[#E7DED2] bg-[#FFFDF9] hover:border-[#9FC3EF] hover:bg-[#F8FBFF]"
                      }`}
                    >
                      <Icon
                        className="h-4 w-4 shrink-0"
                        strokeWidth={1.75}
                        style={{ color }}
                      />
                      <span className="text-xs font-medium leading-snug text-[#2B2B2B]">
                        {tExamples(`${key}.title`)}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Customize */}
              <button
                onClick={() => setView("customize")}
                className="mt-3 w-full rounded-xl border border-[#DDD3C7] bg-[#FFFDF9] px-3.5 py-3 text-left text-sm font-medium text-[#2B2B2B] transition-colors hover:border-[#9FC3EF] hover:bg-[#F8FBFF]"
              >
                {t("customize")}
              </button>
            </>
          ) : (
            <>
              {/* Customize header with Back */}
              <div className="mb-4 flex items-center gap-3">
                <button
                  onClick={() => setView("examples")}
                  className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-[#6F6A64] transition-colors hover:bg-[#F1ECE4] hover:text-[#2B2B2B]"
                >
                  <ArrowLeft className="h-4 w-4" />
                  {t("back")}
                </button>
              </div>

              <h2 className="mb-5 text-xl font-semibold text-[#2B2B2B] md:text-2xl">
                {t("customizeTitle")}
              </h2>

              <GoalInput
                value={customText}
                onChange={setCustomText}
                onSubmit={handleCustomSubmit}
              />
            </>
          )}
        </div>
      </div>
    </>
  );
}
