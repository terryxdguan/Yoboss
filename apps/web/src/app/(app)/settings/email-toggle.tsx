"use client";

import { useState, useTransition } from "react";
import { upsertUserTimezone } from "@/lib/db/actions";
import { TIMEZONES } from "@/lib/timezones";

export function DailyEmailToggle({
  initialEnabled,
  initialTimezone,
}: {
  initialEnabled: boolean;
  initialTimezone: string;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [timezone, setTimezone] = useState(initialTimezone);
  const [pending, startTransition] = useTransition();
  const [tzPending, startTimezoneTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [timezoneError, setTimezoneError] = useState<string | null>(null);
  const [timezoneSaved, setTimezoneSaved] = useState(false);

  const onChange = (next: boolean) => {
    setEnabled(next);
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/settings/email-prefs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dailyEmailEnabled: next }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch {
        setEnabled(!next);
        setError("Couldn't save. Try again.");
      }
    });
  };

  const onTimezoneChange = (next: string) => {
    const previous = timezone;
    setTimezone(next);
    setTimezoneError(null);
    setTimezoneSaved(false);
    startTimezoneTransition(async () => {
      try {
        await upsertUserTimezone(next);
        setTimezoneSaved(true);
        window.setTimeout(() => setTimezoneSaved(false), 2000);
      } catch {
        setTimezone(previous);
        setTimezoneError("Couldn't save. Try again.");
      }
    });
  };

  return (
    <div className="rounded-xl border border-[#E7DED2] bg-[#FFFDF9] p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <div>
          <div className="text-sm font-medium text-[#2B2B2B]">Time zone</div>
          <div className="mt-1 text-xs text-[#6F6A64]">
            Used for daily summary emails and scheduled workflows.
          </div>
          {timezoneError && (
            <div className="mt-2 text-xs text-[#D5847A]">{timezoneError}</div>
          )}
          {timezoneSaved && (
            <div className="mt-2 text-xs font-medium text-[#7FB38A]">Saved</div>
          )}
        </div>

        <select
          value={timezone}
          disabled={tzPending}
          onChange={(e) => onTimezoneChange(e.target.value)}
          className="w-full rounded-lg border border-[#E7DED2] bg-[#FFFDF9] px-3 py-2 text-sm text-[#2B2B2B] outline-none transition-colors hover:border-[#DDD3C7] focus:border-[#7FAEE6] disabled:opacity-60 sm:w-auto sm:min-w-64"
        >
          {TIMEZONES.map((tz) => (
            <option key={tz.value} value={tz.value}>
              {tz.label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-5 flex items-start justify-between gap-6 border-t border-[#F1ECE4] pt-5">
        <div>
          <div className="text-sm font-medium text-[#2B2B2B]">Daily summary email</div>
          <div className="mt-1 text-xs text-[#6F6A64]">
            Sent at 6 AM in your local timezone — today's items first, yesterday's wins below.
          </div>
          {error && <div className="mt-2 text-xs text-[#D5847A]">{error}</div>}
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="Daily summary email"
          disabled={pending}
          onClick={() => onChange(!enabled)}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors disabled:opacity-60 ${
            enabled ? "bg-[#7FAEE6]" : "bg-[#DDD3C7]"
          }`}
        >
          <span
            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
              enabled ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>
    </div>
  );
}
