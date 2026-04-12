import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!client) {
    client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY!,
    });
  }
  return client;
}

export const MODELS = {
  opus: "claude-opus-4-6" as const,
  sonnet: "claude-sonnet-4-6" as const,
} as const;

export const MANAGED_AGENT = {
  agentId: "agent_011CZsgmwkLUxsraEfxeJTwG",
  environmentId: "env_01NQyEK8kruqUmFL6noGFMRS",
} as const;

/** List files associated with a Managed Agent session via raw HTTP API. */
export async function listSessionFiles(
  sessionId: string
): Promise<{ id: string; filename: string; size_bytes: number; mime_type: string }[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY!;
  const res = await fetch(
    `https://api.anthropic.com/v1/files?session_id=${encodeURIComponent(sessionId)}`,
    {
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "files-api-2025-04-14,managed-agents-2026-04-01",
      },
    }
  );
  if (!res.ok) {
    console.error("[listSessionFiles] Failed:", res.status, await res.text());
    return [];
  }
  const data = await res.json();
  return (data.data || []) as { id: string; filename: string; size_bytes: number; mime_type: string }[];
}
