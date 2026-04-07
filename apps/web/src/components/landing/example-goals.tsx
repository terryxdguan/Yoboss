import {
  TrendingUp,
  Rocket,
  Timer,
  Globe,
  ShoppingBag,
  Plane,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface ExampleGoalsProps {
  onSelect: (text: string) => void;
}

const EXAMPLES: {
  icon: LucideIcon;
  color: string;
  title: string;
  description: string;
  text: string;
}[] = [
  {
    icon: TrendingUp,
    color: "#E8858B",    // pink character (planner with clipboard)
    title: "Increase monthly revenue",
    description: "Scale your operations and optimize conversion funnels.",
    text: "I want to increase my monthly revenue by 50% in the next 6 months",
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
    color: "#4C7CF0",    // accent blue (lightbulb/ideas)
    title: "Plan a six-day trip",
    description: "Map the itinerary, routes, and key bookings for both cities.",
    text: "I want to plan a 6-day trip to Tokyo and Kyoto",
  },
];

export function ExampleGoals({ onSelect }: ExampleGoalsProps) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 max-w-3xl mx-auto">
      {EXAMPLES.map((example) => {
        const Icon = example.icon;
        return (
          <button
            key={example.title}
            onClick={() => onSelect(example.text)}
            className="group cursor-pointer px-3.5 py-3 bg-[#F1EEE8] hover:bg-white rounded-lg text-left transition-all duration-200 border border-transparent hover:border-[#E6E1D8] hover:shadow-[0_0_24px_0_rgba(30,34,39,0.06)] min-w-0"
          >
            <div className="flex items-center gap-2 flex-nowrap overflow-hidden">
              <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} style={{ color: example.color }} />
              <h3 className="text-xs font-medium text-[#1E2227] truncate">
                {example.title}
              </h3>
            </div>
            <p className="text-[11px] text-[#626A73] mt-1 line-clamp-1">
              {example.description}
            </p>
          </button>
        );
      })}
    </div>
  );
}
