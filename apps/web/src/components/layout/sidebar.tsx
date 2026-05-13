"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
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

type NavKey = "dashboard" | "goals" | "todos" | "team" | "workflows";

const NAV_ITEMS: Array<{ href: string; icon: typeof LayoutGrid; key: NavKey }> = [
  { href: "/dashboard", icon: LayoutGrid, key: "dashboard" },
  { href: "/goals", icon: Flag, key: "goals" },
  { href: "/todos", icon: ListChecks, key: "todos" },
  { href: "/team", icon: UsersRound, key: "team" },
];

const ADVANCED_ITEMS: Array<{ href: string; icon: typeof LayoutGrid; key: NavKey }> = [
  { href: "/workflows", icon: GitBranch, key: "workflows" },
];

export function Sidebar() {
  const pathname = usePathname();
  const t = useTranslations("nav");

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/";
  };

  const isTeamActive =
    pathname === "/team" || pathname?.startsWith("/team/");

  return (
    <aside className="fixed left-0 top-16 z-[45] h-[calc(100vh-64px)] w-20 hover:w-64 overflow-hidden overflow-y-auto border-r border-[#E7DED2] bg-white/96 backdrop-blur-xl transition-all duration-300 group">
      <div className="flex h-full flex-col px-3 py-4">
        <div className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.href === "/team"
                ? isTeamActive
                : pathname === item.href || pathname?.startsWith(`${item.href}/`);
            const Icon = item.icon;

            return (
              <div key={item.href} className="relative">
                {isActive && (
                  <span
                    aria-hidden="true"
                    className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r-full bg-[#7C2DE8]"
                  />
                )}
                <Link
                  href={item.href}
                  className={cn(
                    "flex items-center gap-4 rounded-xl px-4 py-3 transition-colors",
                    isActive
                      ? "bg-[#F3ECFB] text-[#7C2DE8] font-semibold"
                      : "text-[#6F6A64] hover:bg-[#F6F3EE] hover:text-[#1A1829]"
                  )}
                >
                  <Icon
                    className={cn("h-5 w-5 shrink-0", isActive && "text-[#7C2DE8]")}
                  />
                  <span className="opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap font-medium text-sm">
                    {t(item.key)}
                  </span>
                </Link>
              </div>
            );
          })}
        </div>

        <div className="mt-8 border-t border-[#E7DED2] pt-4">
          <p className="mb-2 px-3 font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-[#9B948B] opacity-0 transition-opacity group-hover:opacity-100">
            {t("advanced")}
          </p>
          <div className="space-y-1">
            {ADVANCED_ITEMS.map((item) => {
              const isActive =
                pathname === item.href || pathname?.startsWith(`${item.href}/`);
              const Icon = item.icon;

              return (
                <div key={item.href} className="relative">
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r-full bg-[#7C2DE8]"
                    />
                  )}
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-4 rounded-xl px-4 py-3 transition-colors",
                      isActive
                        ? "bg-[#F3ECFB] text-[#7C2DE8] font-semibold"
                        : "text-[#9B948B] hover:bg-[#F6F3EE] hover:text-[#1A1829]"
                    )}
                  >
                    <Icon
                      className={cn("h-5 w-5 shrink-0", isActive && "text-[#7C2DE8]")}
                    />
                    <span className="opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap font-medium text-sm">
                      {t(item.key)}
                    </span>
                  </Link>
                </div>
              );
            })}
          </div>
        </div>

        {/* Bottom */}
        <div className="mt-auto space-y-2">
          <div className="h-px bg-[#E7DED2] my-2" />
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-4 rounded-xl px-4 py-3 text-[#6F6A64] hover:bg-[#F6F3EE] hover:text-[#1A1829] transition-colors"
          >
            <LogOut className="h-5 w-5 shrink-0" />
            <span className="opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap text-sm">
              {t("logout")}
            </span>
          </button>
        </div>
      </div>
    </aside>
  );
}
