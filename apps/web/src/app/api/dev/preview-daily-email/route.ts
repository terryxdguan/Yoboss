import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db/admin";
import { createClient } from "@/lib/db/server";
import { sendDailyDigestForUser } from "@/lib/email/daily-digest";
import { buildDailyDigestData } from "@/lib/email/digest-data";
import { renderDailyDigest } from "@/lib/email/render-daily-digest";
import { buildUnsubscribeUrl } from "@/lib/email/unsubscribe-token";

// Dev-only: render or send the digest for the currently-logged-in user so
// you can iterate on the template without waiting for the cron at 6 AM.
//   GET /api/dev/preview-daily-email           → returns rendered HTML
//   GET /api/dev/preview-daily-email?send=1    → actually sends it via Resend
export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("users")
    .select("id, email, display_name, timezone, last_daily_email_sent_on")
    .eq("id", authUser.id)
    .maybeSingle();

  if (!profile) {
    return NextResponse.json({ error: "User profile not found" }, { status: 404 });
  }

  const tz = profile.timezone || "UTC";
  const now = new Date();
  const send = request.nextUrl.searchParams.get("send") === "1";

  if (send) {
    const outcome = await sendDailyDigestForUser(
      admin,
      profile,
      now,
      { force: true },
    );
    return NextResponse.json({ outcome, to: profile.email });
  }

  const data = await buildDailyDigestData(admin, profile.id, tz, now);
  const base = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");
  const { html, subject } = renderDailyDigest({
    displayName: profile.display_name,
    data,
    dashboardUrl: `${base}/dashboard`,
    settingsUrl: `${base}/settings`,
    unsubUrl: buildUnsubscribeUrl(base, profile.id),
  });

  return new NextResponse(`<!-- Subject: ${subject} -->\n${html}`, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
