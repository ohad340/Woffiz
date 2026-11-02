import { isLocalMachine, type Env } from '../local-mode'

export type AiConfig =
  | { kind: 'anthropic'; apiKey: string; model: string; timeoutMs: number }
  | { kind: 'gemini'; apiKey: string; model: string; timeoutMs: number }
  | { kind: 'fake'; model: 'fake'; timeoutMs: number }
  | { kind: 'none' }

export type ActiveAiConfig = Exclude<AiConfig, { kind: 'none' }>

export type AiProviderName = 'anthropic' | 'gemini' | 'fake'

export const DEFAULT_PROVIDER: AiProviderName = 'anthropic'
export const DEFAULT_MODELS = { anthropic: 'claude-haiku-5-5', gemini: 'gemini-3.5-flash-lite' } as const
const DEFAULT_TIMEOUT_MS = 45_000
/** Per-attempt timeout ceiling, so the whole operation (two attempts, the delay and 30 s) stays under maxDuration (300 s). */
export const MAX_TIMEOUT_MS = 100_000

function positiveInt(value: string | undefined, fallback: number) {
  const n = Number(value)
  return Number.isInteger(n) && n > 0 ? n : fallback
}

/**
 * Which generator serves plans. Pure function of the environment. There is no automatic fallback: a provider
 * that is not fully configured means the service reports itself unavailable, never another provider or model.
 * - anthropic (the default): Claude through the Anthropic API; needs ANTHROPIC_API_KEY.
 * - gemini: only when AI_PROVIDER=gemini is set explicitly; needs GEMINI_API_KEY.
 * - fake: the labeled local generator (not a model), only when AI_PROVIDER=fake is set explicitly, and honored
 *   only on a local machine (APP_ENV=local + localhost) or under NODE_ENV=test.
 * AI_MODEL_ID overrides the model; an ID that does not belong to the provider (a gemini-* ID for Claude, say)
 * is a configuration error and disables the service instead of being guessed around.
 */
export function aiConfig(env: Env = process.env): AiConfig {
  const timeoutMs = Math.min(positiveInt(env.AI_TIMEOUT_MS, DEFAULT_TIMEOUT_MS), MAX_TIMEOUT_MS)
  const requested = env.AI_PROVIDER?.trim().toLowerCase() || DEFAULT_PROVIDER
  const model = env.AI_MODEL_ID?.trim()

  if (requested === 'anthropic') {
    const apiKey = env.ANTHROPIC_API_KEY?.trim()
    const id = model || DEFAULT_MODELS.anthropic
    if (!apiKey || !id.startsWith('claude-')) return { kind: 'none' }
    return { kind: 'anthropic', apiKey, model: id, timeoutMs }
  }
  if (requested === 'gemini') {
    const apiKey = env.GEMINI_API_KEY?.trim()
    const id = model || DEFAULT_MODELS.gemini
    if (!apiKey || !id.startsWith('gemini-')) return { kind: 'none' }
    return { kind: 'gemini', apiKey, model: id, timeoutMs }
  }
  if (requested === 'fake' && (isLocalMachine(env) || env.NODE_ENV === 'test')) {
    return { kind: 'fake', model: 'fake', timeoutMs }
  }
  return { kind: 'none' }
}

/** Route duration (seconds) set on the three generation routes: `export const maxDuration = 300`. */
export const ROUTE_MAX_DURATION_MS = 300_000

/** Time allowed for validation and database persistence after the last provider attempt. */
export const PERSIST_RESERVE_MS = 30_000

/**
 * Timing of one generation operation, all derived from the per-attempt timeout (decision 57):
 * - at most two provider attempts (the SDK itself never retries), each bounded by attemptTimeoutMs;
 * - a retry delay between them;
 * - deadlineMs: the hard end of the operation, attempts at full timeout + the delay + the persistence reserve;
 *   always below the route's maxDuration, so the platform never kills a worker that is still within its budget;
 * - leaseMs: how long a worker owns the job without renewing. It is renewed before every attempt and at commit,
 *   so it only has to outlive one attempt plus the reserve. A crashed worker is therefore detected after leaseMs.
 */
export function operationPlan(timeoutMs: number, env: Env = process.env) {
  const retryDelayMs = positiveInt(env.AI_RETRY_DELAY_MS, 2_000)
  return {
    attemptTimeoutMs: timeoutMs,
    retryDelayMs,
    deadlineMs: 2 * timeoutMs + retryDelayMs + PERSIST_RESERVE_MS,
    leaseMs: timeoutMs + PERSIST_RESERVE_MS,
  }
}

/** Defaults of the daily limits (UTC days). Decision 56. */
export const DEFAULT_LIMITS = { requestsPerAccountPerDay: 3, providerCallsPerDay: 100 } as const

export function aiLimits(env: Env = process.env) {
  return {
    /** Generation/adaptation requests per account (initial plan, adapt_current, revise_future). */
    requestsPerAccountPerDay: positiveInt(env.AI_DAILY_ACCOUNT_MAX, DEFAULT_LIMITS.requestsPerAccountPerDay),
    /** Calls to the model for the whole system, retries counted separately (so up to 2 per request). */
    providerCallsPerDay: positiveInt(env.AI_DAILY_CALLS_MAX, DEFAULT_LIMITS.providerCallsPerDay),
  }
}

/** Candidate media offered to the model. Empty unless the isolated test catalog is switched on. */
export function testMediaEnabled(env: Env = process.env) {
  return env.AI_TEST_MEDIA === 'true' && (isLocalMachine(env) || env.NODE_ENV === 'test')
}
