// Alert rules and their constants (docs/DECISIONS.md P4-6, O6-O7). Changing a value is a reviewed code change.
// The SQL in evaluate.ts mirrors the pure predicates below; the unit tests pin them.
import { HOUR_MS, MINUTE_MS, utcDay } from './time'

/** Rule codes as stored in "OpsAlert"."rule" (the database enum values). */
export type RuleCode = 'server-errors' | 'auth-email' | 'generation-failures' | 'ai-budget-warning' | 'ai-budget-exhausted' | 'housekeeping'
export type WindowedRule = 'server-errors' | 'auth-email' | 'generation-failures'
export type BudgetRule = 'ai-budget-warning' | 'ai-budget-exhausted'

/** Windowed rules: at least `threshold` matching events in the last `windowMinutes`. */
export const WINDOWED_RULES: Record<WindowedRule, { windowMinutes: number; threshold: number }> = {
  'server-errors': { windowMinutes: 60, threshold: 3 },
  'auth-email': { windowMinutes: 60, threshold: 2 },
  'generation-failures': { windowMinutes: 60, threshold: 3 },
}

/** A windowed alert resolves after this long without a matching event. Resolution sends nothing. */
export const QUIET_RESOLVE_MS = 6 * HOUR_MS
/** A failed or abandoned (claimed, never finished) notification is retried after this long. */
export const RETRY_AFTER_MS = 5 * MINUTE_MS
/** While an alert stays open, at most one reminder per this period. */
export const REMINDER_AFTER_MS = 24 * HOUR_MS
/** Attempts per notification before GAVE_UP. */
export const MAX_NOTIFY_ATTEMPTS = 3
/** Alert emails per UTC day across all alerts (protects the shared Resend quota of authentication mail). */
export const DAILY_MAIL_CAP = 10
/** Retries and reminders sent by one evaluation. */
export const SWEEP_MAX = 5

export const isOverThreshold = (count: number, threshold: number) => count >= threshold

/** The budget warning fires at 80 % of the daily call maximum, rounded up. */
export const budgetWarningThreshold = (maxCallsPerDay: number) => Math.ceil(0.8 * maxCallsPerDay)

/** Windowed rules dedupe on the rule; budget rules once per UTC day. */
export function dedupKey(rule: RuleCode, now: Date): string {
  return rule === 'ai-budget-warning' || rule === 'ai-budget-exhausted' ? `${rule}:${utcDay(now)}` : rule
}

/** Start of a windowed rule's window at `now` (events at exactly this instant count). */
export const windowStart = (rule: WindowedRule, now: Date) => new Date(now.getTime() - WINDOWED_RULES[rule].windowMinutes * MINUTE_MS)

export type AlertState = {
  rule: RuleCode
  dedupKey: string
  lastEventAt: Date
  lastNotifiedAt: Date | null
  notifyStatus: string | null
  notifyAttempts: number
}

/** Windowed alerts resolve after 6 h quiet; budget alerts once their UTC day is over; housekeeping only from a run. */
export function shouldAutoResolve(alert: Pick<AlertState, 'rule' | 'dedupKey' | 'lastEventAt'>, now: Date): boolean {
  if (alert.rule === 'server-errors' || alert.rule === 'auth-email' || alert.rule === 'generation-failures') {
    return alert.lastEventAt.getTime() < now.getTime() - QUIET_RESOLVE_MS
  }
  if (alert.rule === 'ai-budget-warning' || alert.rule === 'ai-budget-exhausted') return (alert.dedupKey.split(':')[1] ?? '') < utcDay(now)
  return false
}

export type ClaimKind = 'first' | 'retry' | 'reminder'

/**
 * Which notification, if any, may be claimed now. Mirrors the three claim conditions of the conditional UPDATE. A retry is due
 * 5 min after the last attempt and a reminder 24 h after the last notification (both inclusive).
 */
export function claimKind(alert: Pick<AlertState, 'lastNotifiedAt' | 'notifyStatus' | 'notifyAttempts'>, now: Date): ClaimKind | null {
  if (alert.lastNotifiedAt === null) return 'first'
  const age = now.getTime() - alert.lastNotifiedAt.getTime()
  if ((alert.notifyStatus === 'FAILED' || alert.notifyStatus === null) && alert.notifyAttempts >= 1 && alert.notifyAttempts <= MAX_NOTIFY_ATTEMPTS - 1 && age >= RETRY_AFTER_MS) return 'retry'
  if (alert.notifyStatus !== null && alert.notifyStatus !== 'FAILED' && age >= REMINDER_AFTER_MS) return 'reminder'
  return null
}

/** The attempt number a claim writes: 1 for a first notification or a reminder, the next attempt for a retry. */
export const nextAttempt = (kind: ClaimKind, attempts: number) => (kind === 'retry' ? attempts + 1 : 1)

/** Status after a failed send: FAILED, or GAVE_UP once the third attempt failed. */
export const statusAfterFailure = (attempt: number): 'FAILED' | 'GAVE_UP' => (attempt >= MAX_NOTIFY_ATTEMPTS ? 'GAVE_UP' : 'FAILED')

