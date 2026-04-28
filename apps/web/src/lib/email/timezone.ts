// Timezone helpers shared by the digest pipeline. The user table stores
// IANA zones like "Asia/Shanghai" or "America/Los_Angeles"; everything in
// this file derives "what is it locally for this user" from a UTC `Date`.

function partsFor(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? "";
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    weekday: get("weekday"),
  };
}

export function getLocalDate(date: Date, timeZone: string): string {
  const p = partsFor(date, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

export function getLocalHour(date: Date, timeZone: string): number {
  const p = partsFor(date, timeZone);
  // Intl.DateTimeFormat returns "24" at midnight in some browsers/runtimes;
  // normalize to 0.
  const h = parseInt(p.hour, 10);
  return h === 24 ? 0 : h;
}

// Returns 0=Mon..6=Sun (matching daily_tasks.day_of_week and getTodayDayOfWeek).
export function getLocalDayOfWeek(date: Date, timeZone: string): number {
  const p = partsFor(date, timeZone);
  const map: Record<string, number> = {
    Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6,
  };
  return map[p.weekday] ?? 0;
}

export function addDays(localDate: string, days: number): string {
  // localDate is YYYY-MM-DD. Build a UTC Date from it, shift days, and re-emit.
  const [y, m, d] = localDate.split("-").map(n => parseInt(n, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}
