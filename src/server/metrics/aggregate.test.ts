import { describe, expect, it } from 'vitest'
import { activeDays, day7Eligible, day7Return, funnel, median, roundTo, share, stalled, type AccountRow } from './aggregate'

const at = (iso: string) => new Date(iso)

function row(overrides: Partial<AccountRow> = {}): AccountRow {
  return {
    verified: true,
    onboarded: true,
    onboardedAt: at('2026-11-01T08:00:00Z'),
    onboardedDay: '2026-11-01',
    firstCurrentAt: null,
    days7: 0,
    days28: 0,
    returned: false,
    hasActivePlan: true,
    stalled: false,
    ...overrides,
  }
}

describe('median', () => {
  it('takes the middle value of an odd count, the mean of the two middle values of an even count, and null when empty', () => {
    expect(median([5, 1, 3])).toBe(3)
    expect(median([4, 1, 3, 2])).toBe(2.5)
    expect(median([7])).toBe(7)
    expect(median([])).toBeNull()
  })

  it('does not reorder its input', () => {
    const values = [3, 1, 2]
    median(values)
    expect(values).toEqual([3, 1, 2])
  })
})

describe('rounding', () => {
  it('rounds to 0.1, 0.5 and 0.01 without float noise, and keeps null', () => {
    expect(roundTo(1.25, 0.1)).toBe(1.3)
    expect(roundTo(2.34, 0.5)).toBe(2.5)
    expect(roundTo(2.2, 0.5)).toBe(2)
    expect(roundTo(1 / 3, 0.01)).toBe(0.33)
    expect(roundTo(0.1 + 0.2, 0.1)).toBe(0.3)
    expect(roundTo(null, 0.1)).toBeNull()
  })

  it('shows a percent only for a denominator of at least 1', () => {
    expect(share(1, 3)).toBe(33)
    expect(share(2, 3)).toBe(67)
    expect(share(0, 0)).toBeNull()
  })
})

describe('M1 funnel', () => {
  it('counts each nested stage and the median hours from onboarding to the first CURRENT attempt', () => {
    const rows = [
      row({ firstCurrentAt: at('2026-11-01T09:00:00Z') }), // 1 h
      row({ firstCurrentAt: at('2026-11-01T11:00:00Z') }), // 3 h
      row({ firstCurrentAt: null }),
      row({ onboarded: false, onboardedAt: null, onboardedDay: null }),
      row({ verified: false, onboarded: false }),
    ]
    expect(funnel(rows)).toEqual({ registered: 5, verified: 4, onboarded: 3, firstPractice: 2, medianHoursToFirstPractice: 2 })
  })

  it('handles an empty cohort without NaN', () => {
    expect(funnel([])).toEqual({ registered: 0, verified: 0, onboarded: 0, firstPractice: 0, medianHoursToFirstPractice: null })
  })
})

describe('M2 active practice days', () => {
  it('uses onboarded owners only and reports medians, owners with at least 3 days and owners with none', () => {
    const rows = [row({ days7: 0, days28: 2 }), row({ days7: 3, days28: 9 }), row({ days7: 5, days28: 12 }), row({ days7: 1, days28: 1 }), row({ onboarded: false, days7: 7 })]
    expect(activeDays(rows)).toEqual({ cohort: 4, atLeast3In7: 2, zeroIn7: 1, median7: 2, median28: 5.5 })
  })

  it('empty cohort: zero counts and null medians', () => {
    expect(activeDays([])).toEqual({ cohort: 0, atLeast3In7: 0, zeroIn7: 0, median7: null, median28: null })
  })
})

describe('M3 day-7 return', () => {
  it('is eligible only once onboarding day + 13 has passed (not on that day, but the day after)', () => {
    expect(day7Eligible('2026-11-01', '2026-11-14')).toBe(false) // day 13 itself: the window is still open
    expect(day7Eligible('2026-11-01', '2026-11-15')).toBe(true)
    expect(day7Eligible('2026-02-20', '2026-03-06')).toBe(true) // across a month end
  })

  it('counts returned owners among the eligible only', () => {
    const rows = [
      row({ onboardedDay: '2026-11-01', returned: true }),
      row({ onboardedDay: '2026-11-01', returned: false }),
      row({ onboardedDay: '2026-11-02', returned: true }), // not eligible yet on 2026-11-15
      row({ onboarded: false, onboardedDay: '2026-10-01', returned: true }),
    ]
    expect(day7Return(rows, '2026-11-15')).toEqual({ eligible: 2, returned: 1 })
  })
})

describe('M4 stalled', () => {
  it('counts stalled owners out of onboarded owners with an active plan', () => {
    expect(stalled([row({ stalled: true }), row(), row({ hasActivePlan: false }), row({ onboarded: false, stalled: true })])).toEqual({ stalled: 1, stalledOf: 2 })
  })
})
