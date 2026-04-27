import {
  Dumbbell,
  Rocket,
  Timer,
  Globe,
  ShoppingBag,
  Plane,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface ExampleGoalsProps {
  onSelect: (text: string) => void;
  compact?: boolean;
}

export const EXAMPLES: {
  icon: LucideIcon;
  color: string;
  title: string;
  description: string;
  text: string;
}[] = [
  {
    icon: Dumbbell,
    color: "#E8858B",    // pink character (planner with clipboard)
    title: "Lose 30 lbs in 6 months",
    description: "Hit your healthy weight goal through balanced diet and consistent exercise.",
    text: "How to lose 30 lbs (13.6 kg) in 6 months",
  },
  {
    icon: Rocket,
    color: "#D4C5A0",    // beige character (with laptop + duck)
    title: "Launch an AI product",
    description: "From prompt engineering to full-stack deployment.",
    text: "I want to build and launch an AI-powered product from scratch",
  },
  {
    icon: Timer,
    color: "#C9B88C",    // tan character (waving, with hat)
    title: "Complete a marathon",
    description: "Structured 16-week training block for peak performance.",
    text: "I want to complete my first marathon in 16 weeks",
  },
  {
    icon: Globe,
    color: "#7BA8D9",    // blue character (with glasses)
    title: "Learn a new language",
    description: "Daily immersion and conversational practice milestones.",
    text: "I want to become conversationally fluent in Spanish",
  },
  {
    icon: ShoppingBag,
    color: "#8BC5A3",    // green character (with headphones)
    title: "Launch an online shop",
    description: "Set up your storefront, products, and first conversion flow.",
    text: "I want to launch an online store selling handmade goods",
  },
  {
    icon: Plane,
    color: "#7FAEE6",    // accent blue (lightbulb/ideas)
    title: "Plan a six-day trip",
    description: "Map the itinerary, routes, and key bookings for both cities.",
    text: "I want to plan a 6-day trip to Tokyo and Kyoto",
  },
];

export function ExampleGoals({ onSelect, compact }: ExampleGoalsProps) {
  return (
    <div className={`grid grid-cols-2 md:grid-cols-3 mx-auto ${compact ? "gap-2.5 max-w-3xl" : "gap-3 max-w-4xl"}`}>
      {EXAMPLES.map((example) => {
        const Icon = example.icon;
        return (
          <button
            key={example.title}
            onClick={() => onSelect(example.text)}
            className={`group cursor-pointer bg-[#F1ECE4] hover:bg-[#FFFDF9] rounded-xl text-left transition-all duration-200 border border-transparent hover:border-[#E7DED2] hover:shadow-[0_0_24px_0_rgba(30,34,39,0.06)] min-w-0 ${
              compact ? "px-3.5 py-2.5" : "px-5 py-3"
            }`}
          >
            <div className="flex items-center gap-2 flex-nowrap overflow-hidden">
              <Icon className={`${compact ? "h-4 w-4" : "h-5 w-5"} shrink-0`} strokeWidth={1.75} style={{ color: example.color }} />
              <h3 className={`font-medium text-[#2B2B2B] truncate ${compact ? "text-xs" : "text-sm"}`}>
                {example.title}
              </h3>
            </div>
          </button>
        );
      })}
    </div>
  );
}
