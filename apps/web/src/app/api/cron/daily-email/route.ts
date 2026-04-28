import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db/admin";
import { sendDailyDigestForUser, type SendOutcome } from "@/lib/email/daily-digest";

export const maxDuration = 300;

const PAGE_SIZE = 500;

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const now = new Date();

  const counts: Record<SendOutcome, number> = {
    sent: 0,
    "skipped:not-6am": 0,
    "skipped:already-sent": 0,
    "skipped:empty": 0,
    "skipped:no-tz": 0,
    error: 0,
  };
  const errors: Array<{ userId: string; message: string }> = [];

  let processed = 0;
  let from = 0;
  for (;;) {
    const { data: users, error } = await supabase
      .from("users")
      .select("id, email, display_name, timezone, last_daily_email_sent_on")
      .eq("daily_email_enabled", true)
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      return NextResponse.json(
        { error: error.message, processed, counts },
        { status: 500 },
      );
    }
    if (!users || users.length === 0) break;

    for (const user of users) {
      processed++;
      try {
        const outcome = await sendDailyDigestForUser(supabase, user, now);
        counts[outcome]++;
      } catch (err) {
        counts.error++;
        errors.push({
          userId: user.id,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    if (users.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return NextResponse.json({ processed, counts, errors: errors.slice(0, 20) });
}
