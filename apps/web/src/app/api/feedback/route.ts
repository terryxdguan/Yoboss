import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/db/server";
import { getEmailFrom, getResend } from "@/lib/email/client";

const FEEDBACK_TYPES = ["bug", "suggestion", "other"] as const;
type FeedbackType = (typeof FEEDBACK_TYPES)[number];

const MAX_BODY_CHARS = 5000;
const RATE_LIMIT_PER_HOUR = 10;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let payload: { type?: string; body?: string; url?: string } = {};
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const type = payload.type;
  const body = (payload.body ?? "").trim();
  const url = (payload.url ?? "").trim().slice(0, 500) || null;

  if (!type || !FEEDBACK_TYPES.includes(type as FeedbackType)) {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }
  if (!body) {
    return NextResponse.json({ error: "Body required" }, { status: 400 });
  }
  if (body.length > MAX_BODY_CHARS) {
    return NextResponse.json({ error: "Body too long" }, { status: 400 });
  }

  // Lightweight rate limit — count this user's submissions in the last
  // hour. Spammy enough to deter accidents/abuse without needing Redis.
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("feedback")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", oneHourAgo);

  if ((count ?? 0) >= RATE_LIMIT_PER_HOUR) {
    return NextResponse.json(
      { error: "Too many submissions. Try again later." },
      { status: 429 },
    );
  }

  const userAgent = req.headers.get("user-agent")?.slice(0, 500) ?? null;
  const appVersion = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? null;

  const { error: insertError } = await supabase.from("feedback").insert({
    user_id: user.id,
    user_email: user.email ?? null,
    type,
    body,
    url,
    user_agent: userAgent,
    app_version: appVersion,
  });

  if (insertError) {
    console.error("[feedback] insert failed:", insertError);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }

  // Notify admin via Resend. Failure here doesn't fail the request — the
  // row is already saved, the email is a courtesy.
  const notifyTo = process.env.FEEDBACK_NOTIFY_EMAIL;
  if (notifyTo) {
    try {
      const subjectPrefix =
        type === "bug" ? "🐛 Bug" : type === "suggestion" ? "💡 Suggestion" : "💬 Feedback";
      const preview = body.slice(0, 80).replace(/\s+/g, " ");
      const subject = `${subjectPrefix}: ${preview}${body.length > 80 ? "…" : ""}`;

      const html = [
        `<p><strong>Type:</strong> ${escapeHtml(type)}</p>`,
        `<p><strong>From:</strong> ${escapeHtml(user.email ?? user.id)}</p>`,
        url ? `<p><strong>URL:</strong> <a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p>` : "",
        `<p><strong>Message:</strong></p>`,
        `<pre style="white-space:pre-wrap;font-family:inherit;background:#f6f3ee;padding:12px;border-radius:6px;">${escapeHtml(body)}</pre>`,
      ]
        .filter(Boolean)
        .join("\n");

      await getResend().emails.send({
        from: getEmailFrom(),
        to: notifyTo,
        replyTo: user.email ?? undefined,
        subject,
        html,
      });
    } catch (err) {
      console.error("[feedback] notify email failed:", err);
    }
  }

  return NextResponse.json({ ok: true });
}
