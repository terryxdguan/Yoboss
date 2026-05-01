import { notFound } from "next/navigation";
import Link from "next/link";
import { Bug, Lightbulb, MessageCircle, ChevronLeft, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/db/server";
import { createAdminClient } from "@/lib/db/admin";
import { isAdmin } from "@/lib/auth/admin";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;
const TYPES = ["bug", "suggestion", "other"] as const;
type FeedbackType = (typeof TYPES)[number];

type FeedbackRow = {
  id: string;
  user_id: string | null;
  user_email: string | null;
  type: FeedbackType;
  body: string;
  url: string | null;
  user_agent: string | null;
  app_version: string | null;
  created_at: string;
};

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  return new Date(iso).toLocaleDateString();
}

function typeBadge(type: FeedbackType) {
  if (type === "bug") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#D5847A]/10 px-2 py-0.5 text-[11px] font-semibold text-[#D5847A]">
        <Bug className="h-3 w-3" /> Bug
      </span>
    );
  }
  if (type === "suggestion") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#C9843D]/10 px-2 py-0.5 text-[11px] font-semibold text-[#C9843D]">
        <Lightbulb className="h-3 w-3" /> Idea
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#6F6A64]/10 px-2 py-0.5 text-[11px] font-semibold text-[#6F6A64]">
      <MessageCircle className="h-3 w-3" /> Other
    </span>
  );
}

export default async function AdminFeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; page?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isAdmin(user)) notFound();

  const sp = await searchParams;
  const filterType = TYPES.includes(sp.type as FeedbackType) ? (sp.type as FeedbackType) : null;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  // Use admin client so the listing isn't restricted by RLS (which only
  // exposes a user's own rows).
  const admin = createAdminClient();
  let query = admin
    .from("feedback")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);
  if (filterType) query = query.eq("type", filterType);

  const { data: rows, count, error } = await query;
  if (error) {
    return (
      <div className="space-y-2">
        <h1 className="text-xl font-semibold text-[#2B2B2B]">Feedback</h1>
        <p className="text-sm text-[#D5847A]">Failed to load: {error.message}</p>
      </div>
    );
  }

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function pageHref(p: number) {
    const params = new URLSearchParams();
    if (filterType) params.set("type", filterType);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `/admin/feedback?${qs}` : `/admin/feedback`;
  }
  function typeHref(t: FeedbackType | null) {
    const params = new URLSearchParams();
    if (t) params.set("type", t);
    const qs = params.toString();
    return qs ? `/admin/feedback?${qs}` : `/admin/feedback`;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-[#2B2B2B]">Feedback</h1>
        <p className="text-xs text-[#6F6A64] mt-0.5">
          {total} total {filterType ? `(filtered: ${filterType})` : ""}
        </p>
      </div>

      {/* Filter pills */}
      <div className="flex flex-wrap gap-2">
        {[
          { label: "All", value: null as FeedbackType | null },
          { label: "Bug", value: "bug" as const },
          { label: "Idea", value: "suggestion" as const },
          { label: "Other", value: "other" as const },
        ].map(({ label, value }) => {
          const active = filterType === value;
          return (
            <Link
              key={label}
              href={typeHref(value)}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                active
                  ? "border-[#2B2B2B] bg-[#2B2B2B] text-white"
                  : "border-[#E7DED2] bg-[#FFFDF9] text-[#2B2B2B] hover:bg-[#F1ECE4]"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </div>

      {/* Rows */}
      {rows && rows.length > 0 ? (
        <div className="space-y-3">
          {(rows as FeedbackRow[]).map((row) => (
            <div
              key={row.id}
              className="rounded-xl border border-[#E7DED2] bg-[#FFFDF9] p-4"
            >
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  {typeBadge(row.type)}
                  <span className="text-xs text-[#6F6A64]">
                    {row.user_email ?? row.user_id ?? "anonymous"}
                  </span>
                </div>
                <span
                  className="text-xs text-[#6F6A64]"
                  title={new Date(row.created_at).toLocaleString()}
                >
                  {formatRelative(row.created_at)}
                </span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-[#2B2B2B]">{row.body}</p>
              {row.url && (
                <p className="mt-2 text-[11px] text-[#6F6A64]">
                  on{" "}
                  <a
                    href={row.url}
                    target="_blank"
                    rel="noreferrer"
                    className="underline decoration-dotted"
                  >
                    {row.url}
                  </a>
                  {row.app_version && (
                    <span className="ml-2 font-mono">{row.app_version}</span>
                  )}
                </p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-[#E7DED2] bg-[#FFFDF9] p-8 text-center">
          <p className="text-sm text-[#6F6A64]">No feedback yet.</p>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <Link
            href={pageHref(Math.max(1, page - 1))}
            aria-disabled={page <= 1}
            className={`inline-flex items-center gap-1 rounded-lg border border-[#E7DED2] bg-[#FFFDF9] px-3 py-1.5 text-xs font-semibold text-[#2B2B2B] transition-colors hover:bg-[#F1ECE4] ${
              page <= 1 ? "pointer-events-none opacity-40" : ""
            }`}
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Prev
          </Link>
          <span className="text-xs text-[#6F6A64]">
            Page {page} of {totalPages}
          </span>
          <Link
            href={pageHref(Math.min(totalPages, page + 1))}
            aria-disabled={page >= totalPages}
            className={`inline-flex items-center gap-1 rounded-lg border border-[#E7DED2] bg-[#FFFDF9] px-3 py-1.5 text-xs font-semibold text-[#2B2B2B] transition-colors hover:bg-[#F1ECE4] ${
              page >= totalPages ? "pointer-events-none opacity-40" : ""
            }`}
          >
            Next <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}
    </div>
  );
}
