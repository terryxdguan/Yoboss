"use client";

import { useEffect, useState, useCallback } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import type { ChatSession } from "@/lib/types/database";
import {
  listOpenGoalDrafts,
  loadDraftSession,
  deleteDraftSession,
} from "@/lib/db/actions";
import { rebuildDraftHistory } from "@/lib/ai/draft-history";
import type { UseGoalSessionInitialDraft } from "@/lib/hooks/use-goal-session";

interface GoalDraftListProps {
  /** Called with the rehydrated draft ready to hand to useGoalSession. */
  onResume: (draft: UseGoalSessionInitialDraft) => void;
  /** Bumped by the parent after a draft is confirmed or cancelled so the
   *  list re-fetches. Simpler than wiring a global store. */
  refreshKey?: number;
}

/** Lists unconfirmed goal draft chats so the user can resume them.
 *
 *  Only shows when there's at least one draft — we don't want to clutter
 *  the new-goal page with an empty "You have no drafts" row. Each entry
 *  shows the session title (first ~60 chars of the opening message),
 *  its updated_at, and an interrupted badge if the last assistant turn
 *  was partial or explicitly marked interrupted (rare — we detect by
 *  loading the messages on click, not in the list fetch, since the list
 *  query only reads chat_sessions). */
export function GoalDraftList({ onResume, refreshKey = 0 }: GoalDraftListProps) {
  const t = useTranslations("goals.wizard");
  const locale = useLocale();
  const [drafts, setDrafts] = useState<ChatSession[] | null>(null);
  const [resumingId, setResumingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const formatRelative = (iso: string): string => {
    const then = new Date(iso).getTime();
    const now = Date.now();
    const diffSec = Math.round((now - then) / 1000);
    if (diffSec < 60) return t("draftJustNow");
    const diffMin = Math.round(diffSec / 60);
    if (diffMin < 60) return t("draftMinutes", { count: diffMin });
    const diffHr = Math.round(diffMin / 60);
    if (diffHr < 24) return t("draftHours", { count: diffHr });
    const diffDay = Math.round(diffHr / 24);
    if (diffDay === 1) return t("draftYesterday");
    if (diffDay < 7) return t("draftDays", { count: diffDay });
    return new Date(iso).toLocaleDateString(locale, { month: "short", day: "numeric" });
  };

  const fetchDrafts = useCallback(async () => {
    try {
      const rows = await listOpenGoalDrafts();
      setDrafts(rows);
    } catch (err) {
      console.error("[GoalDraftList] listOpenGoalDrafts failed:", err);
      setDrafts([]);
    }
  }, []);

  useEffect(() => {
    fetchDrafts();
  }, [fetchDrafts, refreshKey]);

  const handleResume = async (sessionId: string) => {
    setResumingId(sessionId);
    setError(null);
    try {
      const loaded = await loadDraftSession(sessionId);
      if (!loaded) {
        setError(t("draftNotFound"));
        await fetchDrafts();
        return;
      }
      const rebuilt = rebuildDraftHistory(loaded.messages);
      onResume({
        sessionId,
        rebuilt,
        sessionSummary: loaded.session.summary ?? null,
      });
    } catch (err) {
      console.error("[GoalDraftList] resume failed:", err);
      setError(err instanceof Error ? err.message : t("draftLoadFailed"));
    } finally {
      setResumingId(null);
    }
  };

  const handleDelete = async (sessionId: string) => {
    // Intentional: no confirmation dialog for dev velocity. If this ends
    // up as a real product feature, add a "Discard draft?" modal or a
    // swipe-to-undo toast. For now the user explicitly chose Delete.
    setDeletingId(sessionId);
    try {
      await deleteDraftSession(sessionId);
      await fetchDrafts();
    } catch (err) {
      console.error("[GoalDraftList] delete failed:", err);
      setError(err instanceof Error ? err.message : t("draftDeleteFailed"));
    } finally {
      setDeletingId(null);
    }
  };

  // Hide entirely while loading (first render) or when there are no
  // drafts. No empty state — it's clutter on the create-goal page.
  if (drafts === null || drafts.length === 0) return null;

  return (
    <div className="max-w-2xl mx-auto mb-6 text-left">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xs font-semibold text-[#6F6A64] uppercase tracking-wide">
          {t("draftListTitle")}
        </h2>
        <span className="text-xs text-[#9B948B]">
          {t("draftListInProgress", { count: drafts.length })}
        </span>
      </div>
      <div className="space-y-2">
        {drafts.map((draft) => {
          const title = draft.title || t("draftUntitled");
          const updated = formatRelative(draft.updated_at);
          const isResuming = resumingId === draft.id;
          const isDeleting = deletingId === draft.id;
          // If the session was created long enough ago that it probably
          // got interrupted (heuristic: updated_at == created_at and
          // older than 30s), hint at it. The real interrupted badge
          // lives on the assistant row and only shows after resume.
          const looksAbandoned =
            draft.created_at === draft.updated_at &&
            Date.now() - new Date(draft.updated_at).getTime() > 30_000;

          return (
            <div
              key={draft.id}
              className="flex items-center gap-3 rounded-xl border border-[#E7DED2] bg-[#FFFDF9] px-4 py-3 hover:border-[#DDD3C7] transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm text-[#2B2B2B] truncate">{title}</p>
                  {looksAbandoned && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#C9843D] bg-[#C9843D]/10 px-1.5 py-0.5 rounded">
                      <AlertTriangle className="h-2.5 w-2.5" />
                      {t("draftInterrupted")}
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#9B948B] mt-0.5">{updated}</p>
              </div>
              <button
                onClick={() => handleResume(draft.id)}
                disabled={isResuming || isDeleting}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[#007AFF] text-white hover:bg-[#0066D6] active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isResuming ? t("draftLoading") : t("draftContinue")}
              </button>
              <button
                onClick={() => handleDelete(draft.id)}
                disabled={isResuming || isDeleting}
                className="p-1.5 text-[#9B948B] hover:text-[#D5847A] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label={t("draftDeleteAria")}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
      {error && (
        <div className="mt-2 text-xs text-[#D5847A]">{error}</div>
      )}
    </div>
  );
}

