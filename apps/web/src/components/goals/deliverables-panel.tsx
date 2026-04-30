"use client";

import { useEffect, useState } from "react";
import { X, Paperclip } from "lucide-react";
import { useTranslations } from "next-intl";
import type { GoalDeliverable } from "@/lib/types/database";
import { getGoalDeliverables } from "@/lib/db/actions";
import { DeliverablesTable } from "@/components/common/deliverables-table";

interface DeliverablesPanelProps {
  goalId: string;
  onClose: () => void;
}

export function DeliverablesPanel({ goalId, onClose }: DeliverablesPanelProps) {
  const t = useTranslations("goals.deliverables");
  const [deliverables, setDeliverables] = useState<GoalDeliverable[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getGoalDeliverables(goalId).then((data) => {
      setDeliverables(data);
      setLoading(false);
    });
  }, [goalId]);

  // Esc to close — matches the chat panel UX.
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div
      className="fixed right-0 top-16 bottom-0 z-[45] w-[520px] border-l border-[#E7DED2] bg-[#FFFDF9] flex flex-col shadow-[0_0_48px_rgba(30,34,39,0.08)]"
    >
      {/* Header */}
      <div className="flex items-center justify-between h-14 px-4 border-b border-[#E7DED2] shrink-0">
        <div className="flex items-center gap-2">
          <Paperclip className="h-4 w-4 text-[#007AFF]" />
          <span className="text-sm font-medium text-[#2B2B2B]">{t("title")}</span>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-md text-[#6F6A64] hover:bg-[#F1ECE4] hover:text-[#2B2B2B] transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        <DeliverablesTable deliverables={deliverables} loading={loading} />
      </div>
    </div>
  );
}
