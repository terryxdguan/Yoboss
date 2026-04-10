export function getWeekStart(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diff);
  return monday.toISOString().split("T")[0];
}

export function getTodayDayOfWeek(): number {
  const day = new Date().getDay();
  return day === 0 ? 6 : day - 1; // 0=Mon, 6=Sun
}

export function classifyTimeSlot(
  timeSlot: string | null
): "morning" | "afternoon" | "evening" {
  if (!timeSlot) return "afternoon";
  const match = timeSlot.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) {
    const lower = timeSlot.toLowerCase();
    if (lower.includes("morning") || lower.includes("am")) return "morning";
    if (lower.includes("evening") || lower.includes("night")) return "evening";
    return "afternoon";
  }
  let hour = parseInt(match[1]);
  const period = match[3].toUpperCase();
  if (period === "PM" && hour !== 12) hour += 12;
  if (period === "AM" && hour === 12) hour = 0;
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}
