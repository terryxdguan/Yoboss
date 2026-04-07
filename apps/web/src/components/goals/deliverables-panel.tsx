"use client";

import { useEffect, useState } from "react";
import { X, Paperclip, Plus, ExternalLink, Trash2, FileText, Image, File } from "lucide-react";
import type { GoalDeliverable } from "@/lib/types/database";
import { getGoalDeliverables, addGoalDeliverable, deleteGoalDeliverable } from "@/lib/db/actions";

interface DeliverablesPanelProps {
  goalId: string;
  onClose: () => void;
}

function fileTypeIcon(fileType: string | null) {
  if (!fileType) return <File className="h-4 w-4 text-[#9B948B]" />;
  if (fileType.startsWith("image/")) return <Image className="h-4 w-4 text-[#7FAEE6]" />;
  if (fileType.includes("pdf") || fileType.includes("document")) return <FileText className="h-4 w-4 text-[#D5847A]" />;
  return <File className="h-4 w-4 text-[#9B948B]" />;
}

export function DeliverablesPanel({ goalId, onClose }: DeliverablesPanelProps) {
  const [deliverables, setDeliverables] = useState<GoalDeliverable[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    getGoalDeliverables(goalId).then((data) => {
      setDeliverables(data);
      setLoading(false);
    });
  }, [goalId]);

  const handleAdd = async () => {
    if (!title.trim()) return;
    setAdding(true);
    try {
      const d = await addGoalDeliverable({
        goalId,
        title: title.trim(),
        url: url.trim() || undefined,
      });
      setDeliverables((prev) => [d, ...prev]);
      setTitle("");
      setUrl("");
    } catch (err) {
      console.error("Add deliverable error:", err);
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteGoalDeliverable(id);
      setDeliverables((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      console.error("Delete deliverable error:", err);
    }
  };

  return (
    <div className="w-96 shrink-0 border-l border-[#E7DED2] bg-[#F6F3EE] flex flex-col h-[calc(100vh-96px)] sticky top-0">
      {/* Header */}
      <div className="flex items-center justify-between h-14 px-4 border-b border-[#E7DED2]">
        <div className="flex items-center gap-2">
          <Paperclip className="h-4 w-4 text-[#7FAEE6]" />
          <span className="text-sm font-medium text-[#2B2B2B]">Deliverables</span>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-md text-[#6F6A64] hover:bg-[#F1ECE4] hover:text-[#2B2B2B] transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <p className="text-sm text-[#9B948B] text-center py-8">Loading...</p>
        ) : deliverables.length === 0 ? (
          <div className="text-center py-8">
            <Paperclip className="h-8 w-8 text-[#E7DED2] mx-auto mb-2" />
            <p className="text-sm text-[#9B948B]">No deliverables yet</p>
            <p className="text-xs text-[#9B948B] mt-1">Add files, links, or AI-generated outputs</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {deliverables.map((d) => (
              <li
                key={d.id}
                className="group flex items-start gap-3 p-3 rounded-lg border border-[#E7DED2] bg-[#FFFDF9] hover:border-[#DDD3C7] transition-colors"
              >
                {fileTypeIcon(d.file_type)}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#2B2B2B] truncate">{d.title}</p>
                  {d.url && (
                    <a
                      href={d.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-[#7FAEE6] hover:underline flex items-center gap-1 mt-0.5"
                    >
                      <ExternalLink className="h-3 w-3" />
                      <span className="truncate">{d.url}</span>
                    </a>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    {d.source === "ai_generated" && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[#7FAEE6]/10 text-[#7FAEE6]">AI</span>
                    )}
                    <span className="text-[10px] text-[#9B948B]">
                      {new Date(d.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => handleDelete(d.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-[#D5847A]/10 transition-all"
                >
                  <Trash2 className="h-3.5 w-3.5 text-[#D5847A]" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Add form */}
      <div className="border-t border-[#E7DED2] px-4 py-3 space-y-2">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title (e.g., Flight itinerary)"
          className="w-full text-sm bg-[#FFFDF9] border border-[#DDD3C7] rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-[#7FAEE6]/30 focus:border-transparent placeholder:text-[#9B948B] text-[#2B2B2B]"
        />
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="URL (optional)"
          className="w-full text-sm bg-[#FFFDF9] border border-[#DDD3C7] rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-[#7FAEE6]/30 focus:border-transparent placeholder:text-[#9B948B] text-[#2B2B2B]"
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd();
          }}
        />
        <button
          onClick={handleAdd}
          disabled={!title.trim() || adding}
          className="w-full flex items-center justify-center gap-1.5 text-sm font-medium py-2 rounded-lg bg-[#7FAEE6] text-white hover:bg-[#6A9DDA] active:scale-[0.98] transition-all disabled:opacity-40"
        >
          <Plus className="h-4 w-4" />
          {adding ? "Adding..." : "Add Deliverable"}
        </button>
      </div>
    </div>
  );
}
