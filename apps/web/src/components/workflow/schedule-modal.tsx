"use client";

import { useState, useMemo } from "react";
import { X, CalendarClock, Clock } from "lucide-react";
import { useTranslations } from "next-intl";
import { updateWorkflow } from "@/lib/db/actions";
import {
  buildCronExpression,
  getNextRunAt,
} from "@/lib/utils/schedule";
import type { Workflow } from "@/lib/types/workflow";

interface ScheduleModalProps {
  workflow: Workflow;
  userTimezone: string;
  onClose: () => void;
  onSave: () => void;
}

function parseCron(cron: string | null): {
  frequency: "daily" | "weekly";
  hour: number;
  minute: number;
  days: number[];
} {
  if (!cron) return { frequency: "daily", hour: 8, minute: 0, days: [] };
  const parts = cron.split(" ");
  if (parts.length !== 5) return { frequency: "daily", hour: 8, minute: 0, days: [] };

  const [min, hr, , , dow] = parts;
  const hour = parseInt(hr) || 0;
  const minute = parseInt(min) || 0;

  if (dow === "*") {
    return { frequency: "daily", hour, minute, days: [] };
  }

  const days = dow
    .split(",")
    .map((d) => parseInt(d))
    .filter((d) => !isNaN(d));
  return { frequency: "weekly", hour, minute, days };
}

const DAY_LABELS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);

export function ScheduleModal({
  workflow,
  userTimezone,
  onClose,
  onSave,
}: ScheduleModalProps) {
  const t = useTranslations("workflows.scheduleModal");
  const initial = workflow.schedule_enabled
    ? parseCron(workflow.schedule_cron)
    : { frequency: "daily" as const, hour: 8, minute: 0, days: [] };

  const [enabled, setEnabled] = useState(workflow.schedule_enabled);
  const [frequency, setFrequency] = useState<"daily" | "weekly">(initial.frequency);
  const [hour, setHour] = useState(initial.hour);
  const [minute, setMinute] = useState(initial.minute);
  const [days, setDays] = useState<number[]>(initial.days);
  const [saving, setSaving] = useState(false);

  const isValid = enabled
    ? frequency === "daily" || days.length > 0
    : true;

  const nextRun = useMemo(() => {
    if (!enabled || !isValid) return null;
    try {
      const cron = buildCronExpression(frequency, hour, minute, days);
      const iso = getNextRunAt(cron, userTimezone);
      return new Date(iso);
    } catch {
      return null;
    }
  }, [enabled, isValid, frequency, hour, minute, days, userTimezone]);

  function toggleDay(day: number) {
    setDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  }

  async function handleSave() {
    setSaving(true);
    try {
      if (!enabled) {
        await updateWorkflow(workflow.id, {
          schedule_enabled: false,
          schedule_cron: null,
          schedule_timezone: null,
          schedule_next_run_at: null,
        });
      } else {
        const cron = buildCronExpression(frequency, hour, minute, days);
        const nextRunAt = getNextRunAt(cron, userTimezone);
        await updateWorkflow(workflow.id, {
          schedule_enabled: true,
          schedule_cron: cron,
          schedule_timezone: userTimezone,
          schedule_next_run_at: nextRunAt,
        });
      }
      onSave();
    } catch (err) {
      console.error("Failed to save schedule:", err);
    } finally {
      setSaving(false);
    }
  }

  function formatNextRun(date: Date): string {
    return date.toLocaleString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    });
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/20 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div className="relative bg-[#FFFDF9] rounded-2xl shadow-[0_24px_64px_rgba(43,43,43,0.15)] w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-3">
          <div className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5 text-[#007AFF]" />
            <h2 className="text-lg font-semibold text-[#2B2B2B]">{t("title")}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-[#6F6A64] hover:bg-[#F1ECE4] transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 pb-6 space-y-5">
          {/* Toggle */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-[#2B2B2B]">
              Enable schedule
            </span>
            <button
              onClick={() => setEnabled(!enabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                enabled ? "bg-[#007AFF]" : "bg-[#DDD3C7]"
              }`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${
                  enabled ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {/* Fields — dimmed when disabled */}
          <div
            className={`space-y-5 transition-opacity ${
              enabled ? "opacity-100" : "opacity-40 pointer-events-none"
            }`}
          >
            {/* Frequency */}
            <div>
              <label className="text-sm font-medium text-[#2B2B2B] block mb-2">
                Frequency
              </label>
              <div className="flex gap-2">
                {(["daily", "weekly"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFrequency(f)}
                    className={`flex-1 px-4 py-2 rounded-xl text-sm font-medium transition-colors border ${
                      frequency === f
                        ? "bg-[#007AFF] text-white border-[#007AFF]"
                        : "bg-[#FFFDF9] text-[#6F6A64] border-[#E7DED2] hover:bg-[#F1ECE4]"
                    }`}
                  >
                    {f === "daily" ? "Daily" : "Weekly"}
                  </button>
                ))}
              </div>
            </div>

            {/* Time */}
            <div>
              <label className="text-sm font-medium text-[#2B2B2B] block mb-2">
                <Clock className="h-3.5 w-3.5 inline-block mr-1 -mt-0.5" />
                Time
              </label>
              <div className="flex gap-3">
                <select
                  value={hour}
                  onChange={(e) => setHour(parseInt(e.target.value))}
                  className="flex-1 px-3 py-2 rounded-xl text-sm bg-[#FFFDF9] border border-[#E7DED2] text-[#2B2B2B] outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF] appearance-none cursor-pointer"
                >
                  {HOURS.map((h) => (
                    <option key={h} value={h}>
                      {String(h).padStart(2, "0")}
                    </option>
                  ))}
                </select>
                <span className="flex items-center text-[#9B948B] text-sm font-medium">
                  :
                </span>
                <select
                  value={minute}
                  onChange={(e) => setMinute(parseInt(e.target.value))}
                  className="flex-1 px-3 py-2 rounded-xl text-sm bg-[#FFFDF9] border border-[#E7DED2] text-[#2B2B2B] outline-none focus:ring-2 focus:ring-[#007AFF]/30 focus:border-[#007AFF] appearance-none cursor-pointer"
                >
                  {MINUTES.map((m) => (
                    <option key={m} value={m}>
                      {String(m).padStart(2, "0")}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Days of week (weekly only) */}
            {frequency === "weekly" && (
              <div>
                <label className="text-sm font-medium text-[#2B2B2B] block mb-2">
                  Days of week
                </label>
                <div className="flex gap-1.5">
                  {DAY_LABELS.map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => toggleDay(value)}
                      className={`flex-1 py-2 rounded-xl text-xs font-medium transition-colors border ${
                        days.includes(value)
                          ? "bg-[#007AFF] text-white border-[#007AFF]"
                          : "bg-[#FFFDF9] text-[#6F6A64] border-[#E7DED2] hover:bg-[#F1ECE4]"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {frequency === "weekly" && days.length === 0 && (
                  <p className="text-[11px] text-[#D5847A] mt-1.5">
                    Select at least one day
                  </p>
                )}
              </div>
            )}

            {/* Timezone */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-[#6F6A64]">{t("timezone")}</span>
              <div className="flex items-center gap-2">
                <span className="text-[#2B2B2B] font-medium">
                  {userTimezone}
                </span>
                <a
                  href="/settings"
                  className="text-[11px] text-[#007AFF] hover:underline"
                >
                  Change in Settings
                </a>
              </div>
            </div>

            {/* Next run preview */}
            {nextRun && (
              <div className="rounded-xl bg-[#F6F3EE] border border-[#E7DED2] px-4 py-3">
                <p className="text-xs text-[#9B948B] mb-0.5">{t("nextRun")}</p>
                <p className="text-sm font-medium text-[#2B2B2B]">
                  {formatNextRun(nextRun)}
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center gap-3 pt-1">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-xl border border-[#E7DED2] text-sm font-medium text-[#6F6A64] hover:bg-[#F1ECE4] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!isValid || saving}
              className="flex-1 px-4 py-2.5 rounded-xl bg-[#007AFF] text-white text-sm font-medium hover:bg-[#0066D6] transition-colors disabled:opacity-40"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
