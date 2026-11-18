import { describe, expect, it } from 'vitest'
import { PilotMetricsV1, type PilotMetrics } from './schema'

const valid = (): PilotMetrics => ({
  schemaVersion: 1,
  backfilled: 0,
  funnel: { registered: 5, verified: 4, onboarded: 3, firstPractice: 2, medianHoursToFirstPractice: 1.5 },
  activeDays: { cohort: 3, atLeast3In7: 1, zeroIn7: 1, median7: 2.5, median28: null },
  day7Return: { eligible: 2, returned: 1 },
  difficulty: { byPosition: [{ position: 1, owners: 2, topTopic: 'BITING' }], stalled: 1, stalledOf: 3 },
  mastery: { confirmations7: 1, confirmations28: 4, activeOwnerWeeks28: 6, medianDaysToMastery: 3.2, perActiveOwnerWeek: 0.67 },
  generation: {
    byStatus: { PENDING: 0, SUCCEEDED: 3, FAILED: 2, REJECTED: 0, STALE: 1 },
    failuresByClass: { provider: 1, deadline: 0, 'attempts-exhausted': 0, internal: 0, 'lease-expired': 0, other: 0 },
    quotaAccount: 1,
    quotaCalls: 0,
  },
})

describe('PilotMetricsV1 (strict snapshot schema)', () => {
  it('accepts a full valid object', () => {
    expect(PilotMetricsV1.parse(valid())).toEqual(valid())
  })

  it('rejects a string in a number field', () => {
    const value = valid() as unknown as { funnel: Record<string, unknown> }
    value.funnel.registered = 'owner@example.test'
    expect(PilotMetricsV1.safeParse(value).success).toBe(false)
  })

  it('rejects an unknown key at the top and nested', () => {
    expect(PilotMetricsV1.safeParse({ ...valid(), email: 'x' }).success).toBe(false)
    const nested = valid() as unknown as { mastery: Record<string, unknown> }
    nested.mastery.puppyName = 'לוקה'
    expect(PilotMetricsV1.safeParse(nested).success).toBe(false)
  })

  it('rejects a negative number, a fraction where an integer is required and more than two decimals', () => {
    const negative = valid()
    negative.day7Return.returned = -1
    expect(PilotMetricsV1.safeParse(negative).success).toBe(false)
    const fraction = valid()
    fraction.funnel.verified = 1.5
    expect(PilotMetricsV1.safeParse(fraction).success).toBe(false)
    const decimals = valid()
    decimals.mastery.perActiveOwnerWeek = 0.333
    expect(PilotMetricsV1.safeParse(decimals).success).toBe(false)
  })

  it('rejects a topic that is not a Topic code (the only strings allowed)', () => {
    const value = valid() as unknown as { difficulty: { byPosition: { topTopic: string }[] } }
    value.difficulty.byPosition[0]!.topTopic = 'free text'
    expect(PilotMetricsV1.safeParse(value).success).toBe(false)
  })

  it('rejects more than 100 positions', () => {
    const value = valid()
    value.difficulty.byPosition = Array.from({ length: 101 }, (_, i) => ({ position: i + 1, owners: 1, topTopic: 'SLEEP' as const }))
    expect(PilotMetricsV1.safeParse(value).success).toBe(false)
  })
})
