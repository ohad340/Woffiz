// The four read-only metric queries (docs/DECISIONS.md P4-6). Only aggregate-ready columns are selected: never names,
// emails, profile or exercise text, payloads or idempotency keys. Rows from Q1 stay inside this module.
// Timestamps are naive UTC (TIMESTAMP(3)); ("col" AT TIME ZONE 'UTC') makes a timestamptz, and a second
// AT TIME ZONE 'Asia/Jerusalem' gives Israel local time, whose ::date is the Israel day.
import { prisma } from '../db'
import type { AccountRow } from './aggregate'
import type { FailureClass, TopicCode } from './schema'

export type Window = { asOf: Date; today: string }

type Q1Row = {
  verified: boolean
  onboarded: boolean
  onboarded_at: Date | null
  onboarded_day: string | null
  first_current_at: Date | null
  days7: number
  days28: number
  returned: boolean
  has_active_plan: boolean
  stalled: boolean
}

/** Q1: one row per OWNER account created before asOf. */
export async function accountRows({ asOf, today }: Window): Promise<AccountRow[]> {
  const rows = await prisma.$queryRaw<Q1Row[]>`
    WITH p AS (SELECT ${asOf.toISOString()}::timestamptz AS as_of, ${today}::date AS today),
    o AS (
      SELECT u."emailVerified" AS verified, pu.id AS puppy_id,
             (pu."onboardedAt" AT TIME ZONE 'UTC') AS onboarded_at
      FROM "user" u LEFT JOIN "Puppy" pu ON pu."ownerId" = u.id CROSS JOIN p
      WHERE u.role = 'OWNER' AND (u."createdAt" AT TIME ZONE 'UTC') < p.as_of
    ),
    a AS (
      SELECT x."puppyId" AS puppy_id, x."levelId" AS level_id, x.mode, (x."createdAt" AT TIME ZONE 'UTC') AS at,
             ((x."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jerusalem')::date AS day
      FROM "Attempt" x CROSS JOIN p WHERE (x."createdAt" AT TIME ZONE 'UTC') < p.as_of
    )
    SELECT o.verified,
           (o.verified AND o.onboarded_at IS NOT NULL AND o.onboarded_at < p.as_of) AS onboarded,
           o.onboarded_at,
           ((o.onboarded_at AT TIME ZONE 'Asia/Jerusalem')::date)::text AS onboarded_day,
           (SELECT min(a.at) FROM a WHERE a.puppy_id = o.puppy_id AND a.mode = 'CURRENT') AS first_current_at,
           (SELECT count(DISTINCT a.day) FROM a WHERE a.puppy_id = o.puppy_id AND a.day > p.today - 7)::int AS days7,
           (SELECT count(DISTINCT a.day) FROM a WHERE a.puppy_id = o.puppy_id AND a.day > p.today - 28)::int AS days28,
           EXISTS (SELECT 1 FROM a WHERE a.puppy_id = o.puppy_id
                   AND a.day BETWEEN (o.onboarded_at AT TIME ZONE 'Asia/Jerusalem')::date + 7
                                 AND (o.onboarded_at AT TIME ZONE 'Asia/Jerusalem')::date + 13) AS returned,
           EXISTS (SELECT 1 FROM "Plan" pl WHERE pl."puppyId" = o.puppy_id AND pl.status = 'ACTIVE') AS has_active_plan,
           EXISTS (
             SELECT 1 FROM "Plan" pl JOIN "Level" l ON l.id = pl."currentLevelId"
             LEFT JOIN "Level" prev ON prev."planId" = l."planId" AND prev.position = l.position - 1
             LEFT JOIN "MasteryEvent" pm ON pm."levelId" = prev.id
             WHERE pl."puppyId" = o.puppy_id AND pl.status = 'ACTIVE'
               AND NOT EXISTS (SELECT 1 FROM "MasteryEvent" m WHERE m."levelId" = l.id)
               AND NOT EXISTS (SELECT 1 FROM a WHERE a.level_id = l.id AND a.at >= p.as_of - INTERVAL '7 days')
               AND GREATEST(o.onboarded_at, (pl."createdAt" AT TIME ZONE 'UTC'), (pm."confirmedAt" AT TIME ZONE 'UTC'))
                   <= p.as_of - INTERVAL '7 days'
           ) AS stalled
    FROM o CROSS JOIN p`
  return rows.map((r) => ({
    verified: r.verified,
    onboarded: r.onboarded,
    onboardedAt: r.onboarded_at,
    onboardedDay: r.onboarded_day,
    firstCurrentAt: r.first_current_at,
    days7: r.days7,
    days28: r.days28,
    returned: r.returned,
    hasActivePlan: r.has_active_plan,
    stalled: r.stalled,
  }))
}

/** Q2: per level position, owners with at least two STRUGGLING CURRENT attempts on one level, and the most frequent topic. */
export async function difficultyByPosition({ asOf }: Window): Promise<{ position: number; owners: number; topTopic: TopicCode }[]> {
  const rows = await prisma.$queryRaw<{ position: number; owners: number; top_topic: TopicCode }[]>`
    WITH p AS (SELECT ${asOf.toISOString()}::timestamptz AS as_of),
    s AS (
      SELECT l.position, l.topic, x."puppyId" AS puppy_id
      FROM "Attempt" x JOIN "Level" l ON l.id = x."levelId" JOIN "Puppy" pu ON pu.id = x."puppyId"
      JOIN "user" u ON u.id = pu."ownerId" CROSS JOIN p
      WHERE u.role = 'OWNER' AND u."emailVerified" AND pu."onboardedAt" IS NOT NULL
        AND x.mode = 'CURRENT' AND x.outcome = 'STRUGGLING' AND (x."createdAt" AT TIME ZONE 'UTC') < p.as_of
      GROUP BY l.id, l.position, l.topic, x."puppyId" HAVING count(*) >= 2
    )
    SELECT position, count(DISTINCT puppy_id)::int AS owners, (mode() WITHIN GROUP (ORDER BY topic))::text AS top_topic
    FROM s GROUP BY position ORDER BY position LIMIT 100`
  return rows.map((r) => ({ position: r.position, owners: r.owners, topTopic: r.top_topic }))
}

/** Q3: mastery confirmations of the last 28 Israel days, and active owner-weeks (distinct puppy x 7-day bucket). */
export async function masteryRows({ asOf, today }: Window) {
  const confirmations = await prisma.$queryRaw<{ in7: boolean; days_to_mastery: number | null }[]>`
    WITH p AS (SELECT ${asOf.toISOString()}::timestamptz AS as_of, ${today}::date AS today),
    m AS (
      SELECT ((me."confirmedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jerusalem')::date AS day,
             (me."confirmedAt" AT TIME ZONE 'UTC') AS at,
             (SELECT min(x."createdAt") AT TIME ZONE 'UTC' FROM "Attempt" x
               WHERE x."levelId" = me."levelId" AND x.mode = 'CURRENT') AS first_at
      FROM "MasteryEvent" me JOIN "Level" l ON l.id = me."levelId" JOIN "Plan" pl ON pl.id = l."planId"
      JOIN "Puppy" pu ON pu.id = pl."puppyId" JOIN "user" u ON u.id = pu."ownerId" CROSS JOIN p
      WHERE u.role = 'OWNER' AND u."emailVerified" AND (me."confirmedAt" AT TIME ZONE 'UTC') < p.as_of
        AND ((me."confirmedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jerusalem')::date > p.today - 28
    )
    SELECT (day > (SELECT today FROM p) - 7) AS in7, (EXTRACT(EPOCH FROM (at - first_at)) / 86400.0)::float8 AS days_to_mastery FROM m`
  const [weeks] = await prisma.$queryRaw<{ owner_weeks: number }[]>`
    WITH p AS (SELECT ${asOf.toISOString()}::timestamptz AS as_of, ${today}::date AS today)
    SELECT count(*)::int AS owner_weeks FROM (
      SELECT DISTINCT x."puppyId", (p.today - ((x."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jerusalem')::date) / 7 AS bucket
      FROM "Attempt" x JOIN "Puppy" pu ON pu.id = x."puppyId" JOIN "user" u ON u.id = pu."ownerId" CROSS JOIN p
      WHERE u.role = 'OWNER' AND u."emailVerified" AND (x."createdAt" AT TIME ZONE 'UTC') < p.as_of
        AND ((x."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jerusalem')::date > p.today - 28
    ) t`
  return { confirmations, ownerWeeks: weeks?.owner_weeks ?? 0 }
}

export type GenerationStatusCode = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'REJECTED' | 'STALE'
export type GenerationClass = FailureClass | 'quota-account' | 'quota-calls' | 'none'

/** Q4: OWNER jobs created in the 7 days before asOf, by status and error class. Raw provider messages map to 'provider'. */
export async function generationRows({ asOf }: Window): Promise<{ status: GenerationStatusCode; class: GenerationClass; n: number }[]> {
  return prisma.$queryRaw<{ status: GenerationStatusCode; class: GenerationClass; n: number }[]>`
    WITH p AS (SELECT ${asOf.toISOString()}::timestamptz AS as_of)
    SELECT j.status::text AS status,
           CASE WHEN j."errorCode" IN ('quota-account','quota-calls','attempts-exhausted','deadline','internal','lease-expired') THEN j."errorCode"
                WHEN j."errorCode" LIKE 'provider %' THEN 'provider'
                WHEN j."errorCode" IS NULL THEN 'none' ELSE 'other' END AS class,
           count(*)::int AS n
    FROM "GenerationJob" j JOIN "user" u ON u.id = j."ownerId" CROSS JOIN p
    WHERE u.role = 'OWNER' AND (j."createdAt" AT TIME ZONE 'UTC') >= p.as_of - INTERVAL '7 days'
      AND (j."createdAt" AT TIME ZONE 'UTC') < p.as_of
    GROUP BY 1, 2`
}
