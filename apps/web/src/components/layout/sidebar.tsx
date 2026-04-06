"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutGrid,
  Flag,
  ListChecks,
  GitBranch,
  Users,
  HelpCircle,
  LogOut,
} from "lucide-react";
import { createClient } from "@/lib/db/client";

const NAV_ITEMS = [
  { href: "/dashboard", icon: LayoutGrid, label: "Dashboard" },
  { href: "/goals", icon: Flag, label: "Goal" },
  { href: "/todos", icon: ListChecks, label: "To-Do List" },
  { href: "/workflows", icon: GitBranch, label: "Workflows" },
  { href: "/team", icon: Users, label: "Team" },
];

export function Sidebar() {
  const pathname = usePathname();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  return (
    <aside className="fixed left-0 top-16 z-30 h-[calc(100vh-64px)] w-20 hover:w-64 overflow-hidden border-r border-[#E6E1D8] bg-[#F7F5F1]/96 backdrop-blur-xl transition-all duration-300 group">
      <div className="flex h-full flex-col px-4 py-4">
        {/* Nav items */}
        <div className="space-y-2">
          {NAV_ITEMS.map((item) => {
            const isActive =
              pathname === item.href ||
              pathname?.startsWith(`${item.href}/`);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-4 rounded-xl px-3 py-3 transition-colors",
                  isActive
                    ? "bg-white border border-[#E6E1D8] text-[#1E2227] shadow-[0_8px_24px_rgba(30,34,39,0.05)]"
                    : "text-[#626A73] hover:bg-white hover:text-[#1E2227]"
                )}
              >
                <Icon className="h-5 w-5 shrink-0" />
                <span className="opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap font-medium text-sm">
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>

        {/* Bottom */}
        <div className="mt-auto space-y-2">
          <div className="h-px bg-[#E6E1D8] my-2" />
          <Link
            href="/help"
            className="flex items-center gap-4 rounded-xl px-3 py-3 text-[#626A73] hover:bg-white hover:text-[#1E2227] transition-colors"
          >
            <HelpCircle className="h-5 w-5 shrink-0" />
            <span className="opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap text-sm">
              Help
            </span>
          </Link>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-4 rounded-xl px-3 py-3 text-[#626A73] hover:bg-white hover:text-[#1E2227] transition-colors"
          >
            <LogOut className="h-5 w-5 shrink-0" />
            <span className="opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap text-sm">
              Logout
            </span>
          </button>
        </div>
      </div>
    </aside>
  );
}
