"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Package,
  Download,
  X,
  FileText,
  AlertTriangle,
  CheckCircle,
  Clock,
} from "lucide-react";
import type { WorkflowRun, GeneratedFile } from "@/lib/types/workflow";

export interface DeliverableItem {
  fileId: string;
  filename: string;
  source: string; // e.g. "Step 1" or "Follow-up chat"
  createdAt: Date;
}

export function extractDeliverablesFromRun(run: WorkflowRun): DeliverableItem[] {
  const items: DeliverableItem[] = [];
  const runDate = new Date(run.started_at);

  // From step results
  if (run.step_results) {
    for (let i = 0; i < run.step_results.length; i++) {
      const sr = run.step_results[i];
      if (sr.files && sr.files.length > 0) {
        for (const f of sr.files) {
          items.push({
            fileId: f.fileId,
            filename: f.filename,
            source: `Step ${i + 1}`,
            createdAt: runDate,
          });
        }
      }
    }
  }

  // From follow-up messages
  if (run.follow_up_messages) {
    for (const fm of run.follow_up_messages) {
      if (fm.generatedFiles && fm.generatedFiles.length > 0) {
        for (const f of fm.generatedFiles) {
          items.push({
            fileId: f.fileId,
            filename: f.filename,
            source: "Follow-up chat",
            createdAt: runDate, // approximate — we don't have per-message timestamps
          });
        }
      }
    }
  }

  return items;
}

function getFileStatus(createdAt: Date): {
  label: string;
  expired: boolean;
  daysLeft: number;
} {
  const now = new Date();
  const diffMs = now.getTime() - createdAt.getTime();
  const daysPassed = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const daysLeft = 30 - daysPassed;

  if (daysLeft <= 0) {
    return { label: "Expired", expired: true, daysLeft: 0 };
  }
  if (daysLeft <= 7) {
    return { label: `Expires in ${daysLeft}d`, expired: false, daysLeft };
  }
  return { label: `${daysLeft}d remaining`, expired: false, daysLeft };
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// --- Inline popover used inside workflow-run-view header ---
export function DeliverablesButton({
  run,
  items: itemsProp,
}: {
  run?: WorkflowRun | null;
  items?: DeliverableItem[];
}) {
  const tWf = useTranslations("workflows.deliverables");
  const [open, setOpen] = useState(false);

  const items = itemsProp || (run ? extractDeliverablesFromRun(run) : []);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors bg-[#FFFDF9] border-[#E7DED2] text-[#2B2B2B] hover:bg-[#F1ECE4]"
      >
        <Package className="h-3.5 w-3.5" />
        Deliverables
        {items.length > 0 && (
          <span className="ml-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#007AFF]/10 text-[#007AFF]">
            {items.length}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-50" onClick={() => setOpen(false)} />

          {/* Popover */}
          <div className="absolute top-full left-0 mt-2 z-50 w-[420px] bg-[#FFFDF9] border border-[#E7DED2] rounded-xl shadow-[0_12px_40px_rgba(30,34,39,0.12)] overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#E7DED2]">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-[#007AFF]" />
                <h3 className="text-sm font-semibold text-[#2B2B2B]">
                  Deliverables
                </h3>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded-md text-[#9B948B] hover:text-[#2B2B2B] hover:bg-[#F1ECE4] transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Notice */}
            <div className="px-4 py-2 bg-[#FFF8ED] border-b border-[#E7DED2]">
              <p className="text-[10px] text-[#9B948B] flex items-center gap-1.5">
                <Clock className="h-3 w-3 shrink-0" />
                Files are available for download within 30 days of creation. Expired files cannot be recovered.
              </p>
            </div>

            {/* File list */}
            <div className="max-h-[360px] overflow-y-auto">
              {items.length === 0 ? (
                <div className="py-10 text-center">
                  <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-[#F1ECE4] flex items-center justify-center">
                    <FileText className="h-5 w-5 text-[#9B948B]" />
                  </div>
                  <p className="text-sm text-[#6F6A64]">{tWf("noFiles")}</p>
                  <p className="text-xs text-[#9B948B] mt-1">
                    Files created during workflow execution will appear here
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-[#F1ECE4]">
                  {items.map((item, i) => {
                    const status = getFileStatus(item.createdAt);
                    return (
                      <div
                        key={`${item.fileId}-${i}`}
                        className="flex items-center gap-3 px-4 py-3 hover:bg-[#F6F3EE]/50 transition-colors"
                      >
                        {/* File icon */}
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${status.expired ? "bg-[#D5847A]/10" : "bg-[#007AFF]/10"}`}
                        >
                          <FileText
                            className={`h-4 w-4 ${status.expired ? "text-[#D5847A]" : "text-[#007AFF]"}`}
                          />
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          {status.expired ? (
                            <p className="text-sm font-medium text-[#9B948B] truncate line-through">
                              {item.filename}
                            </p>
                          ) : (
                            <a
                              href={`/api/ai/files/${item.fileId}`}
                              download={item.filename}
                              className="text-sm font-medium text-[#007AFF] hover:underline truncate block"
                            >
                              {item.filename}
                            </a>
                          )}
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-[#9B948B]">
                              {formatDate(item.createdAt)}
                            </span>
                            <span className="text-[10px] text-[#9B948B]">
                              {item.source}
                            </span>
                          </div>
                        </div>

                        {/* Status / Download */}
                        <div className="shrink-0">
                          {status.expired ? (
                            <span className="flex items-center gap-1 text-[10px] font-medium text-[#D5847A] px-2 py-1 rounded-full bg-[#D5847A]/10">
                              <AlertTriangle className="h-3 w-3" />
                              Expired
                            </span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span
                                className={`text-[10px] font-medium px-2 py-1 rounded-full ${status.daysLeft <= 7 ? "bg-[#E8A87C]/10 text-[#E8A87C]" : "bg-[#7FB38A]/10 text-[#7FB38A]"}`}
                              >
                                {status.daysLeft <= 7 ? (
                                  <span className="flex items-center gap-1">
                                    <Clock className="h-2.5 w-2.5" />
                                    {status.label}
                                  </span>
                                ) : (
                                  <span className="flex items-center gap-1">
                                    <CheckCircle className="h-2.5 w-2.5" />
                                    {status.label}
                                  </span>
                                )}
                              </span>
                              <a
                                href={`/api/ai/files/${item.fileId}`}
                                download={item.filename}
                                className="p-1.5 rounded-lg text-[#007AFF] hover:bg-[#E6F2FF] transition-colors"
                                title={tWf("download")}
                              >
                                <Download className="h-3.5 w-3.5" />
                              </a>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// --- Modal version used in workflow-history list ---
export function DeliverablesModal({
  run,
  onClose,
}: {
  run: WorkflowRun;
  onClose: () => void;
}) {
  const tWf = useTranslations("workflows.deliverables");
  const items = extractDeliverablesFromRun(run);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-[#FFFDF9] rounded-2xl shadow-[0_24px_64px_rgba(30,34,39,0.15)] w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-[#E7DED2]">
          <div className="flex items-center gap-2">
            <Package className="h-4.5 w-4.5 text-[#007AFF]" />
            <h3 className="text-base font-semibold text-[#2B2B2B]">
              Deliverables
            </h3>
            {items.length > 0 && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[#007AFF]/10 text-[#007AFF]">
                {items.length} file{items.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-[#6F6A64] hover:bg-[#F1ECE4] hover:text-[#2B2B2B] transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Notice */}
        <div className="px-5 py-2.5 bg-[#FFF8ED] border-b border-[#E7DED2]">
          <p className="text-[11px] text-[#9B948B] flex items-center gap-1.5">
            <Clock className="h-3 w-3 shrink-0" />
            Files are available for download within 30 days of creation. Expired
            files cannot be recovered.
          </p>
        </div>

        {/* File list */}
        <div className="flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <div className="py-12 text-center">
              <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-[#F1ECE4] flex items-center justify-center">
                <FileText className="h-6 w-6 text-[#9B948B]" />
              </div>
              <p className="text-sm font-medium text-[#2B2B2B]">
                No files generated
              </p>
              <p className="text-xs text-[#9B948B] mt-1">
                This run did not produce any downloadable files
              </p>
            </div>
          ) : (
            <div className="divide-y divide-[#F1ECE4]">
              {items.map((item, i) => {
                const status = getFileStatus(item.createdAt);
                return (
                  <div
                    key={`${item.fileId}-${i}`}
                    className="flex items-center gap-3 px-5 py-3.5 hover:bg-[#F6F3EE]/50 transition-colors"
                  >
                    {/* File icon */}
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${status.expired ? "bg-[#D5847A]/10" : "bg-[#007AFF]/10"}`}
                    >
                      <FileText
                        className={`h-4.5 w-4.5 ${status.expired ? "text-[#D5847A]" : "text-[#007AFF]"}`}
                      />
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      {status.expired ? (
                        <p className="text-sm font-medium text-[#9B948B] truncate line-through">
                          {item.filename}
                        </p>
                      ) : (
                        <a
                          href={`/api/ai/files/${item.fileId}`}
                          download={item.filename}
                          className="text-sm font-medium text-[#007AFF] hover:underline truncate block"
                        >
                          {item.filename}
                        </a>
                      )}
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-[#9B948B]">
                          {formatDate(item.createdAt)}
                        </span>
                        <span className="text-[10px] text-[#9B948B]">
                          {item.source}
                        </span>
                      </div>
                    </div>

                    {/* Status / Download */}
                    <div className="shrink-0">
                      {status.expired ? (
                        <span className="flex items-center gap-1 text-[10px] font-medium text-[#D5847A] px-2 py-1 rounded-full bg-[#D5847A]/10">
                          <AlertTriangle className="h-3 w-3" />
                          Expired
                        </span>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[10px] font-medium px-2 py-1 rounded-full ${status.daysLeft <= 7 ? "bg-[#E8A87C]/10 text-[#E8A87C]" : "bg-[#7FB38A]/10 text-[#7FB38A]"}`}
                          >
                            {status.daysLeft <= 7 ? (
                              <span className="flex items-center gap-1">
                                <Clock className="h-2.5 w-2.5" />
                                {status.label}
                              </span>
                            ) : (
                              <span className="flex items-center gap-1">
                                <CheckCircle className="h-2.5 w-2.5" />
                                {status.label}
                              </span>
                            )}
                          </span>
                          <a
                            href={`/api/ai/files/${item.fileId}`}
                            download={item.filename}
                            className="p-1.5 rounded-lg text-[#007AFF] hover:bg-[#E6F2FF] transition-colors"
                            title="Download"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
