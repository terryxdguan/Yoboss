"use client";

import { MessageCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChatFabProps {
  onClick: () => void;
  pulse?: boolean;
}

export function ChatFab({ onClick, pulse = false }: ChatFabProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "fixed bottom-6 right-6 z-50",
        "flex items-center justify-center",
        "h-12 w-12 rounded-full",
        "bg-[#7FAEE6] text-white",
        "shadow-[0_2px_8px_rgba(0,0,0,0.10)]",
        "hover:bg-[#6A9DDA] transition-colors",
        "cursor-pointer",
        pulse && "animate-pulse-gentle"
      )}
      aria-label="Open coach chat"
    >
      <MessageCircle className="h-5 w-5" />
    </button>
  );
}
