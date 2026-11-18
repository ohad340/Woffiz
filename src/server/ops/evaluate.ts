// Alert evaluation, deduplication and notification (docs/DECISIONS.md P4-6, O6-O7).
// - One open alert per dedupKey: opening is INSERT ... ON CONFLICT DO NOTHING RETURNING against the partial unique index
//   "OpsAlert_one_open_per_key", so across server instances exactly one caller opens it.
// - Every notification (first, retry, reminder) is claimed by one conditional UPDATE under a transaction-scoped advisory lock
//   that also enforces the daily mail cap. The email is sent outside the transaction.
// - Nothing here throws into a request: evaluateAlerts catches everything, logs one fixed line and never records SERVER_ERROR.
import { Prisma } from '@/generated/prisma/client'
import { prisma } from '../db'
import { alertChannel, sendOpsAlert } from './alert-mail'
import { aiCallsToday, aiDailyCallsMax } from './budget'
import {
  DAILY_MAIL_CAP,
  QUIET_RESOLVE_MS,
  REMINDER_AFTER_MS,
  RETRY_AFTER_MS,
  SWEEP_MAX,
  WINDOWED_RULES,
  budgetWarningThreshold,
  claimKind,
  dedupKey,
  statusAfterFailure,
  windowStart,
  type BudgetRule,
  type ClaimKind,
  type RuleCode,
  type WindowedRule,
} from './rules'
import { MINUTE_MS, minus, utcDay, utcTs } from './time'

export type AlertTrigger = 'server-error' | 'auth-email' | 'generation' | 'housekeeping'

const RULES_BY_TRIGGER: Record<AlertTrigger, (WindowedRule | BudgetRule)[]> = {
  'server-error': ['server-errors'],
  'auth-email': ['auth-email'],
  generation: ['generation-failures', 'ai-budget-warning', 'ai-budget-exhausted'],
  // The housekeeping rule itself is opened and resolved only by the run (housekeeping/run.ts).
  housekeeping: ['server-errors', 'auth-email', 'generation-failures', 'ai-budget-warning', 'ai-budget-exhausted'],
}

/**
 * Evaluates the trigger's rules, then sweeps: auto-resolve, retries and reminders. Never throws. `now` exists for tests
 * (timestamps are compared with it, so a test can move the clock); the app always uses the current time.
 */
export async function evaluateAlerts(trigger: AlertTrigger, { now = new Date() }: { now?: Date } = {}): Promise<void> {
  try {
    for (const rule of RULES_BY_TRIGGER[trigger]) {
      if (rule === 'ai-budget-warning' || rule === 'ai-budget-exhausted') await evaluateBudget(rule, now)
      else await evaluateWindowed(rule, now)
    }
    await sweep(now)
  } catch {
    console.error('[ops] alert evaluation failed')
  }
}

// ----- sources -----

/** Matching rows of a windowed rule and their time column. Generation failures follow G1 (all roles). */
function source(rule: WindowedRule): { rows: Prisma.Sql; at: Prisma.Sql } {
  if (rule === 'generation-failures') {
    return {
      rows: Prisma.sql`"GenerationJob" WHERE "status" = 'FAILED' AND COALESCE("errorCode", '') NOT IN ('quota-account', 'quota-calls')`,
      at: Prisma.sql`"finishedAt"`,
    }
  }
  const kind = rule === 'server-errors' ? 'SERVER_ERROR' : 'AUTH_EMAIL_FAILED'
  return { rows: Prisma.sql`"OpsEvent" WHERE "kind" = ${kind}::"OpsEventKind"`, at: Prisma.sql`"createdAt"` }
}

async function evaluateWindowed(rule: WindowedRule, now: Date) {
  const { threshold, windowMinutes } = WINDOWED_RULES[rule]
  const key = dedupKey(rule, now)
  const { rows, at } = source(rule)
  const opened = await prisma.$queryRaw<{ id: string }[]>`
    WITH m AS (
      SELECT count(*)::int AS n, max(${at}) AS last FROM ${rows} AND ${at} >= ${utcTs(windowStart(rule, now))} AND ${at} <= ${utcTs(now)}
    )
    INSERT INTO "OpsAlert" ("id", "rule", "dedupKey", "openedAt", "lastEventAt", "eventCount", "notifyAttempts")
    SELECT gen_random_uuid(), ${rule}::"OpsAlertRule", ${key}, ${utcTs(now)}, m.last, m.n, 0 FROM m WHERE m.n >= ${threshold}
    ON CONFLICT DO NOTHING
    RETURNING "id"`
  if (opened[0]) {
    await notify(opened[0].id, 'first', now)
    return
  }
  // Already open (or below the threshold): keep the open alert's last event current. Over the threshold the event count is
  // refreshed too, counted from one window before the alert opened.
  await prisma.$executeRaw`
    UPDATE "OpsAlert" a SET
      "lastEventAt" = GREATEST(a."lastEventAt", COALESCE((SELECT max(${at}) FROM ${rows} AND ${at} > a."openedAt" AND ${at} <= ${utcTs(now)}), a."lastEventAt")),
      "eventCount" = CASE
        WHEN (SELECT count(*) FROM ${rows} AND ${at} >= ${utcTs(windowStart(rule, now))} AND ${at} <= ${utcTs(now)}) >= ${threshold}
        THEN (SELECT count(*)::int FROM ${rows} AND ${at} >= a."openedAt" - (${windowMinutes} * INTERVAL '1 minute') AND ${at} <= ${utcTs(now)})
        ELSE a."eventCount" END
    WHERE a."dedupKey" = ${key} AND a."resolvedAt" IS NULL`
}

async function evaluateBudget(rule: BudgetRule, now: Date) {
  const day = utcDay(now)
  const max = aiDailyCallsMax()
  const calls = await aiCallsToday(day)
  let firing: boolean
  if (rule === 'ai-budget-warning') {
    firing = calls >= budgetWarningThreshold(max)
  } else {
    const [row] = await prisma.$queryRaw<{ n: number }[]>`
      SELECT count(*)::int AS n FROM "GenerationJob"
      WHERE "status" = 'FAILED' AND "errorCode" = 'quota-calls'
        AND "finishedAt" >= ${utcTs(new Date(`${day}T00:00:00.000Z`))} AND "finishedAt" <= ${utcTs(now)}`
    firing = calls >= max || (row?.n ?? 0) > 0
  }
  if (!firing) return
  await openOrTouch(rule, dedupKey(rule, now), calls, now)
}

/** Opens a non-windowed alert (budget, housekeeping), or refreshes the open one. The opener notifies. */
async function openOrTouch(rule: BudgetRule | 'housekeeping', key: string, count: number, now: Date) {
  const opened = await prisma.$queryRaw<{ id: string }[]>`
    INSERT INTO "OpsAlert" ("id", "rule", "dedupKey", "openedAt", "lastEventAt", "eventCount", "notifyAttempts")
    VALUES (gen_random_uuid(), ${rule}::"OpsAlertRule", ${key}, ${utcTs(now)}, ${utcTs(now)}, ${count}, 0)
    ON CONFLICT DO NOTHING
    RETURNING "id"`
  if (opened[0]) {
    await notify(opened[0].id, 'first', now)
    return
  }
  await prisma.$executeRaw`
    UPDATE "OpsAlert" SET "lastEventAt" = GREATEST("lastEventAt", ${utcTs(now)}), "eventCount" = ${count}
    WHERE "dedupKey" = ${key} AND "resolvedAt" IS NULL`
}

// ----- the housekeeping rule (called by the run) -----

/** A run with a failed step opens (or refreshes) the housekeeping alert. Never throws. */
export async function raiseHousekeepingAlert(failedSteps: number, now = new Date()): Promise<void> {
  try {
    await openOrTouch('housekeeping', dedupKey('housekeeping', now), failedSteps, now)
  } catch {
    console.error('[ops] alert evaluation failed')
  }
}

/** A run whose every step was ok resolves the open housekeeping alert. Never throws. */
export async function resolveHousekeepingAlert(now = new Date()): Promise<void> {
  try {
    await prisma.$executeRaw`UPDATE "OpsAlert" SET "resolvedAt" = ${utcTs(now)} WHERE "rule" = 'housekeeping' AND "resolvedAt" IS NULL`
  } catch {
    console.error('[ops] alert evaluation failed')
  }
}

// ----- notification -----

/** The three claim conditions (rules.ts claimKind is the same predicate, unit-tested). */
function claimCondition(kind: ClaimKind, now: Date): Prisma.Sql {
  if (kind === 'first') return Prisma.sql`"lastNotifiedAt" IS NULL`
  if (kind === 'retry') {
    return Prisma.sql`("notifyStatus" = 'FAILED' OR "notifyStatus" IS NULL) AND "notifyAttempts" BETWEEN 1 AND 2
      AND "lastNotifiedAt" <= ${utcTs(minus(now, RETRY_AFTER_MS))}`
  }
  return Prisma.sql`"notifyStatus" IS NOT NULL AND "notifyStatus" <> 'FAILED' AND "lastNotifiedAt" <= ${utcTs(minus(now, REMINDER_AFTER_MS))}`
}

type Claimed = { attempt: number; rule: RuleCode; eventCount: number; openedAt: Date; lastEventAt: Date }

/** Resolves the channel, claims the notification (at most once), sends outside the transaction, records the outcome. */
async function notify(id: string, kind: ClaimKind, now: Date): Promise<void> {
  const condition = claimCondition(kind, now)
  const channel = alertChannel()
  if (channel.kind === 'status') {
    // No send and no attempt counted; a reminder re-checks the configuration a day later.
    await prisma.$executeRaw`
      UPDATE "OpsAlert" SET "notifyStatus" = ${channel.status}::"OpsNotifyStatus", "lastNotifiedAt" = ${utcTs(now)}
      WHERE "id" = ${id}::uuid AND "resolvedAt" IS NULL AND ${condition}`
    return
  }

  const attempt = kind === 'retry' ? Prisma.sql`"notifyAttempts" + 1` : Prisma.sql`1`
  const claimed = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('woffiz-ops-alert-mail'))`
    const [sent] = await tx.$queryRaw<{ n: number }[]>`
      SELECT COALESCE(sum("notifyAttempts"), 0)::int AS n FROM "OpsAlert" WHERE "lastNotifiedAt" >= date_trunc('day', ${utcTs(now)})`
    if ((sent?.n ?? 0) >= DAILY_MAIL_CAP) {
      await tx.$executeRaw`
        UPDATE "OpsAlert" SET "notifyStatus" = 'SUPPRESSED', "lastNotifiedAt" = ${utcTs(now)}
        WHERE "id" = ${id}::uuid AND "resolvedAt" IS NULL AND ${condition}`
      return null
    }
    const rows = await tx.$queryRaw<Claimed[]>`
      UPDATE "OpsAlert" SET "notifyAttempts" = ${attempt}, "notifyStatus" = NULL, "lastNotifiedAt" = ${utcTs(now)}
      WHERE "id" = ${id}::uuid AND "resolvedAt" IS NULL AND ${condition}
      RETURNING "notifyAttempts" AS attempt, "rule"::text AS rule, "eventCount" AS "eventCount",
        ("openedAt" AT TIME ZONE 'UTC') AS "openedAt", ("lastEventAt" AT TIME ZONE 'UTC') AS "lastEventAt"`
    return rows[0] ?? null
  })
  if (!claimed) return

  let status: 'SENT' | 'FAILED' | 'GAVE_UP' = 'SENT'
  try {
    const { threshold, windowMinutes } = await mailFacts(claimed.rule)
    await sendOpsAlert(channel, {
      rule: claimed.rule,
      count: claimed.eventCount,
      windowMinutes,
      threshold,
      firstEventAt: await firstEventAt(claimed),
      lastEventAt: claimed.lastEventAt,
    })
  } catch {
    status = statusAfterFailure(claimed.attempt)
    console.error(`[ops] alert mail failed: ${claimed.rule} attempt ${claimed.attempt}`)
  }
  // Only the claim this sender holds is finished; a newer claim (after a 5 min retry window) is left alone.
  await prisma.$executeRaw`
    UPDATE "OpsAlert" SET "notifyStatus" = ${status}::"OpsNotifyStatus"
    WHERE "id" = ${id}::uuid AND "notifyStatus" IS NULL AND "notifyAttempts" = ${claimed.attempt}`
}

async function mailFacts(rule: RuleCode): Promise<{ threshold: number; windowMinutes: number | null }> {
  if (rule === 'server-errors' || rule === 'auth-email' || rule === 'generation-failures') return WINDOWED_RULES[rule]
  if (rule === 'ai-budget-warning') return { threshold: budgetWarningThreshold(aiDailyCallsMax()), windowMinutes: null }
  if (rule === 'ai-budget-exhausted') return { threshold: aiDailyCallsMax(), windowMinutes: null }
  return { threshold: 1, windowMinutes: null }
}

/** First matching event of the window that opened a windowed alert; the opening time for the other rules. */
async function firstEventAt(alert: Claimed): Promise<Date> {
  if (alert.rule !== 'server-errors' && alert.rule !== 'auth-email' && alert.rule !== 'generation-failures') return alert.openedAt
  const { rows, at } = source(alert.rule)
  const from = new Date(alert.openedAt.getTime() - WINDOWED_RULES[alert.rule].windowMinutes * MINUTE_MS)
  const [row] = await prisma.$queryRaw<{ first: Date | null }[]>`
    SELECT (min(${at}) AT TIME ZONE 'UTC') AS first FROM ${rows} AND ${at} >= ${utcTs(from)} AND ${at} <= ${utcTs(alert.lastEventAt)}`
  return row?.first ?? alert.openedAt
}

/** Auto-resolve, then retries and reminders (at most SWEEP_MAX notifications per evaluation). */
async function sweep(now: Date) {
  await prisma.$executeRaw`
    UPDATE "OpsAlert" SET "resolvedAt" = ${utcTs(now)}
    WHERE "resolvedAt" IS NULL AND (
      ("rule" IN ('server-errors', 'auth-email', 'generation-failures') AND "lastEventAt" < ${utcTs(minus(now, QUIET_RESOLVE_MS))})
      OR ("rule" IN ('ai-budget-warning', 'ai-budget-exhausted') AND split_part("dedupKey", ':', 2) < ${utcDay(now)}))`

  const due = await prisma.$queryRaw<{ id: string; lastNotifiedAt: Date | null; notifyStatus: string | null; notifyAttempts: number }[]>`
    SELECT "id", ("lastNotifiedAt" AT TIME ZONE 'UTC') AS "lastNotifiedAt", "notifyStatus"::text AS "notifyStatus", "notifyAttempts"
    FROM "OpsAlert"
    WHERE "resolvedAt" IS NULL AND ((${claimCondition('first', now)}) OR (${claimCondition('retry', now)}) OR (${claimCondition('reminder', now)}))
    ORDER BY "openedAt" LIMIT ${SWEEP_MAX}`
  for (const alert of due) {
    const kind = claimKind(alert, now)
    if (kind) await notify(alert.id, kind, now)
  }
}
