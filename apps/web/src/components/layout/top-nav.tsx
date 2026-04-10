"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, Bell, Settings, Check, AlertTriangle } from "lucide-react";
import { getUnreadNotifications, markNotificationRead, markAllNotificationsRead } from "@/lib/db/actions";
import type { Notification } from "@/lib/types/notification";

interface TopNavProps {
  userAvatar?: string | null;
  userName?: string;
}

export function TopNav({ userAvatar, userName }: TopNavProps) {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);

  const loadNotifications = useCallback(async () => {
    try {
      const data = await getUnreadNotifications();
      setNotifications(data);
    } catch {}
  }, []);

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 30000);
    return () => clearInterval(interval);
  }, [loadNotifications]);

  const handleNotificationClick = async (n: Notification) => {
    await markNotificationRead(n.id);
    setNotifications((prev) => prev.filter((x) => x.id !== n.id));
    setShowDropdown(false);
    router.push("/workflows");
  };

  const handleMarkAllRead = async () => {
    await markAllNotificationsRead();
    setNotifications([]);
  };

  return (
    <nav className="fixed top-0 inset-x-0 z-50 h-16 border-b border-[#E7DED2] bg-[#F6F3EE]/90 backdrop-blur-xl shadow-[0_6px_18px_rgba(30,34,39,0.04)]">
      <div className="max-w-[1440px] mx-auto h-full px-6 md:px-8 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/" className="text-[22px] font-semibold tracking-tight text-[#2B2B2B] hover:opacity-80 transition-opacity">
            YoBoss
          </Link>
        </div>

        <div className="flex items-center gap-3 md:gap-4">
          {/* Search */}
          <div className="relative hidden sm:block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9B948B] h-4 w-4" />
            <input
              type="text"
              placeholder="Search tasks..."
              className="w-64 rounded-full border border-[#E7DED2] bg-[#FFFDF9] pl-10 pr-4 py-2 text-sm text-[#2B2B2B] placeholder:text-[#9B948B] focus:border-[#7FAEE6] focus:ring-4 focus:ring-[#7FAEE6]/10 outline-none transition-all"
            />
          </div>

          {/* Notifications */}
          <div className="relative">
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className="relative h-10 w-10 flex items-center justify-center rounded-full border border-[#E7DED2] bg-[#FFFDF9] text-[#6F6A64] hover:bg-[#F1ECE4] hover:text-[#2B2B2B] transition-colors"
            >
              <Bell className="h-5 w-5" />
              {notifications.length > 0 && (
                <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-[#D5847A]" />
              )}
            </button>

            {showDropdown && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowDropdown(false)} />
                <div className="absolute right-0 top-full mt-2 z-50 w-80 bg-[#FFFDF9] border border-[#E7DED2] rounded-xl shadow-[0_12px_40px_rgba(30,34,39,0.12)] overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-[#E7DED2]">
                    <h3 className="text-sm font-semibold text-[#2B2B2B]">Notifications</h3>
                    {notifications.length > 0 && (
                      <button
                        onClick={handleMarkAllRead}
                        className="text-[10px] font-medium text-[#7FAEE6] hover:underline"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="max-h-64 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="py-8 text-center text-xs text-[#9B948B]">
                        No new notifications
                      </div>
                    ) : (
                      notifications.map((n) => (
                        <button
                          key={n.id}
                          onClick={() => handleNotificationClick(n)}
                          className="w-full flex items-start gap-3 px-4 py-3 hover:bg-[#F6F3EE] transition-colors text-left"
                        >
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${n.type === "scheduled_run_complete" ? "bg-[#7FB38A]/10" : "bg-[#D5847A]/10"}`}>
                            {n.type === "scheduled_run_complete" ? (
                              <Check className="h-3.5 w-3.5 text-[#7FB38A]" />
                            ) : (
                              <AlertTriangle className="h-3.5 w-3.5 text-[#D5847A]" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-[#2B2B2B] truncate">{n.title}</p>
                            <p className="text-[10px] text-[#9B948B] mt-0.5">
                              {new Date(n.created_at).toLocaleString()}
                            </p>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Settings */}
          <Link
            href="/settings"
            className="h-10 w-10 flex items-center justify-center rounded-full border border-[#E7DED2] bg-[#FFFDF9] text-[#6F6A64] hover:bg-[#F1ECE4] hover:text-[#2B2B2B] transition-colors"
          >
            <Settings className="h-5 w-5" />
          </Link>

          {/* Avatar */}
          <Link href="/account" className="shrink-0">
            <AvatarImg src={userAvatar} name={userName} size={36} />
          </Link>
        </div>
      </div>
    </nav>
  );
}

function AvatarImg({ src, name, size }: { src?: string | null; name?: string; size: number }) {
  const [failed, setFailed] = useState(false);
  const cls = `rounded-full object-cover border border-[#E7DED2] hover:ring-2 hover:ring-[#7FAEE6]/30 transition-shadow`;

  if (src && !failed) {
    return (
      <img
        alt={name || "User"}
        className={cls}
        style={{ width: size, height: size }}
        src={src}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div
      className={`bg-[#7FAEE6] flex items-center justify-center text-white text-xs font-semibold border border-[#E7DED2] hover:ring-2 hover:ring-[#7FAEE6]/30 transition-shadow rounded-full`}
      style={{ width: size, height: size }}
    >
      {(name || "U").charAt(0).toUpperCase()}
    </div>
  );
}
