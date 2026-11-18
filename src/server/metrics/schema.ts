import { z } from 'zod'

// The one shape of pilot metrics (docs/DECISIONS.md P4-6): the live page and every PilotMetricDay snapshot.
// Strict at every level: an unknown key, a string anywhere but a topic code, or a negative number rejects the whole object.

export const PILOT_METRICS_SCHEMA_VERSION = 1

const int = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
/** Finite, non-negative, at most two decimals, or null (an empty denominator). */
const dec = z
  .number()
  .finite()
  .min(0)
  .refine((n) => Math.abs(Math.round(n * 100) - n * 100) < 1e-6, 'at most two decimals')
  .nullable()
const TopicCode = z.enum(['TOILET', 'BITING', 'SLEEP', 'ALONE', 'COMMANDS'])

export const PilotMetricsV1 = z.strictObject({
  schemaVersion: z.literal(PILOT_METRICS_SCHEMA_VERSION),
  backfilled: z.union([z.literal(0), z.literal(1)]),
  funnel: z.strictObject({ registered: int, verified: int, onboarded: int, firstPractice: int, medianHoursToFirstPractice: dec }),
  activeDays: z.strictObject({ cohort: int, atLeast3In7: int, zeroIn7: int, median7: dec, median28: dec }),
  day7Return: z.strictObject({ eligible: int, returned: int }),
  difficulty: z.strictObject({
    byPosition: z.array(z.strictObject({ position: int, owners: int, topTopic: TopicCode })).max(100),
    stalled: int,
    stalledOf: int,
  }),
  mastery: z.strictObject({ confirmations7: int, confirmations28: int, activeOwnerWeeks28: int, medianDaysToMastery: dec, perActiveOwnerWeek: dec }),
  generation: z.strictObject({
    byStatus: z.strictObject({ PENDING: int, SUCCEEDED: int, FAILED: int, REJECTED: int, STALE: int }),
    failuresByClass: z.strictObject({ provider: int, deadline: int, 'attempts-exhausted': int, internal: int, 'lease-expired': int, other: int }),
    quotaAccount: int,
    quotaCalls: int,
  }),
})

export type PilotMetrics = z.infer<typeof PilotMetricsV1>
export type TopicCode = z.infer<typeof TopicCode>
export type FailureClass = keyof PilotMetrics['generation']['failuresByClass']
