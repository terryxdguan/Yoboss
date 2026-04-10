// Anthropic pricing per 1M tokens (in cents)
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-4-6": { input: 1500, output: 7500 },
  "claude-sonnet-4-6": { input: 300, output: 1500 },
};

export function estimateCostCents(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const p = PRICING[model] ?? PRICING["claude-sonnet-4-6"];
  return Math.ceil(
    (inputTokens * p.input + outputTokens * p.output) / 1_000_000
  );
}
