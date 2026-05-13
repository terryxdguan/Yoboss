"use client";

import { useState, useEffect, useCallback } from "react";
import { Sidebar } from "./sidebar";
import { TopNav } from "./top-nav";
import { ChatFab } from "./chat-fab";
import { ChatPanel } from "./chat-panel";
import { FeedbackWidget } from "@/components/feedback/feedback-widget";

interface AppShellProps {
  children: React.ReactNode;
  userAvatar?: string | null;
  userName?: string;
}

export function AppShell({ children, userAvatar, userName }: AppShellProps) {
  const [chatOpen, setChatOpen] = useState(false);

  const openChat = useCallback(() => setChatOpen(true), []);
  const closeChat = useCallback(() => setChatOpen(false), []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setChatOpen((prev) => !prev);
      }
    };
    // Programmatic open from anywhere in the tree via the
    // `yoboss:open-chat` event — keeps the keyboard shortcut and any
    // future opener wired without prop drilling.
    const handleOpenChat = () => setChatOpen(true);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("yoboss:open-chat", handleOpenChat);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("yoboss:open-chat", handleOpenChat);
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#FDFAF6]">
      <TopNav userAvatar={userAvatar} userName={userName} />
      <Sidebar />

      <main className="ml-20 min-h-screen px-6 md:px-8 pt-24 pb-12">
        <div className="max-w-[1440px] mx-auto">{children}</div>
      </main>

      <ChatPanel open={chatOpen} onClose={closeChat} />
      <FeedbackWidget />
    </div>
  );
}
