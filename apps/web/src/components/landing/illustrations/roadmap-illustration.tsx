// Roadmap illustration for the first feature card on the landing page.
// A dashed rising path with three milestone dots and a flag at the
// destination, plus a small "This week" calendar widget tucked into
// the top-left corner to anchor the "roadmap + weekly plan" promise.

import { Flag, Calendar } from "lucide-react";

export function RoadmapIllustration() {
  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl bg-[#FFFFFF] px-4 py-3">
      {/* Mini "This week" calendar — visual nod to the weekly plan
          half of the body copy. */}
      <div className="absolute left-3 top-3 z-10 flex flex-col items-start gap-1 rounded-md border border-[#E7DED2] bg-[#FFFFFF] px-1.5 py-1 shadow-[0_1px_3px_rgba(30,34,39,0.06)]">
        <div className="flex items-center gap-1">
          <Calendar className="h-2.5 w-2.5 text-[#7C2DE8]" strokeWidth={2} />
          <span className="text-[7px] font-semibold text-[#2B2B2B]">
            This week
          </span>
        </div>
        <div className="flex items-center gap-[2px]">
          {["#9CC4A4", "#C9A968", "#D5847A", "#7FB3B3", "#B58FA0"].map(
            (c, i) => (
              <div
                key={i}
                className="h-1 w-1.5 rounded-sm"
                style={{ backgroundColor: c, opacity: 0.75 }}
              />
            ),
          )}
        </div>
      </div>

      <svg
        viewBox="0 0 200 70"
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full"
        aria-hidden
      >
        {/* Subtle baseline */}
        <line x1="0" y1="60" x2="200" y2="60" stroke="#F6F3EE" strokeWidth="1" />
        {/* Rising path */}
        <path
          d="M 10 55 Q 50 50 80 35 T 150 20 L 180 12"
          fill="none"
          stroke="#DDD3C7"
          strokeWidth="1.5"
          strokeDasharray="3 3"
        />
        {/* Milestone dots */}
        <circle cx="10" cy="55" r="4" fill="#7C2DE8" />
        <circle cx="80" cy="35" r="4" fill="#7FB38A" />
        <circle cx="150" cy="20" r="3" fill="#C9A968" opacity="0.55" />
        <circle cx="180" cy="12" r="3" fill="#9B6B5C" opacity="0.4" />
      </svg>
      {/* Flag perched at the path's end. Positioned in % so it tracks
          the SVG as the slot scales. */}
      <Flag
        className="absolute right-[8%] top-[10%] h-4 w-4 text-[#2B2B2B]"
        strokeWidth={1.75}
      />
    </div>
  );
}
