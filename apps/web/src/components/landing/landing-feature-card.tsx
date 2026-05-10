// Card shell used by the three large feature cards on the landing page.
// Title + body sit on top; the illustration fills a fixed-aspect slot
// underneath so all three cards line up evenly.

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
      {/* Icon chip */}
      <div
        className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg"
        style={{ backgroundColor: iconBg, color: iconColor }}
      >
        <Icon className="h-4 w-4" strokeWidth={1.75} />
      </div>

      <h3 className="mb-2 text-base font-semibold leading-snug text-[#2B2B2B]">
        {title}
      </h3>
      <p className="mb-4 text-sm leading-relaxed text-[#6F6A64]">{body}</p>

      {/* Illustration slot — 4:3 aspect locks alignment across cards */}
      <div className="mt-auto aspect-[4/3] w-full overflow-hidden rounded-xl bg-[#F6F3EE]">
        {illustration}
      </div>
    </div>
  );
}
