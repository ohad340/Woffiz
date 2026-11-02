import { createHash } from 'node:crypto'
import { prisma } from '../db'

export type Limit = { scope: string; max: number; windowSeconds: number }

const hashKey = (scope: string, subject: string) => createHash('sha256').update(`${scope}\n${subject}`).digest('hex')

/**
 * Counts one request against a fixed window and says whether it is allowed. One INSERT … ON CONFLICT
 * statement: PostgreSQL locks the row, so concurrent requests on any number of server instances each get
 * a distinct count and at most `max` pass per window. The database clock is used, never the instance's.
 */
export async function takeRateLimit(limit: Limit, subject: string): Promise<boolean> {
  const key = hashKey(limit.scope, subject)
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "EmailRateLimit" ("key", "windowStart", "count")
    VALUES (${key}, CURRENT_TIMESTAMP, 1)
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE
        WHEN "EmailRateLimit"."windowStart" <= CURRENT_TIMESTAMP - (${limit.windowSeconds} * INTERVAL '1 second') THEN 1
        ELSE "EmailRateLimit"."count" + 1
      END,
      "windowStart" = CASE
        WHEN "EmailRateLimit"."windowStart" <= CURRENT_TIMESTAMP - (${limit.windowSeconds} * INTERVAL '1 second') THEN CURRENT_TIMESTAMP
        ELSE "EmailRateLimit"."windowStart"
      END
    RETURNING "count"`
  const count = Number(rows[0]?.count ?? Number.POSITIVE_INFINITY)
  return count <= limit.max
}

/** Removes counters whose window ended long ago. Cheap (indexed); run occasionally. */
export async function pruneRateLimits(olderThanSeconds = 24 * 60 * 60) {
  await prisma.$executeRaw`
    DELETE FROM "EmailRateLimit" WHERE "windowStart" < CURRENT_TIMESTAMP - (${olderThanSeconds} * INTERVAL '1 second')`
}
