// Real Deliverables illustration: three doc tiles (Pitch Deck PDF,
// Spreadsheet XLSX, Interview Script DOC) connected by a downward
// arrow to a terminal window with a green "Run & deliver" badge.

import { FileText, ArrowDown, CheckCircle2 } from "lucide-react";

interface Tile {
  ext: string;
  label: string;
  color: string;
  bg: string;
}

const TILES: Tile[] = [
  { ext: "PDF", label: "Pitch Deck", color: "#D5847A", bg: "#FBE6E3" },
  { ext: "XLSX", label: "Spreadsheet", color: "#7FB38A", bg: "#E6F2E8" },
  { ext: "DOC", label: "Interview Script", color: "#5E8FCE", bg: "#E6F2FF" },
];

export function DeliverablesIllustration() {
  return (
    <div className="relative flex h-full w-full flex-col items-center justify-between overflow-hidden rounded-xl bg-[#FFFDF9] p-3">
      {/* Top row: three doc tiles */}
      <div className="flex w-full items-center justify-center gap-2">
        {TILES.map((t) => (
          <div
            key={t.ext}
            className="flex flex-1 flex-col items-center gap-1 rounded-md border border-[#E7DED2] bg-[#FFFDF9] px-2 py-2"
          >
            <div
              className="flex h-7 w-7 items-center justify-center rounded-md"
              style={{ backgroundColor: t.bg, color: t.color }}
            >
              <FileText className="h-3.5 w-3.5" strokeWidth={1.75} />
            </div>
            <span
              className="rounded-sm px-1 text-[7px] font-bold tracking-wider"
              style={{ backgroundColor: t.bg, color: t.color }}
            >
              {t.ext}
            </span>
            <span className="text-[7px] font-medium text-[#6F6A64]">
              {t.label}
            </span>
          </div>
        ))}
      </div>

      {/* Connector arrow */}
      <div className="my-1 flex items-center justify-center">
        <ArrowDown className="h-4 w-4 text-[#9B948B]" strokeWidth={1.75} />
      </div>

      {/* Terminal window */}
      <div className="relative w-full overflow-hidden rounded-md bg-[#1E1E1E] shadow-[0_4px_12px_rgba(30,34,39,0.12)]">
        {/* macOS-style window dots */}
        <div className="flex items-center gap-1 border-b border-white/5 px-2 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-[#FF5F57]" />
          <span className="h-1.5 w-1.5 rounded-full bg-[#FEBC2E]" />
          <span className="h-1.5 w-1.5 rounded-full bg-[#28C840]" />
        </div>
        {/* Mock code lines */}
        <div className="space-y-1 px-2 py-2">
          <div className="flex items-center gap-1">
            <span className="h-1 w-3 rounded-sm bg-[#5C9CDB]" />
            <span className="h-1 w-12 rounded-sm bg-[#7FB38A]" />
          </div>
          <div className="flex items-center gap-1 pl-2">
            <span className="h-1 w-2 rounded-sm bg-[#C586C0]" />
            <span className="h-1 w-10 rounded-sm bg-[#CCCCCC]/40" />
            <span className="h-1 w-4 rounded-sm bg-[#D7BA7D]" />
          </div>
          <div className="flex items-center gap-1 pl-2">
            <span className="h-1 w-3 rounded-sm bg-[#5C9CDB]" />
            <span className="h-1 w-8 rounded-sm bg-[#CCCCCC]/40" />
          </div>
        </div>

        {/* "Run & deliver" badge nestled inside the bottom-left of the
            terminal window, like a status indicator. */}
        <div className="flex items-center gap-1 px-2 pb-1.5">
          <CheckCircle2 className="h-2.5 w-2.5 text-[#28C840]" strokeWidth={2.5} />
          <span className="text-[7px] font-medium text-[#28C840]">
            Run &amp; deliver
          </span>
        </div>
      </div>
    </div>
  );
}
