// Five specialist role pills arranged 2+2+1 so each pill can stay
// comfortably sized without the bottom row overflowing the card
// width. The lone "Shipped today" at the bottom reads as the
// outcome of the others working together.

import { Bot, PenSquare, Search, Calendar, CheckCircle2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface Pill {
  label: string;
  icon: LucideIcon;
  color: string;
}

const ROWS: Pill[][] = [
  [
    { label: "General Assistant", icon: Bot, color: "#9CC4A4" },
    { label: "Content Writer", icon: PenSquare, color: "#D5847A" },
  ],
  [
    { label: "Market Research", icon: Search, color: "#B58FA0" },
    { label: "This week's plan", icon: Calendar, color: "#7FB3B3" },
  ],
  [{ label: "Shipped today", icon: CheckCircle2, color: "#7FB38A" }],
];

function PillChip({ pill }: { pill: Pill }) {
  const Icon = pill.icon;
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-[#E7DED2] bg-[#FFFDF9] px-2.5 py-1.5 shadow-[0_1px_4px_rgba(30,34,39,0.04)]">
      <Icon
        className="h-3.5 w-3.5 shrink-0"
        strokeWidth={1.75}
        style={{ color: pill.color }}
      />
      <span className="whitespace-nowrap text-[10px] font-medium text-[#2B2B2B]">
        {pill.label}
      </span>
    </div>
  );
}

export function SpecialistsIllustration() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-start gap-2.5 overflow-hidden rounded-xl bg-[#FFFDF9] px-2 pb-3 pt-1">
      {ROWS.map((row, i) => (
        <div key={i} className="flex items-center justify-center gap-2.5">
          {row.map((p) => (
            <PillChip key={p.label} pill={p} />
          ))}
        </div>
      ))}
    </div>
  );
}
