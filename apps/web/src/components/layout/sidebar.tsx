"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutGrid,
  Flag,
  ListChecks,
  GitBranch,
  UsersRound,
  LogOut,
} from "lucide-react";
import { createClient } from "@/lib/db/client";

const NAV_ITEMS = [
  { href: "/dashboard", icon: LayoutGrid, label: "Dashboard" },
  { href: "/goals", icon: Flag, label: "Goals" },
  { href: "/todos", icon: ListChecks, label: "To-Dos" },
  { href: "/team", icon: UsersRound, label: "Team" },
];

const ADVANCED_ITEMS = [
  { href: "/workflows", icon: GitBranch, label: "Workflows" },
];

export function Sidebar() {
  const pathname = usePathname();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  const isTeamActive =
    pathname === "/team" || pathname?.startsWith("/team/");

  return (
    <aside className="fixed left-0 top-16 z-[45] h-[calc(100vh-64px)] w-20 hover:w-64 overflow-hidden overflow-y-auto border-r border-[#E7DED2] bg-[#F6F3EE]/96 backdrop-blur-xl transition-all duration-300 group">
      <div className="flex h-full flex-col px-4 py-4">
        <div className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.href === "/team"
                ? isTeamActive
                : pathname === item.href || pathname?.startsWith(`${item.href}/`);
            const Icon = item.icon;

            return (
              <div key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-4 rounded-xl px-3 py-3 transition-colors",
                    isActive
                      ? "bg-[#FFFDF9] border border-[#E7DED2] text-[#2B2B2B] shadow-[0_8px_24px_rgba(30,34,39,0.05)]"
                      : "text-[#6F6A64] hover:bg-[#FFFDF9] hover:text-[#2B2B2B]"
                  )}
                >
                  <Icon className="h-5 w-5 shrink-0" />
                  <span className="opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap font-medium text-sm">
                    {item.label}
                  </span>
                </Link>
              </div>
            );
          })}
        </div>

        <div className="mt-8 border-t border-[#E7DED2] pt-4">
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#9B948B] opacity-0 transition-opacity group-hover:opacity-100">
            Advanced
          </p>
          <div className="space-y-1">
            {ADVANCED_ITEMS.map((item) => {
              const isActive =
                pathname === item.href || pathname?.startsWith(`${item.href}/`);
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-4 rounded-xl px-3 py-3 transition-colors",
                    isActive
                      ? "bg-[#FFFDF9] border border-[#E7DED2] text-[#2B2B2B] shadow-[0_8px_24px_rgba(30,34,39,0.05)]"
                      : "text-[#9B948B] hover:bg-[#FFFDF9] hover:text-[#2B2B2B]"
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
        </div>

        {/* Bottom */}
        <div className="mt-auto space-y-2">
          <div className="h-px bg-[#E7DED2] my-2" />
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-4 rounded-xl px-3 py-3 text-[#6F6A64] hover:bg-[#FFFDF9] hover:text-[#2B2B2B] transition-colors"
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
