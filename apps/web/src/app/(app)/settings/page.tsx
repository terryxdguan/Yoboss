"use client";

import { Settings } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[32px] font-semibold tracking-tight text-[#2B2B2B]">
          Settings
        </h1>
        <p className="mt-1 text-sm text-[#6F6A64]">
          Manage your application preferences and configuration
        </p>
      </div>

      <div className="rounded-xl border border-[#E7DED2] bg-[#FFFDF9] p-6">
        <div className="py-10 text-center">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-[#F1ECE4] flex items-center justify-center">
            <Settings className="h-6 w-6 text-[#9B948B]" />
          </div>
          <p className="text-sm text-[#6F6A64]">No additional settings yet.</p>
          <p className="text-xs text-[#9B948B] mt-1">
            Notification preferences, theme, and other options coming soon.
          </p>
        </div>
      </div>
    </div>
  );
}
