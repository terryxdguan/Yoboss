"use client";

import { useState, useEffect } from "react";
import { Plus, RefreshCw } from "lucide-react";
import Link from "next/link";
import { WorkflowPickerModal } from "./workflow-picker-modal";
import type { WorkflowSummary } from "@/lib/types/database";

const FAVORITES_KEY = "yoboss_favorite_workflows";

function loadFavorites(): string[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]"); } catch { return []; }
}
function saveFavorites(ids: string[]) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(ids));
}

function relativeTime(iso: string | null): string {
  if (!iso) return "Never run";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface Props {
  workflows: WorkflowSummary[];
}

export function DashboardFavoriteWorkflows({ workflows }: Props) {
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    setFavoriteIds(loadFavorites());
    setMounted(true);
  }, []);

  const favorites = workflows.filter(w => favoriteIds.includes(w.id));

  const handleSave = (ids: string[]) => {
    setFavoriteIds(ids);
    saveFavorites(ids);
    setShowPicker(false);
  };

  if (!mounted) return null;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-[#2B2B2B]">Favorite Workflows</h2>
          <p className="mt-1 text-sm text-[#6F6A64]">Quick access to your most-used automations.</p>
        </div>
        <button
          onClick={() => setShowPicker(true)}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-[#E7DED2] bg-[#FFFDF9] text-[#6F6A64] hover:bg-[#F1ECE4] hover:text-[#2B2B2B] transition-colors"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      {favorites.length === 0 ? (
        <div className="rounded-[18px] border border-dashed border-[#E7DED2] bg-[#FFFDF9] p-8 text-center">
          <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-[#F1ECE4] flex items-center justify-center">
            <RefreshCw className="h-5 w-5 text-[#9B948B]" />
          </div>
          <p className="text-sm text-[#6F6A64]">Add your most-used workflows here</p>
          <button
            onClick={() => setShowPicker(true)}
            className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium text-[#7FAEE6] bg-[#EAF3FD] hover:bg-[#7FAEE6]/20 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Workflow
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {favorites.map(wf => (
            <Link
              key={wf.id}
              href="/workflows"
              className="rounded-[18px] border border-[#E7DED2] bg-[#FFFDF9] p-5 shadow-[0_4px_16px_rgba(43,43,43,0.04)] hover:shadow-[0_10px_28px_rgba(43,43,43,0.08)] hover:border-[#DDD3C7] transition-all"
            >
              <div className="flex items-center gap-2 mb-2">
                <span
                  className={`h-2 w-2 rounded-full shrink-0 ${
                    wf.lastRunStatus === "success" ? "bg-[#7FB38A]" :
                    wf.lastRunStatus === "failed" ? "bg-[#D5847A]" :
                    "bg-[#9B948B]"
                  }`}
                />
                <p className="text-sm font-semibold text-[#2B2B2B] truncate">{wf.name}</p>
              </div>
              {wf.description && (
                <p className="text-[11px] text-[#6F6A64] truncate mb-2">{wf.description}</p>
              )}
              <p className="text-[10px] text-[#9B948B]">{relativeTime(wf.lastRunAt)}</p>
            </Link>
          ))}

          {/* Add more button */}
          <button
            onClick={() => setShowPicker(true)}
            className="rounded-[18px] border border-dashed border-[#E7DED2] bg-[#FFFDF9] p-5 flex flex-col items-center justify-center gap-2 hover:bg-[#F6F3EE] transition-colors min-h-[100px]"
          >
            <Plus className="h-5 w-5 text-[#9B948B]" />
            <span className="text-xs text-[#9B948B]">Add more</span>
          </button>
        </div>
      )}

      {showPicker && (
        <WorkflowPickerModal
          workflows={workflows}
          selectedIds={favoriteIds}
          onSave={handleSave}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}
