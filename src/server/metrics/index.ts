// Pilot metrics M1-M6 (docs/DECISIONS.md P4-6): derived at read time from product tables, OWNER accounts only,
// aggregates only. The result has one fixed shape (schema.ts) shared by the live page and the daily snapshots.
import { activeDays, day7Return, funnel, median, roundTo, stalled } from './aggregate'
import { ilDay } from './days'
import { accountRows, difficultyByPosition, generationRows, masteryRows, type Window } from './queries'
import { PILOT_METRICS_SCHEMA_VERSION, PilotMetricsV1, type PilotMetrics } from './schema'

export { PilotMetricsV1, PILOT_METRICS_SCHEMA_VERSION, type PilotMetrics } from './schema'
export { addDays, ilDay, ilDayStartUtc } from './days'
export { share } from './aggregate'

/**
 * Live page: asOf = now and today = the Israel day of now. Snapshot of day D: today = D and asOf = Israel midnight after D.
 * The result is validated by the strict schema, so a shape error can never reach the page or a snapshot.
 */
export async function computePilotMetrics({
  asOf = new Date(),
  today = ilDay(asOf),
  backfilled = 0,
}: { asOf?: Date; today?: string; backfilled?: 0 | 1 } = {}): Promise<PilotMetrics> {
  const window: Window = { asOf, today }
  // Sequential: PGlite (local) serves one query at a time, and four reads are cheap.
  const rows = await accountRows(window)
  const byPosition = await difficultyByPosition(window)
  const mastery = await masteryRows(window)
  const generation = await generationRows(window)

  const byStatus = { PENDING: 0, SUCCEEDED: 0, FAILED: 0, REJECTED: 0, STALE: 0 }
  const failuresByClass = { provider: 0, deadline: 0, 'attempts-exhausted': 0, internal: 0, 'lease-expired': 0, other: 0 }
  let quotaAccount = 0
  let quotaCalls = 0
  for (const row of generation) {
    byStatus[row.status] += row.n
    if (row.status !== 'FAILED') continue
    if (row.class === 'quota-account') quotaAccount += row.n
    else if (row.class === 'quota-calls') quotaCalls += row.n
    else if (row.class === 'none') failuresByClass.other += row.n
    else failuresByClass[row.class] += row.n
  }

  const confirmations28 = mastery.confirmations.length
  const daysToMastery = mastery.confirmations.flatMap((c) => (c.days_to_mastery === null ? [] : [Math.max(0, c.days_to_mastery)]))
  return PilotMetricsV1.parse({
    schemaVersion: PILOT_METRICS_SCHEMA_VERSION,
    backfilled,
    funnel: funnel(rows),
    activeDays: activeDays(rows),
    day7Return: day7Return(rows, today),
    difficulty: { byPosition, ...stalled(rows) },
    mastery: {
      confirmations7: mastery.confirmations.filter((c) => c.in7).length,
      confirmations28,
      activeOwnerWeeks28: mastery.ownerWeeks,
      medianDaysToMastery: roundTo(median(daysToMastery), 0.1),
      perActiveOwnerWeek: mastery.ownerWeeks > 0 ? roundTo(confirmations28 / mastery.ownerWeeks, 0.01) : null,
    },
    generation: { byStatus, failuresByClass, quotaAccount, quotaCalls },
  } satisfies PilotMetrics)
}
