import { createHash } from 'node:crypto'
import { prisma } from '../db'

/**
 * Two persistent daily counters (UTC days), both stored in PostgreSQL and therefore shared by every server
 * instance, each taken with one atomic conditional upsert (decisions 47, 56 and 57):
 * - requests: one unit per generation or adaptation request of an account (initial plan, adapt, revise);
 * - provider calls: one unit per call to the model, retries included, for the whole system. A unit is taken
 *   BEFORE the call and is never given back, so a timeout or a lost response (the provider may have charged us) stays
 *   counted: the budget is conservative by construction.
 * The statement increments only while the count is below the limit, so under any concurrency exactly `max`
 * units are ever granted and a refused attempt never changes the count. Keys are hashes: no account id is stored.
 */

const utcDay = () => new Date().toISOString().slice(0, 10)

/** The UTC day a unit is charged to. It is stored on the job, so a refund targets the same day's counter. */
export const chargeDay = utcDay

const keyOf = (scope: string, subject: string, day: string) =>
  createHash('sha256').update(`${scope}\n${subject}\n${day}`).digest('hex')

async function takeUnit(scope: string, subject: string, max: number, day: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "AiUsageDay" ("key", "day", "count")
    VALUES (${keyOf(scope, subject, day)}, ${day}::date, 1)
    ON CONFLICT ("key") DO UPDATE SET "count" = "AiUsageDay"."count" + 1
    WHERE "AiUsageDay"."count" < ${max}
    RETURNING "count"`
  return rows.length > 0
}

/** One generation/adaptation request of this account today. False when the account already used its daily requests. */
export function takeRequestUnit(userId: string, maxPerAccountPerDay: number, day = utcDay()) {
  return takeUnit('ai-request', userId, maxPerAccountPerDay, day)
}

/**
 * Gives one request unit back on the day it was charged. Callers must have claimed the refund first
 * (refundJobUnitOnce in jobs.ts), which is what makes it happen at most once per job.
 */
export async function refundRequestUnit(userId: string, day: string) {
  const key = keyOf('ai-request', userId, day)
  // One statement: decrement while more than one unit is used, otherwise delete the row (the count must stay >= 1).
  // Both branches read the same snapshot, so the DELETE never sees the row the UPDATE just lowered.
  await prisma.$executeRaw`
    WITH lowered AS (
      UPDATE "AiUsageDay" SET "count" = "count" - 1 WHERE "key" = ${key} AND "count" > 1 RETURNING 1
    )
    DELETE FROM "AiUsageDay" WHERE "key" = ${key} AND "count" = 1 AND NOT EXISTS (SELECT 1 FROM lowered)`
}

/** One call to the model (a retry takes its own unit) against the system-wide daily call budget. Never refunded. */
export function takeCallUnit(maxCallsPerDay: number, day = utcDay()) {
  return takeUnit('ai-calls', 'all', maxCallsPerDay, day)
}

/** Removes counters of past days. Cheap (indexed); run occasionally. */
export async function pruneAiUsage(keepDays = 7) {
  await prisma.$executeRaw`DELETE FROM "AiUsageDay" WHERE "day" < CURRENT_DATE - ${keepDays}::int`
}
