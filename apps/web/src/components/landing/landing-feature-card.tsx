// Card shell used by the three large feature cards on the landing page.
// Icon + title share one row; body sits below; the illustration fills a
// fixed-aspect slot underneath so all three cards line up evenly.

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface LandingFeatureCardProps {
  icon: LucideIcon;
  iconColor: string;
  iconBg: string;
  title: string;
  body: string;
  illustration: ReactNode;
}

export function LandingFeatureCard({
  icon: Icon,
  iconColor,
  iconBg,
  title,
  body,
  illustration,
}: LandingFeatureCardProps) {
  return (
    <div className="flex h-full flex-col rounded-2xl border border-[#E7DED2] bg-[#FFFDF9] p-5 transition-all hover:border-[#DDD3C7] hover:shadow-[0_8px_24px_rgba(30,34,39,0.06)]">
      {/* Icon + title on the same row */}
      <div className="mb-2 flex items-center gap-2.5">
        <div
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
          style={{ backgroundColor: iconBg, color: iconColor }}
        >
          <Icon className="h-3.5 w-3.5" strokeWidth={1.75} />
        </div>
        <h3 className="text-base font-semibold leading-snug text-[#2B2B2B]">
          {title}
        </h3>
      </div>
      <p className="mb-3 text-sm leading-relaxed text-[#6F6A64]">{body}</p>

      {/* Illustration slot — grows to fill the remaining vertical
          space so the cards line up by total height without leaving
          a visible gap between body text and the illustration. */}
      <div className="flex min-h-[140px] w-full flex-1 overflow-hidden rounded-xl bg-[#F6F3EE]">
        {illustration}
      </div>
    </div>
  );
}
