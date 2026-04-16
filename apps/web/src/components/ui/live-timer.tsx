"use client";

import { useState, useEffect, useRef } from "react";
import { Clock } from "lucide-react";

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${mins}m ${secs}s`;
}

interface LiveTimerProps {
  /** Whether the timer is actively counting. When false, freezes at the
   *  final value. Typically: `isStreaming && isLastMessage`. */
  active: boolean;
  /** If provided (e.g. after completion), display this fixed duration
   *  instead of the live counter. Takes priority over the live value. */
  durationMs?: number;
}

/** Compact elapsed-time badge that ticks once per second while active.
 *  Captures its own mount time as t=0 — no need to pass a start timestamp. */
export function LiveTimer({ active, durationMs }: LiveTimerProps) {
  const mountedAt = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!active) return;
    // Reset start time each time we go active (new message)
    mountedAt.current = Date.now();
    setElapsed(0);

    const tick = setInterval(() => {
      setElapsed(Date.now() - mountedAt.current);
    }, 1000);

    return () => clearInterval(tick);
  }, [active]);

  // Fixed duration takes priority (completed messages from history)
  const displayMs = durationMs ?? elapsed;

  // Don't render anything if 0 elapsed and not active (never started)
  if (!active && !durationMs && elapsed === 0) return null;

  return (
    <span className="inline-flex items-center gap-0.5 text-[10px] text-[#9B948B] tabular-nums">
      <Clock className="h-2.5 w-2.5" />
      {formatElapsed(displayMs)}
    </span>
  );
}
