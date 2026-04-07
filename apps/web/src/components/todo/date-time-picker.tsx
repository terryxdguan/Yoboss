"use client";

import { useState, useRef, useEffect, useCallback } from "react";

const pad = (n: number) => String(n).padStart(2, "0");

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function parseISOish(v: string | null): Date {
  if (v) {
    const d = new Date(v);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date();
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

interface Props {
  value: string | null;
  onChange: (iso: string) => void;
  onClose: () => void;
}

export function DateTimePicker({ value, onChange, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const init = parseISOish(value);
  const [year, setYear] = useState(init.getFullYear());
  const [month, setMonth] = useState(init.getMonth());
  const [day, setDay] = useState(init.getDate());
  const [hour12, setHour12] = useState(() => {
    const h = init.getHours();
    if (h === 0) return 12;
    return h > 12 ? h - 12 : h;
  });
  const [minute, setMinute] = useState(init.getMinutes());
  const [ampm, setAmpm] = useState<"AM" | "PM">(() => (init.getHours() >= 12 ? "PM" : "AM"));

  const buildISO = useCallback(() => {
    let h = hour12;
    if (ampm === "AM" && h === 12) h = 0;
    else if (ampm === "PM" && h !== 12) h += 12;
    return `${year}-${pad(month + 1)}-${pad(day)}T${pad(h)}:${pad(minute)}`;
  }, [year, month, day, hour12, minute, ampm]);

  const confirm = useCallback(() => {
    onChange(buildISO());
    onClose();
  }, [onChange, onClose, buildISO]);

  // Click-outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) confirm();
    };
    const timer = setTimeout(() => document.addEventListener("mousedown", handler), 50);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mousedown", handler);
    };
  }, [confirm]);

  // Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        confirm();
      }
    };
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, [confirm]);

  // Calendar grid
  const totalDays = daysInMonth(year, month);
  const firstDow = new Date(year, month, 1).getDay();
  const calCells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) calCells.push(null);
  for (let d = 1; d <= totalDays; d++) calCells.push(d);

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  };

  useEffect(() => {
    const max = daysInMonth(year, month);
    if (day > max) setDay(max);
  }, [year, month, day]);

  return (
    <div
      ref={ref}
      className="absolute left-0 top-[calc(100%+4px)] z-50 bg-white border border-[#D8D1C6] rounded-xl shadow-[0_8px_32px_rgba(30,34,39,0.15)] p-3 select-none"
      style={{ width: 300 }}
    >
      {/* Calendar */}
      <div className="mb-2">
        <div className="flex items-center justify-between mb-2">
          <button onClick={prevMonth} className="w-7 h-7 rounded-lg hover:bg-[#F1EEE8] text-[#8C939B] hover:text-[#1E2227] flex items-center justify-center text-sm">◀</button>
          <span className="text-sm font-semibold text-[#1E2227]">{MONTHS[month]} {year}</span>
          <button onClick={nextMonth} className="w-7 h-7 rounded-lg hover:bg-[#F1EEE8] text-[#8C939B] hover:text-[#1E2227] flex items-center justify-center text-sm">▶</button>
        </div>

        <div className="grid grid-cols-7 gap-px mb-1">
          {WEEKDAYS.map((d) => (
            <div key={d} className="text-center text-[10px] text-[#8C939B] font-medium py-0.5">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-px">
          {calCells.map((d, i) => (
            <button
              key={i}
              disabled={d === null}
              onClick={() => d && setDay(d)}
              className={`h-7 rounded text-xs flex items-center justify-center transition-colors ${
                d === null
                  ? ""
                  : d === day
                    ? "bg-[#4C7CF0] text-white font-bold"
                    : "text-[#1E2227] hover:bg-[#F1EEE8]"
              }`}
            >
              {d ?? ""}
            </button>
          ))}
        </div>
      </div>

      {/* Time */}
      <div className="flex items-center gap-2 border-t border-[#E6E1D8] pt-2 mt-1">
        <div className="flex flex-col items-center gap-0.5">
          <button onClick={() => setHour12((h) => (h === 12 ? 1 : h + 1))} className="text-[#8C939B] hover:text-[#1E2227] text-[10px]">▲</button>
          <input
            type="text"
            inputMode="numeric"
            value={pad(hour12)}
            onClick={(e) => (e.target as HTMLInputElement).select()}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (!isNaN(v) && v >= 1 && v <= 12) setHour12(v);
              else if (e.target.value === "" || e.target.value === "0") setHour12(12);
            }}
            className="w-9 h-7 rounded bg-[#F1EEE8] text-[#1E2227] text-sm font-semibold text-center outline-none focus:ring-1 focus:ring-[#4C7CF0]"
          />
          <button onClick={() => setHour12((h) => (h === 1 ? 12 : h - 1))} className="text-[#8C939B] hover:text-[#1E2227] text-[10px]">▼</button>
        </div>
        <span className="text-[#8C939B] font-bold text-sm">:</span>
        <div className="flex flex-col items-center gap-0.5">
          <button onClick={() => setMinute((m) => (m + 1) % 60)} className="text-[#8C939B] hover:text-[#1E2227] text-[10px]">▲</button>
          <input
            type="text"
            inputMode="numeric"
            value={pad(minute)}
            onClick={(e) => (e.target as HTMLInputElement).select()}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (!isNaN(v) && v >= 0 && v <= 59) setMinute(v);
              else if (e.target.value === "") setMinute(0);
            }}
            className="w-9 h-7 rounded bg-[#F1EEE8] text-[#1E2227] text-sm font-semibold text-center outline-none focus:ring-1 focus:ring-[#4C7CF0]"
          />
          <button onClick={() => setMinute((m) => (m - 1 + 60) % 60)} className="text-[#8C939B] hover:text-[#1E2227] text-[10px]">▼</button>
        </div>
        <button
          onClick={() => setAmpm((p) => (p === "AM" ? "PM" : "AM"))}
          className="w-10 h-7 rounded bg-[#4C7CF0]/10 hover:bg-[#4C7CF0]/20 text-[#4C7CF0] text-xs font-bold flex items-center justify-center transition-colors"
        >
          {ampm}
        </button>
        <div className="flex-1" />
        <button
          onClick={confirm}
          className="px-3 py-1.5 rounded-lg bg-[#4C7CF0] hover:bg-[#3F6FE4] text-white text-xs font-semibold transition-colors"
        >
          Confirm ✓
        </button>
      </div>
    </div>
  );
}
