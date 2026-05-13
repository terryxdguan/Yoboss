"use client";

import {
  Dumbbell,
  Briefcase,
  Timer,
  Globe,
  ShoppingBag,
  Plane,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";

interface ExampleGoalsProps {
  onSelect: (text: string) => void;
  compact?: boolean;
}

// Used by the dashboard onboarding's "Welcome" textarea as a fallback when
// no locale context is available; the landing input pulls its placeholder
// from translations directly.
export const GOAL_PLACEHOLDER =
  "Make an additional $10,000 in the next 6 months";

// Back-compat export consumed by dashboard onboarding (server-rendered
// path that hasn't been migrated to translations yet — stage 4 follow-up).
// Strings stay English until that page is wired to next-intl.
export const EXAMPLES: Array<{
  icon: LucideIcon;
  color: string;
  title: string;
  description: string;
  text: string;
}> = [
  {
    icon: Dumbbell,
    color: "#E8858B",
    title: "Lose 30 lbs in 6 months",
    description: "Hit your healthy weight goal through balanced diet and consistent exercise.",
    text: "How to lose 30 lbs (13.6 kg) in 6 months",
  },
  {
    icon: Briefcase,
    color: "#D4C5A0",
    title: "Land a new job",
    description: "Polished resume, targeted outreach, and prep for the interviews that matter.",
    text: "I want to land a new job in 3 months",
  },
  {
    icon: Timer,
    color: "#C9B88C",
    title: "Complete a marathon",
    description: "Structured 16-week training block for peak performance.",
    text: "I want to complete my first marathon in 16 weeks",
  },
  {
    icon: Globe,
    color: "#7BA8D9",
    title: "Learn a new language",
    description: "Daily immersion and conversational practice milestones.",
    text: "I want to become conversationally fluent in Spanish",
  },
  {
    icon: ShoppingBag,
    color: "#8BC5A3",
    title: "Launch an online shop",
    description: "Set up your storefront, products, and first conversion flow.",
    text: "I want to launch an online store selling handmade goods",
  },
  {
    icon: Plane,
    color: "#7C2DE8",
    title: "Plan a six-day trip",
    description: "Map the itinerary, routes, and key bookings for both cities.",
    text: "I want to plan a 6-day trip to Tokyo and Kyoto",
  },
];

const EXAMPLE_KEYS: {
  key: "lose" | "job" | "marathon" | "language" | "shop" | "trip";
  icon: LucideIcon;
  color: string;
}[] = [
  { key: "lose", icon: Dumbbell, color: "#E8858B" },
  { key: "job", icon: Briefcase, color: "#D4C5A0" },
  { key: "marathon", icon: Timer, color: "#C9B88C" },
  { key: "language", icon: Globe, color: "#7BA8D9" },
  { key: "shop", icon: ShoppingBag, color: "#8BC5A3" },
  { key: "trip", icon: Plane, color: "#7C2DE8" },
];

export function ExampleGoals({ onSelect, compact }: ExampleGoalsProps) {
  const t = useTranslations("landing.examples");

  return (
    <div className={`grid grid-cols-2 md:grid-cols-3 mx-auto ${compact ? "gap-2.5 max-w-3xl" : "gap-3 max-w-4xl"}`}>
      {EXAMPLE_KEYS.map(({ key, icon: Icon, color }) => {
        const title = t(`${key}.title`);
        const text = t(`${key}.text`);
        return (
          <button
            key={key}
            onClick={() => onSelect(text)}
            className={`group cursor-pointer bg-[#F6F3EE] hover:bg-[#FFFFFF] rounded-xl text-left transition-all duration-200 border border-transparent hover:border-[#E7DED2] hover:shadow-[0_0_24px_0_rgba(30,34,39,0.06)] min-w-0 ${
              compact ? "px-3.5 py-2.5" : "px-5 py-3"
            }`}
          >
            <div className="flex items-center gap-2 flex-nowrap overflow-hidden">
              <Icon className={`${compact ? "h-4 w-4" : "h-5 w-5"} shrink-0`} strokeWidth={1.75} style={{ color }} />
              <h3 className={`font-medium text-[#2B2B2B] truncate ${compact ? "text-xs" : "text-sm"}`}>
                {title}
              </h3>
            </div>
          </button>
        );
      })}
    </div>
  );
}
