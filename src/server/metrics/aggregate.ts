// Pure aggregation of the per-account rows into M1-M3 (docs/DECISIONS.md P4-6). No database access, unit-tested.
import { addDays } from './days'
import type { PilotMetrics } from './schema'

/** One OWNER account as Q1 returns it. It never leaves the metrics module. */
export type AccountRow = {
  verified: boolean
  onboarded: boolean
  onboardedAt: Date | null
  /** Israel day of onboardedAt, 'YYYY-MM-DD'. */
  onboardedDay: string | null
  firstCurrentAt: Date | null
  days7: number
  days28: number
  returned: boolean
  hasActivePlan: boolean
  stalled: boolean
}

/** Middle value (odd count), mean of the two middle values (even count), null when empty. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
}

/** Rounds to a multiple of `step` (0.1, 0.5, 0.01), keeping null. The result never carries float noise. */
export function roundTo(value: number | null, step: number): number | null {
  if (value === null) return null
  const decimals = step >= 1 ? 0 : Math.max(0, Math.ceil(-Math.log10(step) - 1e-9))
  return Number((Math.round(value / step) * step).toFixed(decimals))
}

const HOUR_MS = 3_600_000

export function funnel(rows: readonly AccountRow[]): PilotMetrics['funnel'] {
  const onboarded = rows.filter((r) => r.onboarded)
  const practiced = onboarded.filter((r) => r.firstCurrentAt !== null)
  const hours = practiced.map((r) => (r.firstCurrentAt!.getTime() - r.onboardedAt!.getTime()) / HOUR_MS)
  return {
    registered: rows.length,
    verified: rows.filter((r) => r.verified).length,
    onboarded: onboarded.length,
    firstPractice: practiced.length,
    medianHoursToFirstPractice: roundTo(median(hours), 0.1),
  }
}

export function activeDays(rows: readonly AccountRow[]): PilotMetrics['activeDays'] {
  const cohort = rows.filter((r) => r.onboarded)
  return {
    cohort: cohort.length,
    atLeast3In7: cohort.filter((r) => r.days7 >= 3).length,
    zeroIn7: cohort.filter((r) => r.days7 === 0).length,
    median7: roundTo(median(cohort.map((r) => r.days7)), 0.5),
    median28: roundTo(median(cohort.map((r) => r.days28)), 0.5),
  }
}

/** Eligible once the whole day 7-13 window is over: onboarding day + 13 < today. */
export function day7Eligible(onboardedDay: string, today: string): boolean {
  return addDays(onboardedDay, 13) < today
}

export function day7Return(rows: readonly AccountRow[], today: string): PilotMetrics['day7Return'] {
  const eligible = rows.filter((r) => r.onboarded && r.onboardedDay !== null && day7Eligible(r.onboardedDay, today))
  return { eligible: eligible.length, returned: eligible.filter((r) => r.returned).length }
}

export function stalled(rows: readonly AccountRow[]): { stalled: number; stalledOf: number } {
  const cohort = rows.filter((r) => r.onboarded)
  return { stalled: cohort.filter((r) => r.stalled).length, stalledOf: cohort.filter((r) => r.hasActivePlan).length }
}

/** `part / whole` as "X מתוך Y (Z%)" material for the page: the percent only when the denominator is at least 1. */
export function share(part: number, whole: number): number | null {
  return whole >= 1 ? Math.round((part / whole) * 100) : null
}
