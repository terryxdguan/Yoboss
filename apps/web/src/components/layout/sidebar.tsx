"use client";

import { useState, useEffect, useCallback, useSyncExternalStore } from "react";
import Link from "next/link";
import Image from "next/image";
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
import { DEFAULT_AGENTS, ALL_AGENTS, DEFAULT_AGENT_AVATAR } from "@/lib/ai/agent-registry";
import { subscribe, getSnapshot, getAgentStatus } from "@/lib/stores/agent-status";

const FAVORITE_MEMBERS_KEY = "yoboss_favorite_members";
const allAgentsList = [...DEFAULT_AGENTS, ...ALL_AGENTS];

function getSidebarAgents() {
  if (typeof window === "undefined") return DEFAULT_AGENTS;
  try {
    const raw = localStorage.getItem(FAVORITE_MEMBERS_KEY);
    const ids: string[] = raw ? JSON.parse(raw) : ["general_assistant"];
    if (ids.length === 0) return DEFAULT_AGENTS.slice(0, 1); // At least General Assistant
    return ids
      .map((id) => allAgentsList.find((a) => a.id === id))
      .filter(Boolean) as typeof DEFAULT_AGENTS;
  } catch {
    return DEFAULT_AGENTS;
  }
}

const NAV_ITEMS = [
  { href: "/dashboard", icon: LayoutGrid, label: "Dashboard" },
  { href: "/goals", icon: Flag, label: "Goal" },
  { href: "/todos", icon: ListChecks, label: "Personal To-Dos" },
  { href: "/workflows", icon: GitBranch, label: "Workflows" },
  { href: "/team", icon: Users, label: "Team" },
];

export function Sidebar() {
  const pathname = usePathname();
  // Subscribe to agent status changes
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // Sidebar agents synced with Dashboard Favorite Members
  // Initialize with DEFAULT_AGENTS to match server render, then sync from localStorage
  const [sidebarAgents, setSidebarAgents] = useState(DEFAULT_AGENTS);

  const refreshAgents = useCallback(() => {
    setSidebarAgents(getSidebarAgents());
  }, []);

  useEffect(() => {
    // Hydrate from localStorage on mount
    refreshAgents();

    // Listen for storage changes (from Dashboard Favorite Members)
    const onStorage = (e: StorageEvent) => {
      if (e.key === FAVORITE_MEMBERS_KEY) refreshAgents();
    };
    window.addEventListener("storage", onStorage);

    // Also poll periodically for same-tab changes (localStorage doesn't fire events in same tab)
    const interval = setInterval(refreshAgents, 2000);

    return () => {
      window.removeEventListener("storage", onStorage);
      clearInterval(interval);
    };
  }, [refreshAgents]);

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
        {/* Nav items */}
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

                {/* Agent sub-items under Team */}
                {item.href === "/team" && (
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity ml-4 mt-1 space-y-0.5">
                    {sidebarAgents.map((agent) => {
                      const agentPath = `/team/chat/${agent.id}`;
                      const isAgentActive = pathname === agentPath;
                      const displayName = agent.label;

                      return (
                        <Link
                          key={agent.id}
                          href={agentPath}
                          className={cn(
                            "flex items-center gap-2.5 rounded-lg px-2 py-2 transition-colors",
                            isAgentActive
                              ? "bg-[#EAF3FD] text-[#2B2B2B]"
                              : "text-[#9B948B] hover:text-[#2B2B2B] hover:bg-[#F1ECE4]"
                          )}
                        >
                          {/* Avatar */}
                          <div className="w-8 h-8 rounded-full overflow-hidden bg-[#F1ECE4] shrink-0">
                            <Image
                              src={agent.avatar || DEFAULT_AGENT_AVATAR}
                              alt={displayName}
                              width={32}
                              height={32}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          {/* Name + status */}
                          <div className="flex-1 min-w-0">
                            <span className="text-[11px] font-medium truncate block">{displayName}</span>
                          </div>
                          {/* Status dot */}
                          {(() => {
                            const status = getAgentStatus(agent.id);
                            return status === "working" ? (
                              <span className="relative w-2.5 h-2.5 shrink-0" title="Working">
                                <span className="absolute inset-0 rounded-full bg-[#D5847A] animate-ping opacity-75" />
                                <span className="relative block w-2.5 h-2.5 rounded-full bg-[#D5847A]" />
                              </span>
                            ) : (
                              <span className="w-2 h-2 rounded-full bg-[#7FB38A] shrink-0" title="Idle" />
                            );
                          })()}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Bottom */}
        <div className="mt-auto space-y-2">
          <div className="h-px bg-[#E7DED2] my-2" />
          <Link
            href="/help"
            className="flex items-center gap-4 rounded-xl px-3 py-3 text-[#6F6A64] hover:bg-[#FFFDF9] hover:text-[#2B2B2B] transition-colors"
          >
            <HelpCircle className="h-5 w-5 shrink-0" />
            <span className="opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap text-sm">
              Help
            </span>
          </Link>
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
