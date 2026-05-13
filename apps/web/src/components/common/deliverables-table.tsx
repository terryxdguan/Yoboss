"use client";

import { useMemo, useState } from "react";
import {
  Paperclip,
  FileText,
  Image as ImageIcon,
  File,
  Download,
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import type { GoalDeliverable } from "@/lib/types/database";

// Anthropic Files API doesn't expose a per-file expires_at; their session-
// scoped containers have an expiration but the value isn't returned in the
// metadata response. We assume a 30-day window from created_at, matching
// what the user observes in practice.
const RETENTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

type SortKey = "created" | "filename" | "expires";
type SortDir = "asc" | "desc";

function expiresAtMs(d: GoalDeliverable): number {
  return new Date(d.created_at).getTime() + RETENTION_DAYS * DAY_MS;
}

function fileTypeIcon(fileType: string | null) {
  if (!fileType) return <File className="h-4 w-4 text-[#9B948B]" />;
  if (fileType.startsWith("image/")) return <ImageIcon className="h-4 w-4 text-[#7C2DE8]" />;
  if (fileType.includes("pdf") || fileType.includes("document")) return <FileText className="h-4 w-4 text-[#D5847A]" />;
  return <File className="h-4 w-4 text-[#9B948B]" />;
}

interface DeliverablesTableProps {
  deliverables: GoalDeliverable[];
  loading: boolean;
}

export function DeliverablesTable({ deliverables, loading }: DeliverablesTableProps) {
  const t = useTranslations("goals.deliverables");
  const locale = useLocale();
  const [sortKey, setSortKey] = useState<SortKey>("created");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, { month: "short", day: "numeric", year: "numeric" });
  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
  const fmtCountdown = (expMs: number, now: number): string => {
    const diff = expMs - now;
    if (diff < DAY_MS) return t("lessThanDay");
    const days = Math.ceil(diff / DAY_MS);
    return t("daysLeft", { count: days });
  };

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const sorted = useMemo(() => {
    const sign = sortDir === "asc" ? 1 : -1;
    return [...deliverables].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "created") {
        cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      } else if (sortKey === "filename") {
        cmp = a.title.localeCompare(b.title);
      } else {
        cmp = expiresAtMs(a) - expiresAtMs(b);
      }
      return sign * cmp;
    });
  }, [deliverables, sortKey, sortDir]);

  const now = Date.now();

  if (loading) {
    return <p className="text-sm text-[#9B948B] text-center py-8">{t("loading")}</p>;
  }

  if (sorted.length === 0) {
    return (
      <div className="text-center py-12 px-4">
        <Paperclip className="h-8 w-8 text-[#E7DED2] mx-auto mb-2" />
        <p className="text-sm text-[#9B948B]">{t("empty")}</p>
        <p className="text-xs text-[#9B948B] mt-1">{t("emptyHint")}</p>
      </div>
    );
  }

  return (
    <table className="w-full text-sm border-separate border-spacing-0">
      <thead className="sticky top-0 z-[1] bg-[#FFFFFF]">
        <tr>
          <SortHeader label={t("colCreated")} active={sortKey === "created"} dir={sortDir} onClick={() => toggleSort("created")} className="w-[140px]" />
          <SortHeader label={t("colFile")} active={sortKey === "filename"} dir={sortDir} onClick={() => toggleSort("filename")} />
          <SortHeader label={t("colExpires")} active={sortKey === "expires"} dir={sortDir} onClick={() => toggleSort("expires")} className="w-[140px]" />
        </tr>
      </thead>
      <tbody>
        {sorted.map((d) => {
          const exp = expiresAtMs(d);
          const expired = exp < now;
          return (
            <tr key={d.id} className="border-t border-[#F6F3EE] hover:bg-[#F8F5EF] transition-colors">
              <td className="px-3 py-2.5 align-top text-xs whitespace-nowrap border-t border-[#F6F3EE]">
                <div className="text-[#6F6A64]">{fmtDate(d.created_at)}</div>
                <div className="text-[#9B948B] text-[11px] mt-0.5">{fmtTime(d.created_at)}</div>
              </td>
              <td className="px-3 py-2.5 align-top border-t border-[#F6F3EE]">
                <div className="flex items-start gap-2 min-w-0">
                  <span className="shrink-0 mt-0.5">{fileTypeIcon(d.file_type)}</span>
                  {expired || !d.url ? (
                    <span className="min-w-0 flex-1 text-[#2B2B2B] break-words">{d.title}</span>
                  ) : (
                    <a
                      href={d.url}
                      download={d.title}
                      title={t("downloadTitle")}
                      className="min-w-0 flex-1 text-[#7C2DE8] hover:underline break-words"
                    >
                      {d.title}
                    </a>
                  )}
                  {expired ? null : d.url ? (
                    <a
                      href={d.url}
                      download={d.title}
                      title={t("downloadTitle")}
                      className="shrink-0 p-1 rounded text-[#7C2DE8] hover:bg-[#F3ECFB] transition-colors"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </a>
                  ) : null}
                </div>
              </td>
              <td className="px-3 py-2.5 align-top text-xs whitespace-nowrap border-t border-[#F6F3EE]">
                {expired ? (
                  <span className="inline-block px-1.5 py-0.5 rounded text-[#D5847A] bg-[#D5847A]/10 font-medium">
                    {t("expired")}
                  </span>
                ) : (
                  <span className="text-[#6F6A64]">{fmtCountdown(exp, now)}</span>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function SortHeader({
  label,
  active,
  dir,
  onClick,
  className = "",
}: {
  label: string;
  active: boolean;
  dir: SortDir;
  onClick: () => void;
  className?: string;
}) {
  return (
    <th className={`text-left px-3 py-2 border-b border-[#E7DED2] ${className}`}>
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors ${
          active ? "text-[#2B2B2B]" : "text-[#9B948B] hover:text-[#6F6A64]"
        }`}
      >
        {label}
        {active ? (
          dir === "asc" ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
        ) : (
          <ChevronDown className="h-3 w-3 opacity-0" />
        )}
      </button>
    </th>
  );
}
