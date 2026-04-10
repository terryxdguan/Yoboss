import cronParser from "cron-parser";

/**
 * Compute the next run time for a cron expression in a given timezone.
 * Returns a UTC ISO string.
 */
export function getNextRunAt(cronExpression: string, timezone: string): string {
  const interval = cronParser.parse(cronExpression, {
    currentDate: new Date(),
    tz: timezone,
  });
  return interval.next().toDate().toISOString();
}

/**
 * Build a cron expression from UI selections.
 * frequency: "daily" | "weekly"
 * hour: 0-23, minute: 0-59
 * days: array of 0-6 (0=Sunday) — only used for weekly
 */
export function buildCronExpression(
  frequency: "daily" | "weekly",
  hour: number,
  minute: number,
  days?: number[]
): string {
  if (frequency === "daily") {
    return `${minute} ${hour} * * *`;
  }
  const dayStr = (days || []).sort().join(",");
  return `${minute} ${hour} * * ${dayStr}`;
}

/**
 * Format a cron expression as a human-readable label.
 * e.g. "Daily at 08:00" or "Mon, Wed, Fri at 09:00"
 */
export function formatScheduleLabel(cronExpression: string): string {
  const parts = cronExpression.split(" ");
  if (parts.length !== 5) return cronExpression;
  const [minute, hour, , , dayOfWeek] = parts;
  const time = `${hour.padStart(2, "0")}:${minute.padStart(2, "0")}`;

  if (dayOfWeek === "*") {
    return `Daily at ${time}`;
  }

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const days = dayOfWeek
    .split(",")
    .map((d) => dayNames[parseInt(d)] || d)
    .join(", ");
  return `${days} at ${time}`;
}
