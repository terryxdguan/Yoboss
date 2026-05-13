import type { DigestData, DigestItem } from "./digest-data";

// Brand tokens — kept in sync with apps/web/src/app/globals.css :root.
const C = {
  bg: "#F6F3EE",
  card: "#FFFFFF",
  fg: "#2B2B2B",
  muted: "#6F6A64",
  faint: "#9B948B",
  primary: "#7C2DE8",
  primaryFg: "#FFFFFF",
  sage: "#8DCB96",
  border: "#DDD3C7",
  inputBorder: "#E7DED2",
};

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

type RenderArgs = {
  displayName: string | null;
  data: DigestData;
  dashboardUrl: string;
  settingsUrl: string;
  unsubUrl: string;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function pluralize(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

const SLOT_LABEL: Record<DigestItem["timeSlot"], string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
};

function groupBySlot(items: DigestItem[]): Array<[string, DigestItem[]]> {
  const order: DigestItem["timeSlot"][] = ["morning", "afternoon", "evening"];
  const groups: Record<string, DigestItem[]> = { morning: [], afternoon: [], evening: [] };
  for (const it of items) groups[it.timeSlot].push(it);
  return order
    .filter(s => groups[s].length > 0)
    .map(s => [SLOT_LABEL[s], groups[s]] as [string, DigestItem[]]);
}

function renderTodayList(items: DigestItem[], dashboardUrl: string): string {
  if (items.length === 0) {
    return `<p style="margin:0;color:${C.muted};font-size:14px;">Nothing scheduled for today. Take a breath, or plan something on your dashboard.</p>`;
  }

  const groups = groupBySlot(items);
  return groups
    .map(([label, list]) => {
      const rows = list
        .map(
          it => `
            <tr>
              <td style="padding:8px 0;border-top:1px solid ${C.inputBorder};">
                <a href="${dashboardUrl}" style="text-decoration:none;color:${C.fg};display:block;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                    <tr>
                      <td width="20" valign="top" style="padding-top:2px;">
                        <span style="display:inline-block;width:14px;height:14px;border:1.5px solid ${C.primary};border-radius:50%;"></span>
                      </td>
                      <td style="padding-left:8px;font-size:15px;line-height:1.4;color:${C.fg};">
                        ${escapeHtml(it.title)}
                        <div style="font-size:12px;color:${C.faint};margin-top:2px;">${escapeHtml(it.sourceLabel)}</div>
                      </td>
                    </tr>
                  </table>
                </a>
              </td>
            </tr>`,
        )
        .join("");
      return `
        <p style="margin:18px 0 6px;font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${C.faint};font-weight:600;">${label}</p>
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${rows}</table>`;
    })
    .join("");
}

function renderYesterdayList(items: DigestItem[], dashboardUrl: string): string {
  if (items.length === 0) return "";
  const rows = items
    .map(
      it => `
        <tr>
          <td style="padding:6px 0;">
            <a href="${dashboardUrl}" style="text-decoration:none;color:${C.muted};display:block;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td width="20" valign="top" style="padding-top:2px;">
                    <span style="color:${C.sage};font-size:14px;font-weight:700;">✓</span>
                  </td>
                  <td style="padding-left:8px;font-size:14px;line-height:1.4;color:${C.muted};">
                    ${escapeHtml(it.title)}
                    <span style="color:${C.faint};font-size:12px;"> · ${escapeHtml(it.sourceLabel)}</span>
                  </td>
                </tr>
              </table>
            </a>
          </td>
        </tr>`,
    )
    .join("");

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:28px;border-top:1px solid ${C.border};padding-top:20px;">
      <tr>
        <td>
          <p style="margin:0 0 10px;font-size:13px;color:${C.muted};">
            Yesterday's wins · ${items.length}
          </p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">${rows}</table>
        </td>
      </tr>
    </table>`;
}

export function renderDailyDigest({
  displayName,
  data,
  dashboardUrl,
  settingsUrl,
  unsubUrl,
}: RenderArgs): { html: string; text: string; subject: string } {
  const name = displayName?.trim() || "there";
  const todayCount = data.todayItems.length;
  const yCount = data.yesterdayCompleted.length;

  const subject =
    todayCount > 0
      ? `Today on YoBoss · ${todayCount} ${pluralize(todayCount, "item", "items")}`
      : `Yesterday's wins on YoBoss · ${yCount}`;

  const headline =
    todayCount > 0
      ? `🌞 Today · ${todayCount} ${pluralize(todayCount, "item", "items")}`
      : `🌿 A quiet day ahead`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${C.bg};font-family:${FONT};color:${C.fg};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;">

          <tr>
            <td style="padding:0 4px 16px;">
              <a href="${dashboardUrl}" style="text-decoration:none;color:${C.fg};font-size:18px;font-weight:700;letter-spacing:-0.01em;">YoBoss</a>
            </td>
          </tr>

          <tr>
            <td style="background:${C.card};border:1px solid ${C.border};border-radius:16px;padding:28px 28px 24px;">
              <p style="margin:0 0 4px;font-size:14px;color:${C.muted};">Good morning, ${escapeHtml(name)}</p>
              <h1 style="margin:0 0 18px;font-size:22px;font-weight:600;color:${C.fg};letter-spacing:-0.01em;">
                <a href="${dashboardUrl}" style="text-decoration:none;color:${C.fg};">${headline}</a>
              </h1>

              ${renderTodayList(data.todayItems, dashboardUrl)}

              ${renderYesterdayList(data.yesterdayCompleted, dashboardUrl)}

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;">
                <tr>
                  <td align="center">
                    <a href="${dashboardUrl}"
                       style="display:inline-block;background:${C.primary};color:${C.primaryFg};text-decoration:none;font-size:14px;font-weight:600;padding:12px 22px;border-radius:10px;">
                      Open YoBoss
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="padding:20px 4px 0;text-align:center;font-size:12px;color:${C.faint};line-height:1.6;">
              You're getting this because daily summaries are on for your account.<br/>
              <a href="${settingsUrl}" style="color:${C.muted};text-decoration:underline;">Manage email preferences</a>
              &nbsp;·&nbsp;
              <a href="${unsubUrl}" style="color:${C.muted};text-decoration:underline;">Unsubscribe</a>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  // Plain-text fallback
  const lines: string[] = [];
  lines.push(`Good morning, ${name}`);
  lines.push("");
  if (todayCount > 0) {
    lines.push(`TODAY (${todayCount})`);
    for (const it of data.todayItems) {
      lines.push(`  - ${it.title}  [${it.sourceLabel}]`);
    }
  } else {
    lines.push("A quiet day ahead — nothing scheduled.");
  }
  if (yCount > 0) {
    lines.push("");
    lines.push(`YESTERDAY'S WINS (${yCount})`);
    for (const it of data.yesterdayCompleted) {
      lines.push(`  ✓ ${it.title}  [${it.sourceLabel}]`);
    }
  }
  lines.push("");
  lines.push(`Open YoBoss: ${dashboardUrl}`);
  lines.push(`Manage preferences: ${settingsUrl}`);
  lines.push(`Unsubscribe: ${unsubUrl}`);
  const text = lines.join("\n");

  return { html, text, subject };
}
