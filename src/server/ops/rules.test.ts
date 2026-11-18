import { describe, expect, it } from 'vitest'
import {
  MAX_NOTIFY_ATTEMPTS,
  WINDOWED_RULES,
  budgetWarningThreshold,
  claimKind,
  dedupKey,
  isOverThreshold,
  nextAttempt,
  shouldAutoResolve,
  statusAfterFailure,
  windowStart,
} from './rules'

const now = new Date('2026-11-17T12:00:00.000Z')
const ago = (ms: number) => new Date(now.getTime() - ms)
const MIN = 60_000
const HOUR = 60 * MIN

describe('thresholds and windows', () => {
  it('fires at the threshold, not just below', () => {
    expect(isOverThreshold(2, WINDOWED_RULES['server-errors'].threshold)).toBe(false)
    expect(isOverThreshold(3, WINDOWED_RULES['server-errors'].threshold)).toBe(true)
    expect(isOverThreshold(1, WINDOWED_RULES['auth-email'].threshold)).toBe(false)
    expect(isOverThreshold(2, WINDOWED_RULES['auth-email'].threshold)).toBe(true)
    expect(isOverThreshold(3, WINDOWED_RULES['generation-failures'].threshold)).toBe(true)
  })

  it('windows are 60 minutes, the edge instant included', () => {
    for (const rule of ['server-errors', 'auth-email', 'generation-failures'] as const) {
      expect(windowStart(rule, now).toISOString()).toBe('2026-11-17T11:00:00.000Z')
    }
  })

  it('the budget warning is 80 % of the maximum, rounded up', () => {
    expect(budgetWarningThreshold(100)).toBe(80)
    expect(budgetWarningThreshold(7)).toBe(6) // 5.6
    expect(budgetWarningThreshold(1)).toBe(1)
  })

  it('budget alerts dedupe per UTC day; the other rules on the rule alone', () => {
    expect(dedupKey('ai-budget-warning', now)).toBe('ai-budget-warning:2026-11-17')
    expect(dedupKey('ai-budget-exhausted', new Date('2026-11-17T23:59:59.999Z'))).toBe('ai-budget-exhausted:2026-11-17')
    expect(dedupKey('ai-budget-exhausted', new Date('2026-11-18T00:00:00.000Z'))).toBe('ai-budget-exhausted:2026-11-18')
    expect(dedupKey('server-errors', now)).toBe('server-errors')
    expect(dedupKey('housekeeping', now)).toBe('housekeeping')
  })
})

describe('auto-resolve', () => {
  it('a windowed alert resolves after more than 6 h without an event', () => {
    expect(shouldAutoResolve({ rule: 'server-errors', dedupKey: 'server-errors', lastEventAt: ago(6 * HOUR) }, now)).toBe(false)
    expect(shouldAutoResolve({ rule: 'server-errors', dedupKey: 'server-errors', lastEventAt: ago(6 * HOUR + 1) }, now)).toBe(true)
  })

  it('a budget alert resolves once its UTC day is over; housekeeping never resolves by time', () => {
    expect(shouldAutoResolve({ rule: 'ai-budget-warning', dedupKey: 'ai-budget-warning:2026-11-17', lastEventAt: ago(20 * HOUR) }, now)).toBe(false)
    expect(shouldAutoResolve({ rule: 'ai-budget-warning', dedupKey: 'ai-budget-warning:2026-11-16', lastEventAt: ago(1 * MIN) }, now)).toBe(true)
    expect(shouldAutoResolve({ rule: 'housekeeping', dedupKey: 'housekeeping', lastEventAt: ago(30 * 24 * HOUR) }, now)).toBe(false)
  })
})

describe('claim conditions', () => {
  it('first notification only while nothing was notified', () => {
    expect(claimKind({ lastNotifiedAt: null, notifyStatus: null, notifyAttempts: 0 }, now)).toBe('first')
    expect(nextAttempt('first', 0)).toBe(1)
  })

  it('a failed send is retried after 5 min, with the next attempt number', () => {
    expect(claimKind({ lastNotifiedAt: ago(5 * MIN - 1), notifyStatus: 'FAILED', notifyAttempts: 1 }, now)).toBeNull()
    expect(claimKind({ lastNotifiedAt: ago(5 * MIN), notifyStatus: 'FAILED', notifyAttempts: 1 }, now)).toBe('retry')
    expect(nextAttempt('retry', 1)).toBe(2)
    expect(claimKind({ lastNotifiedAt: ago(5 * MIN), notifyStatus: 'FAILED', notifyAttempts: 2 }, now)).toBe('retry')
  })

  it('a sender that died after claiming (status still null) is retried after 5 min too', () => {
    expect(claimKind({ lastNotifiedAt: ago(4 * MIN), notifyStatus: null, notifyAttempts: 1 }, now)).toBeNull()
    expect(claimKind({ lastNotifiedAt: ago(6 * MIN), notifyStatus: null, notifyAttempts: 1 }, now)).toBe('retry')
  })

  it('the third failure gives GAVE_UP, which is never retried', () => {
    expect(MAX_NOTIFY_ATTEMPTS).toBe(3)
    expect(statusAfterFailure(1)).toBe('FAILED')
    expect(statusAfterFailure(2)).toBe('FAILED')
    expect(statusAfterFailure(3)).toBe('GAVE_UP')
    expect(claimKind({ lastNotifiedAt: ago(10 * MIN), notifyStatus: 'GAVE_UP', notifyAttempts: 3 }, now)).toBeNull()
  })

  it('one reminder 24 h after the last notification, not at 23 h 59 min; it starts again at attempt 1', () => {
    expect(claimKind({ lastNotifiedAt: ago(24 * HOUR - MIN), notifyStatus: 'SENT', notifyAttempts: 1 }, now)).toBeNull()
    expect(claimKind({ lastNotifiedAt: ago(24 * HOUR), notifyStatus: 'SENT', notifyAttempts: 1 }, now)).toBe('reminder')
    expect(claimKind({ lastNotifiedAt: ago(24 * HOUR), notifyStatus: 'NOT_CONFIGURED', notifyAttempts: 0 }, now)).toBe('reminder')
    expect(claimKind({ lastNotifiedAt: ago(24 * HOUR), notifyStatus: 'GAVE_UP', notifyAttempts: 3 }, now)).toBe('reminder')
    expect(nextAttempt('reminder', 3)).toBe(1)
  })
})
