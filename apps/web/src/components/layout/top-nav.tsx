"use client";

import { Search, Inbox, Settings } from "lucide-react";

interface TopNavProps {
  userAvatar?: string | null;
  userName?: string;
}

export function TopNav({ userAvatar, userName }: TopNavProps) {
  return (
    <nav className="fixed top-0 inset-x-0 z-50 h-16 border-b border-[#E6E1D8] bg-[#F7F5F1]/90 backdrop-blur-xl shadow-[0_6px_18px_rgba(30,34,39,0.04)]">
      <div className="max-w-[1440px] mx-auto h-full px-6 md:px-8 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <span className="text-[22px] font-semibold tracking-tight text-[#1E2227]">
            YoBoss
          </span>
        </div>

        <div className="flex items-center gap-3 md:gap-4">
          {/* Search */}
          <div className="relative hidden sm:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8C939B] h-4 w-4" />
            <input
              type="text"
              placeholder="Search tasks..."
              className="w-64 rounded-full border border-[#E6E1D8] bg-white pl-10 pr-4 py-2 text-sm text-[#1E2227] placeholder:text-[#8C939B] focus:border-[#4C7CF0] focus:ring-4 focus:ring-[#4C7CF0]/10 outline-none transition-all"
            />
          </div>

          {/* Inbox */}
          <button className="relative h-10 w-10 flex items-center justify-center rounded-full border border-[#E6E1D8] bg-white text-[#626A73] hover:bg-[#F1EEE8] hover:text-[#1E2227] transition-colors">
            <Inbox className="h-5 w-5" />
            <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-[#4C7CF0]" />
          </button>

          {/* Settings */}
          <button className="h-10 w-10 flex items-center justify-center rounded-full border border-[#E6E1D8] bg-white text-[#626A73] hover:bg-[#F1EEE8] hover:text-[#1E2227] transition-colors">
            <Settings className="h-5 w-5" />
          </button>

          {/* Avatar */}
          {userAvatar ? (
            <img
              alt={userName || "User"}
              className="h-9 w-9 rounded-full object-cover border border-[#E6E1D8]"
              src={userAvatar}
            />
          ) : (
            <div className="h-9 w-9 rounded-full bg-[#4C7CF0] flex items-center justify-center text-white text-xs font-semibold border border-[#E6E1D8]">
              {(userName || "U").charAt(0).toUpperCase()}
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
