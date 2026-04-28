import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/db/admin";
import { verifyUnsubscribeToken } from "@/lib/email/unsubscribe-token";

const C = {
  bg: "#F6F3EE",
  card: "#FFFDF9",
  fg: "#2B2B2B",
  muted: "#6F6A64",
  primary: "#7FAEE6",
  primaryFg: "#FFFDF9",
  border: "#DDD3C7",
};

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

async function disable(userId: string): Promise<boolean> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("users")
    .update({ daily_email_enabled: false })
    .eq("id", userId);
  return !error;
}

function landingPage(opts: { ok: boolean; appUrl: string }): string {
  const { ok, appUrl } = opts;
  const heading = ok ? "You're unsubscribed" : "Couldn't unsubscribe";
  const message = ok
    ? "You won't get the daily email anymore. You can re-enable it anytime in Settings."
    : "This link is invalid or expired. Open Settings to manage your email preferences.";
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>${heading} · YoBoss</title></head>
<body style="margin:0;background:${C.bg};font-family:${FONT};color:${C.fg};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg};min-height:100vh;">
    <tr><td align="center" style="padding:64px 16px;">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;width:100%;">
        <tr><td style="background:${C.card};border:1px solid ${C.border};border-radius:16px;padding:32px;text-align:center;">
          <h1 style="margin:0 0 8px;font-size:22px;font-weight:600;letter-spacing:-0.01em;">${heading}</h1>
          <p style="margin:0 0 24px;color:${C.muted};font-size:14px;line-height:1.5;">${message}</p>
          <a href="${appUrl}/settings" style="display:inline-block;background:${C.primary};color:${C.primaryFg};text-decoration:none;font-size:14px;font-weight:600;padding:11px 20px;border-radius:10px;">Open Settings</a>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("u");
  const token = request.nextUrl.searchParams.get("t");
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");

  let ok = false;
  if (userId && token && verifyUnsubscribeToken(userId, token)) {
    ok = await disable(userId);
  }

  return new NextResponse(landingPage({ ok, appUrl }), {
    status: ok ? 200 : 400,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

// One-click unsubscribe per RFC 8058 (List-Unsubscribe-Post).
export async function POST(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get("u");
  const token = request.nextUrl.searchParams.get("t");
  if (!userId || !token || !verifyUnsubscribeToken(userId, token)) {
    return new NextResponse("invalid", { status: 400 });
  }
  const ok = await disable(userId);
  return new NextResponse(ok ? "ok" : "error", { status: ok ? 200 : 500 });
}
