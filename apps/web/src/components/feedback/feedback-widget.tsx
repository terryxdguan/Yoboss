"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { MessageSquarePlus, X, Bug, Lightbulb, MessageCircle } from "lucide-react";

type FeedbackType = "bug" | "suggestion" | "other";

export function FeedbackWidget() {
  const t = useTranslations("feedback");
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<FeedbackType>("suggestion");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setBody("");
    setType("suggestion");
    setSent(false);
    setError(null);
  }

  function handleClose() {
    if (submitting) return;
    setOpen(false);
    // Wait for transition before clearing so the form doesn't visually
    // jump back during the dismiss animation.
    setTimeout(reset, 200);
  }

  async function handleSubmit() {
    if (!body.trim() || submitting) return;
    setSubmitting(true);
    setError(null);

    // Mirror BUG reports to Sentry so they surface alongside the user's
    // recent errors / replay. Ideas and "other" feedback are product-level
    // and would just be noise in the engineering inbox.
    if (type === "bug") {
      try {
        const Sentry = await import("@sentry/nextjs");
        Sentry.captureFeedback({
          message: body.trim(),
          url: typeof window !== "undefined" ? window.location.href : undefined,
        });
      } catch {
        // ignore
      }
    }

    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          body: body.trim(),
          url: typeof window !== "undefined" ? window.location.href : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || t("errorGeneric"));
        setSubmitting(false);
        return;
      }
      setSent(true);
      setSubmitting(false);
    } catch {
      setError(t("errorGeneric"));
      setSubmitting(false);
    }
  }

  return (
    <>
      {/* FAB — sits above the chat fab so the two don't overlap. Smaller
          and outlined so it reads as secondary to the primary chat CTA. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 inline-flex h-11 w-11 items-center justify-center rounded-full border border-[#E7DED2] bg-[#FFFDF9] text-[#2B2B2B] shadow-[0_2px_8px_rgba(0,0,0,0.10)] transition-colors hover:bg-[#F1ECE4]"
        aria-label={t("openAria")}
        title={t("openAria")}
      >
        <MessageSquarePlus className="h-4 w-4" />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
          onClick={handleClose}
        >
          <div
            role="dialog"
            aria-label={t("title")}
            className="w-full max-w-md rounded-xl border border-[#E7DED2] bg-[#FFFDF9] p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-[#2B2B2B]">{t("title")}</h3>
                <p className="mt-0.5 text-xs text-[#6F6A64]">{t("subtitle")}</p>
              </div>
              <button
                type="button"
                onClick={handleClose}
                disabled={submitting}
                className="rounded-md p-1 text-[#6F6A64] hover:bg-[#F1ECE4] disabled:opacity-50"
                aria-label={t("close")}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {sent ? (
              <div className="mt-6 text-center">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[#E8F0E5]">
                  <MessageCircle className="h-5 w-5 text-[#5A8A5C]" />
                </div>
                <p className="mt-3 text-sm font-medium text-[#2B2B2B]">{t("thankYouTitle")}</p>
                <p className="mt-1 text-xs text-[#6F6A64]">{t("thankYouBody")}</p>
                <button
                  type="button"
                  onClick={handleClose}
                  className="mt-5 rounded-lg border border-[#E7DED2] px-4 py-1.5 text-xs font-semibold text-[#2B2B2B] transition-colors hover:bg-[#F1ECE4]"
                >
                  {t("done")}
                </button>
              </div>
            ) : (
              <>
                <div className="mt-5 grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: "bug" as const, label: t("typeBug"), icon: Bug },
                      { id: "suggestion" as const, label: t("typeSuggestion"), icon: Lightbulb },
                      { id: "other" as const, label: t("typeOther"), icon: MessageCircle },
                    ]
                  ).map(({ id, label, icon: Icon }) => {
                    const active = type === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setType(id)}
                        className={`flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-[11px] font-medium transition-colors ${
                          active
                            ? "border-[#C9843D] bg-[#C9843D]/10 text-[#C9843D]"
                            : "border-[#E7DED2] text-[#2B2B2B] hover:bg-[#F1ECE4]"
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        {label}
                      </button>
                    );
                  })}
                </div>

                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  disabled={submitting}
                  placeholder={t("placeholder")}
                  maxLength={5000}
                  rows={5}
                  className="mt-3 w-full resize-none rounded-lg border border-[#E7DED2] bg-white px-3 py-2 text-sm text-[#2B2B2B] outline-none focus:border-[#C9843D]/50 focus:ring-2 focus:ring-[#C9843D]/20"
                />

                {error && <p className="mt-2 text-xs text-[#D5847A]">{error}</p>}

                <div className="mt-4 flex items-center justify-between">
                  <p className="text-[11px] text-[#6F6A64]">{body.length}/5000</p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleClose}
                      disabled={submitting}
                      className="rounded-lg border border-[#E7DED2] px-3.5 py-1.5 text-xs font-semibold text-[#2B2B2B] transition-colors hover:bg-[#F1ECE4] disabled:opacity-50"
                    >
                      {t("cancel")}
                    </button>
                    <button
                      type="button"
                      onClick={handleSubmit}
                      disabled={!body.trim() || submitting}
                      className="rounded-lg bg-[#C9843D] px-3.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#B5742F] disabled:opacity-40"
                    >
                      {submitting ? t("sending") : t("send")}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
