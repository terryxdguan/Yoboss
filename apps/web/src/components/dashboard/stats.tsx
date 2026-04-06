import { BarChart3, Flag, ListChecks, RefreshCw } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface StatCard {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  badge: string;
  badgeColor: string;
  badgeBg: string;
  extra?: React.ReactNode;
}

const STATS: StatCard[] = [
  {
    icon: BarChart3,
    label: "Overview",
    value: "84.2%",
    detail: "Active goal completion rate",
    badge: "+12%",
    badgeColor: "#4D8B6A",
    badgeBg: "rgba(77,139,106,0.10)",
  },
  {
    icon: Flag,
    label: "Goals",
    value: "12 / 15",
    detail: "",
    badge: "Weekly",
    badgeColor: "#626A73",
    badgeBg: "#F1EEE8",
  },
  {
    icon: ListChecks,
    label: "To-dos",
    value: "38",
    detail: "Completed this week",
    badge: "4 Pending",
    badgeColor: "#4C7CF0",
    badgeBg: "#EAF0FF",
  },
  {
    icon: RefreshCw,
    label: "Workflows",
    value: "06",
    detail: "Active automations",
    badge: "Critical",
    badgeColor: "#C6923D",
    badgeBg: "rgba(198,146,61,0.10)",
  },
];

export function DashboardStats() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
      {STATS.map((stat) => {
        const Icon = stat.icon;
        return (
          <div
            key={stat.label}
            className="rounded-[18px] border border-[#E6E1D8] bg-white p-6 shadow-[0_8px_24px_rgba(30,34,39,0.05)]"
          >
            <div className="mb-4 flex items-start justify-between">
              <span className="rounded-xl bg-[#EAF0FF] p-2 text-[#4C7CF0]">
                <Icon className="h-5 w-5" />
              </span>
              <span
                className="rounded-full px-2.5 py-1 text-xs font-semibold"
                style={{
                  color: stat.badgeColor,
                  backgroundColor: stat.badgeBg,
                }}
              >
                {stat.badge}
              </span>
            </div>
            <p className="text-[11px] uppercase tracking-[0.16em] text-[#8C939B] font-semibold">
              {stat.label}
            </p>
            <h3 className="mt-1 text-3xl font-semibold text-[#1E2227]">
              {stat.value}
            </h3>
            {stat.label === "Goals" ? (
              <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-[#F1EEE8]">
                <div className="h-full w-[80%] rounded-full bg-[#4C7CF0]" />
              </div>
            ) : (
              stat.detail && (
                <p className="mt-2 text-sm text-[#626A73]">{stat.detail}</p>
              )
            )}
          </div>
        );
      })}
    </div>
  );
}
