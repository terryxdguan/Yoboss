import type { SupabaseClient } from "@supabase/supabase-js";
import { getEmailFrom, getResend } from "./client";
import { buildDailyDigestData } from "./digest-data";
import { renderDailyDigest } from "./render-daily-digest";
import { getLocalDate, getLocalHour } from "./timezone";
import { buildUnsubscribeUrl } from "./unsubscribe-token";

export type SendOutcome =
  | "sent"
  | "skipped:not-6am"
  | "skipped:already-sent"
  | "skipped:empty"
  | "skipped:no-tz"
  | "error";

type UserRow = {
  id: string;
  email: string;
  display_name: string | null;
  timezone: string | null;
  last_daily_email_sent_on: string | null;
};

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");
}

export async function sendDailyDigestForUser(
  supabase: SupabaseClient,
  user: UserRow,
  now: Date,
  opts: { force?: boolean } = {},
): Promise<SendOutcome> {
  if (!user.timezone) return "skipped:no-tz";

  const localHour = getLocalHour(now, user.timezone);
  const localDate = getLocalDate(now, user.timezone);

  if (!opts.force && localHour !== 6) return "skipped:not-6am";
  if (!opts.force && user.last_daily_email_sent_on === localDate) {
    return "skipped:already-sent";
  }

  const data = await buildDailyDigestData(supabase, user.id, user.timezone, now);

  if (
    !opts.force &&
    data.todayItems.length === 0 &&
    data.yesterdayCompleted.length === 0
  ) {
    return "skipped:empty";
  }

  const base = appUrl();
  const dashboardUrl = `${base}/dashboard`;
  const settingsUrl = `${base}/settings`;
  const unsubUrl = buildUnsubscribeUrl(base, user.id);

  const { html, text, subject } = renderDailyDigest({
    displayName: user.display_name,
    data,
    dashboardUrl,
    settingsUrl,
    unsubUrl,
  });

  // Resend reports API errors via `{ error }` rather than throwing (only
  // network/runtime issues throw). Without inspecting both, a rejected send
  // (unverified domain, bad From, blocked recipient) silently looks "sent".
  // Re-throw so the cron route's catch surfaces the message in `errors[]`
  // and bumps `counts.error`.
  try {
    const { error: resendError } = await getResend().emails.send({
      from: getEmailFrom(),
      to: user.email,
      subject,
      html,
      text,
      headers: {
        // RFC 8058 one-click unsubscribe — Gmail/Apple Mail surface a native button.
        "List-Unsubscribe": `<${unsubUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
    if (resendError) {
      throw new Error(
        `Resend ${resendError.name ?? "send_error"}: ${resendError.message ?? "unknown"}`,
      );
    }
  } catch (err) {
    console.error("[daily-email] resend.send failed", { userId: user.id, err });
    throw err;
  }

  if (!opts.force) {
    await supabase
      .from("users")
      .update({ last_daily_email_sent_on: localDate })
      .eq("id", user.id);
  }

  return "sent";
}
