// Anthropic pricing per 1M tokens (in cents)
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-4-6": { input: 1500, output: 7500 },     // $15 / $75 per 1M tokens
  "claude-sonnet-4-6": { input: 300, output: 1500 },    // $3  / $15 per 1M tokens
  "claude-haiku-4-5": { input: 80, output: 400 },       // $0.80 / $4 per 1M tokens
  "managed-agent": { input: 1500, output: 7500 },         // estimate as opus-equivalent
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
