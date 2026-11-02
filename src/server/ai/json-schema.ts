/**
 * Provider-specific views of the one output schema (schema.ts). Structured-output endpoints reject some JSON
 * Schema keywords with a 400; everything removed here is enforced by our own zod and semantic validation after
 * parsing (schema.ts, validate.ts), so removing it from the wire schema loses no safety.
 */

function strip(schema: unknown, drop: ReadonlySet<string>, minItemsCap: number | null): unknown {
  if (Array.isArray(schema)) return schema.map((item) => strip(item, drop, minItemsCap))
  if (schema && typeof schema === 'object') {
    return Object.fromEntries(
      Object.entries(schema as Record<string, unknown>)
        .filter(([key]) => !drop.has(key))
        // Anthropic accepts minItems of 0 or 1 only; a larger value is left to our own validation.
        .filter(([key, value]) => !(key === 'minItems' && minItemsCap !== null && typeof value === 'number' && value > minItemsCap))
        .map(([key, value]) => [key, strip(value, drop, minItemsCap)]),
    )
  }
  return schema
}

const GEMINI_DROP = new Set(['$schema', 'additionalProperties', 'maxItems'])

/** Gemini answers 400 for this schema with maxItems (checked against gemini-3.5-flash-lite). */
export function forGemini(schema: unknown): unknown {
  return strip(schema, GEMINI_DROP, null)
}

// Anthropic structured outputs: no numeric or length constraints, no maxItems, no large {n,m} regex ranges, and
// every object must say additionalProperties:false (zod's JSON Schema output already does).
const ANTHROPIC_DROP = new Set(['$schema', 'minLength', 'maxLength', 'minimum', 'maximum', 'multipleOf', 'maxItems', 'pattern'])

export function forAnthropic(schema: unknown): unknown {
  return strip(schema, ANTHROPIC_DROP, 1)
}
