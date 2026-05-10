// Roadmap illustration for the first feature card on the landing page.
// Pure SVG + Tailwind so the bundle stays tiny and the colors come from
// the existing design tokens.
//
// Top half: dashed rising path with three milestone dots and a flag at
// the destination. Bottom half: "This week" mini-calendar with five
// columns of stacked task chips.

import { Flag, RotateCcw } from "lucide-react";

export function RoadmapIllustration() {
  return (
    <div className="relative h-full w-full overflow-hidden rounded-xl bg-[#FFFDF9] p-3">
      {/* Top: rising path */}
      <div className="relative h-[40%] w-full">
        <svg
          viewBox="0 0 200 70"
          className="h-full w-full"
          aria-hidden
        >
          {/* Subtle baseline */}
          <line x1="0" y1="60" x2="200" y2="60" stroke="#F1ECE4" strokeWidth="1" />
          {/* The path itself */}
          <path
            d="M 10 55 Q 50 50 80 35 T 150 20 L 180 12"
            fill="none"
            stroke="#DDD3C7"
            strokeWidth="1.5"
            strokeDasharray="3 3"
          />
          {/* Milestone dots */}
          <circle cx="10" cy="55" r="4" fill="#007AFF" />
          <circle cx="80" cy="35" r="4" fill="#7FB38A" />
          <circle cx="150" cy="20" r="3" fill="#C9A968" opacity="0.55" />
          <circle cx="180" cy="12" r="3" fill="#9B6B5C" opacity="0.4" />
        </svg>
        {/* Flag perched at the path's end (positioned absolutely so it
            scales naturally with the SVG). */}
        <Flag
          className="absolute right-[6%] top-[8%] h-4 w-4 text-[#2B2B2B]"
          strokeWidth={1.75}
        />
      </div>

      {/* Bottom: This week mini calendar */}
      <div className="relative mt-2 rounded-lg border border-[#E7DED2] bg-[#FFFDF9] p-2.5">
        {/* Re-plan affordance, decorative */}
        <div className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full border border-[#E7DED2] bg-[#FFFDF9] text-[#7FB38A]">
          <RotateCcw className="h-3 w-3" strokeWidth={2} />
        </div>

        <p className="mb-1.5 text-[9px] font-semibold text-[#2B2B2B]">
          This week
        </p>

        {/* 5 weekday columns */}
        <div className="grid grid-cols-5 gap-1.5">
          {["Mon", "Tue", "Wed", "Thu", "Fri"].map((day, i) => (
            <div key={day} className="space-y-1">
              <p className="text-[7px] font-medium text-[#9B948B]">{day}</p>
              {/* Two stacked task chips per column. Color rotates so the
                  grid feels lively without random churn between renders. */}
              <div
                className="h-2 w-full rounded-sm"
                style={{
                  backgroundColor: ["#9CC4A4", "#C9A968", "#D5847A", "#7FB3B3", "#B58FA0"][i],
                  opacity: 0.7,
                }}
              />
              <div
                className="h-2 w-full rounded-sm"
                style={{
                  backgroundColor: ["#C9A968", "#D5847A", "#9CC4A4", "#B58FA0", "#7FB3B3"][i],
                  opacity: 0.45,
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
