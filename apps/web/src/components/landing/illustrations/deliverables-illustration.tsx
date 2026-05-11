// Five doc tiles arranged 2+3 — PPT / XLSX on top, DOC / HTML / PY
// below. Each tile is just a file icon + extension badge; descriptive
// labels are intentionally omitted because the extensions already
// tell the story.

import { FileText } from "lucide-react";

interface Tile {
  ext: string;
  color: string;
  bg: string;
}

const TOP: Tile[] = [
  { ext: "PPT", color: "#D5847A", bg: "#FBE6E3" },
  { ext: "XLSX", color: "#7FB38A", bg: "#E6F2E8" },
];

const BOTTOM: Tile[] = [
  { ext: "DOC", color: "#5E8FCE", bg: "#E6F2FF" },
  { ext: "HTML", color: "#C9A968", bg: "#F5EDD8" },
  { ext: "PY", color: "#7FB3B3", bg: "#E0EBEB" },
];

function TileCard({ tile }: { tile: Tile }) {
  return (
    <div className="flex w-16 flex-col items-center gap-1 rounded-md border border-[#E7DED2] bg-[#FFFDF9] px-1.5 py-2">
      <div
        className="flex h-8 w-8 items-center justify-center rounded-md"
        style={{ backgroundColor: tile.bg, color: tile.color }}
      >
        <FileText className="h-4 w-4" strokeWidth={1.75} />
      </div>
      <span
        className="rounded-sm px-1 text-[8px] font-bold tracking-wider"
        style={{ backgroundColor: tile.bg, color: tile.color }}
      >
        {tile.ext}
      </span>
    </div>
  );
}

export function DeliverablesIllustration() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-xl bg-[#FFFDF9] px-2 py-3">
      <div className="flex items-stretch justify-center gap-2">
        {TOP.map((t) => (
          <TileCard key={t.ext} tile={t} />
        ))}
      </div>
      <div className="flex items-stretch justify-center gap-2">
        {BOTTOM.map((t) => (
          <TileCard key={t.ext} tile={t} />
        ))}
      </div>
    </div>
  );
}
