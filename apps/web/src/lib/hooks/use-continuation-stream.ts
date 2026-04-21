"use client";

import { useRef, useCallback, useState } from "react";
import { parseSSEStream } from "@/lib/utils/sse-parser";

/**
 * Client-driven continuation stream hook.
 *
 * Replaces the server-side `while (continuations < MAX)` loop in
 * agent-chat and streamGoalDetailChat. Each continuation is a separate
 * HTTP request with its own Vercel timeout budget, so multi-tool turns
 * that exceed 300s no longer get killed.
 *
 * Usage:
 *   const stream = useContinuationStream({
 *     onEvent(ev) { ... handle content_block_delta etc. },
 *     onDone() { ... finalize UI },
 *     onError(msg) { ... show error },
 *   });
 *   stream.startStream("/api/ai/agent-chat", { messages, promptFile });
 *
 * The hook auto-detects `turn_complete` events emitted by the modified
 * server routes. When `stop_reason === "pause_turn"`, it appends the
 * assistant content to the messages array and re-fetches — transparent
 * to the caller except for the onTurnComplete callback.
 */

export interface ContinuationStreamCallbacks {
  /** Every raw SSE event from the Anthropic stream (content_block_start,
   *  content_block_delta, content_block_stop, message_start, etc.).
   *  Does NOT include the synthetic turn_complete event. */
  onEvent: (event: Record<string, unknown>) => void;

  /** Fired when a turn finishes. If the hook will auto-continue
   *  (pause_turn), this fires BEFORE the next fetch starts — the caller
   *  can use it to update UI state between turns. */
  onTurnComplete?: (info: {
    stopReason: string;
    finalContent: unknown[];
    turnNumber: number;
  }) => void;

  /** All turns done (final turn reached end_turn, or max continuations
   *  hit). The caller should finalize the DB row / UI state here. */
  onDone: () => void;

  /** An error in any turn (network, API 4xx/5xx, stream parse failure).
   *  The caller should show an error message and persist partial state. */
  onError: (error: string) => void;
}

export interface UseContinuationStreamOptions extends ContinuationStreamCallbacks {
  /** Maximum auto-continuations. Default 10 (generous — most turns
   *  complete in 1-3 continuations). */
  maxContinuations?: number;
}

export interface UseContinuationStreamReturn {
  isStreaming: boolean;
  /** Start a streaming request. `body` must contain a `messages` array
   *  that the hook will mutate (appending assistant content on each
   *  continuation). The caller should NOT re-use the body object after
   *  calling startStream. */
  startStream: (
    endpoint: string,
    body: Record<string, unknown>
  ) => Promise<void>;
  /** Abort the current stream (if running). Triggers onError with
   *  "Aborted". */
  cancel: () => void;
}

export function useContinuationStream(
  options: UseContinuationStreamOptions
): UseContinuationStreamReturn {
  const {
    onEvent,
    onTurnComplete,
    onDone,
    onError,
    maxContinuations = 10,
  } = options;

  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Refs to avoid stale closures in the async loop. The caller may
  // change callbacks between renders but startStream captures the
  // initial values. Refs ensure we always call the latest version.
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const onTurnCompleteRef = useRef(onTurnComplete);
  onTurnCompleteRef.current = onTurnComplete;
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const startStream = useCallback(
    async (endpoint: string, body: Record<string, unknown>) => {
      // Cancel any in-flight stream.
      abortRef.current?.abort();
      const abort = new AbortController();
      abortRef.current = abort;
      setIsStreaming(true);

      // We'll mutate `messages` in-place across continuations. The
      // caller passed the body by reference so we work on the same
      // object. This lets the caller read the final messages array
      // after onDone fires (useful for persisting history).
      let turn = 0;

      try {
        while (turn < maxContinuations) {
          if (abort.signal.aborted) throw new Error("Aborted");

          const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
            signal: abort.signal,
          });

          if (!res.ok) {
            const body = await res.json().catch(() => null);
            throw new Error(body?.error || `API error: ${res.status}`);
          }

          let turnComplete: {
            stop_reason: string;
            finalContent: unknown[];
          } | null = null;

          for await (const rawEvent of parseSSEStream(res)) {
            const event = rawEvent as Record<string, any>;
            if (abort.signal.aborted) throw new Error("Aborted");

            // Detect our synthetic turn_complete event.
            if (event.type === "turn_complete") {
              turnComplete = {
                stop_reason: event.stop_reason as string,
                finalContent: event.finalContent as unknown[],
              };
              continue; // Don't forward to caller's onEvent.
            }

            // Detect server-side error events (both Anthropic and our
            // route handlers emit these).
            if (event.type === "error") {
              const msg =
                (event.error as { message?: string })?.message ||
                (event.message as string) ||
                "Something went wrong. Please try again.";
              throw new Error(msg);
            }

            onEventRef.current(event);
          }

          turn++;

          // If no turn_complete event was emitted, treat as a normal
          // end-of-stream (the route might be an older version that
          // doesn't emit turn_complete yet). Finish normally.
          if (!turnComplete) {
            onDoneRef.current();
            break;
          }

          onTurnCompleteRef.current?.({
            stopReason: turnComplete.stop_reason,
            finalContent: turnComplete.finalContent,
            turnNumber: turn,
          });

          if (turnComplete.stop_reason === "pause_turn") {
            // Append the assistant's content to messages and loop.
            // The server needs the full conversation history including
            // this turn's output to generate the next continuation.
            const messages = body.messages as unknown[];
            if (Array.isArray(messages)) {
              messages.push({
                role: "assistant",
                content: turnComplete.finalContent,
              });
            }
            // Loop — new fetch, new 300s Vercel budget.
            continue;
          }

          // Any other stop_reason (end_turn, max_tokens, etc.) → done.
          onDoneRef.current();
          break;
        }

        // If we exhausted maxContinuations without a final stop,
        // still call onDone so the caller can finalize.
        if (turn >= maxContinuations) {
          onDoneRef.current();
        }
      } catch (err) {
        if (abort.signal.aborted && (err as Error).message === "Aborted") {
          // Explicit cancel — not an unexpected error. Still notify
          // the caller so they can persist partial state.
          onErrorRef.current("Aborted");
        } else {
          onErrorRef.current(
            err instanceof Error ? err.message : "Something went wrong"
          );
        }
      } finally {
        setIsStreaming(false);
        if (abortRef.current === abort) {
          abortRef.current = null;
        }
      }
    },
    [maxContinuations]
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return { isStreaming, startStream, cancel };
}
