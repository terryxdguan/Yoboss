// Map a thrown error from a workflow step's fetch/stream into a
// StepFailureKind so retry logic + UI can decide what to do with it.
//
// Source-of-truth for what counts as "retryable" vs "blocked":
// - transient: try again later, cron auto-recovers
// - quota:     spend more / upgrade, then retry
// - auth:      re-login required
// - permanent: changing the input is the only option
// - unknown:   uncategorized — treat as retryable in case it was just
//   a transient failure we didn't recognize.

import type { StepFailureKind } from "@/lib/types/workflow";

/** Pattern the client throws when fetch returns !res.ok. Keep in sync
 *  with the catch sites in workflow-run-view.tsx and any other caller
 *  that adopts the same convention. */
const API_ERROR_RX = /^API error (\d+)(?::\s*(.*))?/i;

export function classifyStepFailure(err: unknown): StepFailureKind {
  if (!(err instanceof Error)) return "unknown";

  // 1. HTTP error path — "API error <status>: <body>"
  const m = err.message.match(API_ERROR_RX);
  if (m) {
    const status = parseInt(m[1], 10);
    const body = (m[2] || "").toLowerCase();

    if (status === 401) return "auth";
    if (status === 402 || body.includes("quota_exceeded")) return "quota";
    if (status === 429) return "transient";
    if (status >= 500) return "transient";
    if (status === 400) {
      // Some Anthropic content-policy rejections come back as 400 with
      // body containing "content_policy"/"safety". Anything else 400 is
      // a permanent client/input error.
      return "permanent";
    }
    return "unknown";
  }

  // 2. Native fetch failures usually surface as TypeError. Browser
  //    runtimes vary in messages, but consistent signals are:
  //    name === "TypeError", or "fetch"/"network"/"Failed to" in msg.
  const msg = err.message.toLowerCase();
  if (
    err.name === "TypeError" ||
    msg.includes("fetch") ||
    msg.includes("network") ||
    msg.includes("connection") ||
    msg.includes("aborted") ||
    msg.includes("timed out")
  ) {
    return "transient";
  }

  return "unknown";
}

export function isRetryableFailureKind(kind: StepFailureKind | undefined): boolean {
  // Default ("undefined" — old runs missing failureKind) → treat as
  // unknown → retryable. Worst case retry just hits the same wall.
  return kind === "transient" || kind === "unknown" || kind === undefined;
}
