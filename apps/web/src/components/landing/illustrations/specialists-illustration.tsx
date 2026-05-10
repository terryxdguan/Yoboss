// Six specialist role pills around a central "Your goal" node, with
// dashed connectors. Pure SVG underlay for the lines + absolutely-
// positioned divs for the pills so each pill can pick up Tailwind
// hover/typography styling without needing foreignObject.

import {
  User,
  Bot,
  PenSquare,
  Search,
  Calendar,
  CheckCircle2,
  Plus,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface Pill {
  label: string;
  icon: LucideIcon;
  // Position as a fraction of the container box (0..1).
  x: number;
  y: number;
  color: string;
}

// Hand-tuned positions form a rough ring around the center (0.5, 0.5).
// Tweaks favored avoiding label collisions over geometric purity.
const PILLS: Pill[] = [
  { label: "General Assistant", icon: Bot, x: 0.5, y: 0.07, color: "#9CC4A4" },
  { label: "This week's plan", icon: Calendar, x: 0.92, y: 0.28, color: "#7FB3B3" },
  { label: "Market Researcher", icon: Search, x: 0.92, y: 0.72, color: "#B58FA0" },
  { label: "And more", icon: Plus, x: 0.5, y: 0.93, color: "#9B948B" },
  { label: "Shipped yesterday", icon: CheckCircle2, x: 0.08, y: 0.72, color: "#7FB38A" },
  { label: "Content Writer", icon: PenSquare, x: 0.08, y: 0.28, color: "#D5847A" },
];

export function SpecialistsIllustration() {
  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl bg-[#FFFDF9]">
      {/* Dashed connector lines (underlay). The viewBox uses a 0..1
          coordinate space so positions match the pill placement above. */}
      <svg
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full"
        aria-hidden
      >
        {PILLS.map((p) => (
          <line
            key={p.label}
            x1="0.5"
            y1="0.5"
            x2={p.x}
            y2={p.y}
            stroke="#DDD3C7"
            strokeWidth="0.005"
            strokeDasharray="0.015 0.015"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>

      {/* Center pill: Your goal */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="flex items-center gap-1.5 rounded-full border border-[#E7DED2] bg-[#FFFDF9] px-2.5 py-1 shadow-[0_2px_8px_rgba(30,34,39,0.04)]">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#F1ECE4]">
            <User className="h-3 w-3 text-[#6F6A64]" strokeWidth={2} />
          </span>
          <span className="text-[10px] font-semibold text-[#2B2B2B]">
            Your goal
          </span>
        </div>
      </div>

      {/* Surrounding role pills */}
      {PILLS.map((p) => {
        const Icon = p.icon;
        return (
          <div
            key={p.label}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
          >
            <div className="flex items-center gap-1 rounded-full border border-[#E7DED2] bg-[#FFFDF9] px-2 py-1 shadow-[0_1px_4px_rgba(30,34,39,0.04)]">
              <Icon
                className="h-3 w-3 shrink-0"
                strokeWidth={1.75}
                style={{ color: p.color }}
              />
              <span className="whitespace-nowrap text-[9px] font-medium text-[#2B2B2B]">
                {p.label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
