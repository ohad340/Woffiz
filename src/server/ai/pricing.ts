/**
 * Published list prices in USD per million tokens, used only for ESTIMATES in the evaluation scripts and docs
 * (decision 47 limits spend by count, not by money). Verify against the provider's pricing page before relying on them.
 * Claude Haiku 5.5: $0.10 input / $0.50 output for prompts up to 100K tokens ($0.50 / $2.50 above).
 */
type Price = { inputPerMTok: number; outputPerMTok: number }

const PRICES: Record<string, Price> = {
  'claude-haiku-5-5': { inputPerMTok: 0.1, outputPerMTok: 0.5 },
  'claude-sonnet-5-5': { inputPerMTok: 2, outputPerMTok: 10 },
  'claude-opus-5-5': { inputPerMTok: 4, outputPerMTok: 20 },
  'gemini-3.5-flash-lite': { inputPerMTok: 0.1, outputPerMTok: 0.4 },
}

/** Estimated cost of one call, or null when the model has no known price. Output includes thinking tokens. */
export function estimateCostUsd(model: string, inputTokens: number | null, outputTokens: number | null): number | null {
  const price = PRICES[model]
  if (!price || inputTokens === null || outputTokens === null) return null
  return (inputTokens * price.inputPerMTok + outputTokens * price.outputPerMTok) / 1_000_000
}
