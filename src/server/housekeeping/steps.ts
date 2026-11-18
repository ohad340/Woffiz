// The daily housekeeping steps, in order (docs/DECISIONS.md P4-6, O10). Each is idempotent and reconciling, so a
// duplicated or missed cron delivery is harmless. A step returns its count, or null when the statement reports none.
import { pruneJobPayloads } from '../ai/jobs'
import { pruneAiUsage } from '../ai/quota'
import { prisma } from '../db'
import { pruneRateLimits } from '../email/rate-limit'
import { PILOT_METRICS_SCHEMA_VERSION, PilotMetricsV1, addDays, computePilotMetrics, ilDay, ilDayStartUtc } from '../metrics'
import { evaluateAlerts } from '../ops/evaluate'
import { DAY_MS, utcTs } from '../ops/time'
import { purgeNeverVerified } from './never-verified'
import { BACKFILL_DAYS, HOUSEKEEPING_RUN_DAYS, METRIC_DAY_DAYS, OPS_EVENT_DAYS, PRUNE_BATCH, RESOLVED_ALERT_DAYS } from './retention'

export const STEP_NAMES = [
  'job-payloads',
  'ai-usage',
  'rate-limits',
  'ops-events',
  'ops-alerts',
  'housekeeping-runs',
  'metric-days',
  'never-verified',
  'snapshots',
  'alerts',
] as const
export type StepName = (typeof STEP_NAMES)[number]

const daysBefore = (now: Date, days: number) => utcTs(new Date(now.getTime() - days * DAY_MS))

/** Writes one snapshot. `replace` upserts (yesterday); otherwise an existing day is never recomputed (backfill). */
async function writeSnapshot(day: string, backfilled: 0 | 1, replace: boolean): Promise<number> {
  const metrics = PilotMetricsV1.parse(await computePilotMetrics({ asOf: ilDayStartUtc(addDays(day, 1)), today: day, backfilled }))
  const json = JSON.stringify(metrics)
  return replace
    ? prisma.$executeRaw`
        INSERT INTO "PilotMetricDay" ("day", "schemaVersion", "computedAt", "metricsJson")
        VALUES (${day}::date, ${PILOT_METRICS_SCHEMA_VERSION}, (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'), ${json}::jsonb)
        ON CONFLICT ("day") DO UPDATE SET "metricsJson" = EXCLUDED."metricsJson", "computedAt" = EXCLUDED."computedAt", "schemaVersion" = EXCLUDED."schemaVersion"`
    : prisma.$executeRaw`
        INSERT INTO "PilotMetricDay" ("day", "schemaVersion", "computedAt", "metricsJson")
        VALUES (${day}::date, ${PILOT_METRICS_SCHEMA_VERSION}, (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'), ${json}::jsonb)
        ON CONFLICT ("day") DO NOTHING`
}

/** Israel yesterday (upserted), plus each missing day of the 7 before it (backfilled = 1). Returns rows written. */
async function snapshots(now: Date): Promise<number> {
  const yesterday = addDays(ilDay(now), -1)
  const earliest = addDays(yesterday, -BACKFILL_DAYS)
  const existing = await prisma.$queryRaw<{ day: string }[]>`
    SELECT "day"::text AS day FROM "PilotMetricDay" WHERE "day" >= ${earliest}::date AND "day" < ${yesterday}::date`
  const have = new Set(existing.map((row) => row.day))
  let written = 0
  for (let offset = BACKFILL_DAYS; offset >= 1; offset--) {
    const day = addDays(yesterday, -offset)
    if (!have.has(day)) written += await writeSnapshot(day, 1, false)
  }
  written += await writeSnapshot(yesterday, 0, true)
  return written
}

export const STEPS: Record<StepName, (now: Date) => Promise<number | null>> = {
  'job-payloads': async () => {
    await pruneJobPayloads()
    return null
  },
  'ai-usage': async () => {
    await pruneAiUsage()
    return null
  },
  'rate-limits': async () => {
    await pruneRateLimits()
    return null
  },
  'ops-events': (now) =>
    prisma.$executeRaw`
      DELETE FROM "OpsEvent" WHERE "id" IN (
        SELECT "id" FROM "OpsEvent" WHERE "createdAt" < ${daysBefore(now, OPS_EVENT_DAYS)} LIMIT ${PRUNE_BATCH})`,
  'ops-alerts': (now) =>
    prisma.$executeRaw`
      DELETE FROM "OpsAlert" WHERE "id" IN (
        SELECT "id" FROM "OpsAlert" WHERE "resolvedAt" IS NOT NULL AND "resolvedAt" < ${daysBefore(now, RESOLVED_ALERT_DAYS)} LIMIT ${PRUNE_BATCH})`,
  'housekeeping-runs': (now) =>
    prisma.$executeRaw`
      DELETE FROM "HousekeepingRun" WHERE "id" IN (
        SELECT "id" FROM "HousekeepingRun" WHERE "finishedAt" IS NOT NULL AND "finishedAt" < ${daysBefore(now, HOUSEKEEPING_RUN_DAYS)} LIMIT ${PRUNE_BATCH})`,
  'metric-days': (now) => prisma.$executeRaw`DELETE FROM "PilotMetricDay" WHERE "day" < ${ilDay(now)}::date - ${METRIC_DAY_DAYS}::int`,
  'never-verified': async (now) => {
    const result = await purgeNeverVerified({ now })
    return result.mode === 'delete' ? result.deleted : result.eligible
  },
  snapshots,
  alerts: async (now) => {
    await evaluateAlerts('housekeeping', { now })
    return null
  },
}
