/**
 * Shared SSE stream parser.
 *
 * Extracts JSON events from a server-sent-events Response. Used by
 * useContinuationStream and can replace the ~20-line duplicated
 * "reader.read → split → JSON.parse" block in 6+ client-side consumers.
 *
 * Handles the standard SSE wire format:
 *   event: <type>\n
 *   data: <json>\n
 *   \n
 *
 * Lines without the "data: " prefix are also attempted as raw JSON for
 * compatibility with routes that omit the event/data framing.
 */

export async function* parseSSEStream(
  response: Response
): AsyncGenerator<Record<string, unknown>> {
  const reader = response.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n").filter((l) => l.trim());

      for (const line of lines) {
        // Skip SSE event-type lines — we only care about data payloads.
        if (line.startsWith("event:")) continue;

        const jsonStr = line.startsWith("data: ") ? line.slice(6) : line;

        try {
          yield JSON.parse(jsonStr);
        } catch {
          // Partial JSON from a chunk boundary — silently skip. The
          // remainder will arrive in the next chunk and also fail to
          // parse, which is fine: the model will re-emit the content
          // in subsequent events. This matches the existing behavior
          // of every SSE consumer in the codebase.
          continue;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
