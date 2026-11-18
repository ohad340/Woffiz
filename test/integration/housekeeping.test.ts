import { randomUUID } from 'node:crypto'
import { createEmailVerificationToken } from 'better-auth/api'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET as authGET } from '@/app/api/auth/[...all]/route'
import { GET as cronGET } from '@/app/api/cron/housekeeping/route'
import { pruneJobPayloads } from '@/server/ai/jobs'
import { auth } from '@/server/auth'
import { prisma } from '@/server/db'
import { purgeNeverVerified } from '@/server/housekeeping/never-verified'
import { runHousekeeping } from '@/server/housekeeping/run'
import { addDays, ilDay } from '@/server/metrics'
import { evaluateAlerts } from '@/server/ops'
import { utcTs } from '@/server/ops/time'
import { REAL_POSTGRES, insertJob, resetDatabase } from './helpers'
import { BASE } from './mail'
import { HOUR, MIN, alertFiles, eventCount, freshOutbox, insertEvents, later, openAlerts, PASSWORD } from './ops-helpers'

// Daily housekeeping (Phase 4, slice 6; docs/DECISIONS.md P4-6): run lease, isolated steps, retention, snapshots, cron route.
beforeEach(resetDatabase)
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

const DAY = 24 * HOUR
const SECRET = 'local-test-secret-0123456789'
const cron = (headers: Record<string, string> = {}) => cronGET(new Request(`${BASE}/api/cron/housekeeping`, { headers }))
const stepOf = (result: Awaited<ReturnType<typeof runHousekeeping>>, step: string) =>
  result.outcome === 'already-running' ? undefined : result.steps.find((s) => s.step === step)

async function insertRun(o: { startedAt: Date; finishedAt?: Date | null }) {
  await prisma.$executeRaw`
    INSERT INTO "HousekeepingRun" ("id", "trigger", "startedAt", "finishedAt", "stepsJson")
    VALUES (gen_random_uuid(), 'MANUAL', ${utcTs(o.startedAt)}, ${o.finishedAt ? utcTs(o.finishedAt) : null}, '{"v":1,"outcome":"ok","steps":[]}'::jsonb)`
}

async function insertResolvedAlert(resolvedAt: Date) {
  await prisma.$executeRaw`
    INSERT INTO "OpsAlert" ("id", "rule", "dedupKey", "openedAt", "lastEventAt", "eventCount", "notifyAttempts", "resolvedAt")
    VALUES (gen_random_uuid(), 'server-errors', 'server-errors', ${utcTs(resolvedAt)}, ${utcTs(resolvedAt)}, 3, 0, ${utcTs(resolvedAt)})`
}

describe('retention boundaries (just inside is kept, just outside is deleted)', () => {
  it('OpsEvent 30 days, resolved OpsAlert 90 days, finished HousekeepingRun 90 days, PilotMetricDay 365 Israel days', async () => {
    const now = new Date()
    await insertEvents('SERVER_ERROR', 1, later(now, -30 * DAY + MIN))
    await insertEvents('SERVER_ERROR', 1, later(now, -30 * DAY - MIN))
    await insertResolvedAlert(later(now, -90 * DAY + MIN))
    await insertResolvedAlert(later(now, -90 * DAY - MIN))
    await insertRun({ startedAt: later(now, -90 * DAY), finishedAt: later(now, -90 * DAY + MIN) })
    await insertRun({ startedAt: later(now, -90 * DAY - 2 * MIN), finishedAt: later(now, -90 * DAY - MIN) })
    const today = ilDay(now)
    for (const day of [addDays(today, -365), addDays(today, -366)]) {
      await prisma.$executeRaw`INSERT INTO "PilotMetricDay" ("day", "schemaVersion", "metricsJson") VALUES (${day}::date, 1, '{}'::jsonb)`
    }

    const result = await runHousekeeping({ trigger: 'MANUAL', now })
    expect(result.outcome).toBe('ok')
    expect(stepOf(result, 'ops-events')).toMatchObject({ status: 'ok', count: 1 })
    expect(stepOf(result, 'ops-alerts')).toMatchObject({ status: 'ok', count: 1 })
    expect(stepOf(result, 'housekeeping-runs')).toMatchObject({ status: 'ok', count: 1 })
    expect(stepOf(result, 'metric-days')).toMatchObject({ status: 'ok', count: 1 })
    expect(await prisma.opsEvent.count()).toBe(1)
    expect(await prisma.opsAlert.count()).toBe(1)
    expect(await prisma.housekeepingRun.count()).toBe(2) // the kept old run and this run
    const days = (await prisma.$queryRaw<{ day: string }[]>`SELECT "day"::text AS day FROM "PilotMetricDay" WHERE "day" < ${addDays(today, -300)}::date`).map((r) => r.day)
    expect(days).toEqual([addDays(today, -365)])
  })

  it('payload pruning gives exactly the rows pruneJobPayloads gives (B3 unchanged, now daily)', async () => {
    async function seed() {
      const user = await prisma.user.create({ data: { id: randomUUID(), name: 't', email: `p-${randomUUID()}@example.test`, emailVerified: true } })
      const puppy = await prisma.puppy.create({ data: { ownerId: user.id } })
      for (const [label, days] of [['old', 31], ['edge-out', 30.01], ['edge-in', 29.99], ['new', 1]] as const) {
        const id = await insertJob({ puppyId: puppy.id, ownerId: user.id, status: 'FAILED', key: label })
        await prisma.$executeRaw`
          UPDATE "GenerationJob" SET "payloadJson" = '{"text":"candidate"}'::jsonb,
            "createdAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - (${days} * INTERVAL '1 day') WHERE "id" = ${id}::uuid`
      }
    }
    const kept = async () => (await prisma.generationJob.findMany({ where: { payloadJson: { not: { equals: null } } }, select: { idempotencyKey: true } })).map((j) => j.idempotencyKey).sort()
    await seed()
    await pruneJobPayloads()
    const direct = await kept()
    await resetDatabase()
    await seed()
    await runHousekeeping({ trigger: 'MANUAL' })
    expect(await kept()).toEqual(direct)
    expect(direct).toEqual(['edge-in', 'new'])
  })
})

describe('the run', () => {
  it('a failing step does not stop the others: HOUSEKEEPING_FAILED, outcome partial, the housekeeping alert opens; the next ok run resolves it', async () => {
    const outbox = freshOutbox()
    vi.stubEnv('ALERT_EMAIL', 'ops-alerts@example.test')
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const failing = await runHousekeeping({
      trigger: 'MANUAL',
      beforeStep: (step) => {
        if (step === 'ops-events') throw new TypeError('injected')
      },
    })
    expect(failing.outcome).toBe('partial')
    if (failing.outcome === 'already-running') throw new Error('unexpected')
    expect(failing.steps.map((s) => [s.step, s.status])).toEqual([
      ['job-payloads', 'ok'],
      ['ai-usage', 'ok'],
      ['rate-limits', 'ok'],
      ['ops-events', 'failed'],
      ['ops-alerts', 'ok'],
      ['housekeeping-runs', 'ok'],
      ['metric-days', 'ok'],
      ['never-verified', 'ok'],
      ['snapshots', 'ok'],
      ['alerts', 'ok'],
    ])
    expect(errors.mock.calls.map((c) => String(c[0]))).toEqual(['[housekeeping] step ops-events failed: TypeError'])
    expect(await eventCount('HOUSEKEEPING_FAILED')).toBe(1)
    expect(await openAlerts()).toMatchObject([{ rule: 'HOUSEKEEPING', notifyStatus: 'SENT' }])
    expect(alertFiles(outbox)).toHaveLength(1)
    const stored = await prisma.housekeepingRun.findFirstOrThrow()
    expect(stored.stepsJson).toMatchObject({ v: 1, outcome: 'partial' })
    expect(JSON.stringify(stored.stepsJson)).not.toContain('injected') // a class, never a message

    const next = await runHousekeeping({ trigger: 'MANUAL' })
    expect(next.outcome).toBe('ok')
    expect(await openAlerts()).toEqual([])
    expect(alertFiles(outbox)).toHaveLength(1) // resolution sends nothing
  })

  it('an unfinished run refuses a second start; one older than 15 min is closed as abandoned and the new run proceeds', async () => {
    const now = new Date()
    await insertRun({ startedAt: later(now, -14 * MIN) })
    expect(await runHousekeeping({ trigger: 'MANUAL', now })).toEqual({ outcome: 'already-running' })
    expect(await prisma.housekeepingRun.count()).toBe(1)

    const after = later(now, 2 * MIN) // the unfinished run is now 16 minutes old
    const result = await runHousekeeping({ trigger: 'MANUAL', now: after })
    expect(result.outcome).toBe('ok')
    const runs = await prisma.housekeepingRun.findMany({ orderBy: { startedAt: 'asc' } })
    expect(runs).toHaveLength(2)
    expect(runs[0]!.stepsJson).toMatchObject({ outcome: 'abandoned' })
    expect(runs[0]!.finishedAt).not.toBeNull()
    expect(runs[1]!.stepsJson).toMatchObject({ outcome: 'ok' })
  })

  it('a repeated run is a no-op in counts; snapshots: yesterday is upserted, missing days backfilled once, existing days never recomputed', async () => {
    const now = new Date()
    const first = await runHousekeeping({ trigger: 'MANUAL', now })
    expect(stepOf(first, 'snapshots')).toMatchObject({ status: 'ok', count: 8 })
    const rows = await prisma.pilotMetricDay.findMany({ orderBy: { day: 'asc' } })
    const yesterday = addDays(ilDay(now), -1)
    expect(rows.map((r) => r.day.toISOString().slice(0, 10))).toEqual(Array.from({ length: 8 }, (_, i) => addDays(yesterday, i - 7)))
    expect(rows.map((r) => (r.metricsJson as { backfilled: number }).backfilled)).toEqual([1, 1, 1, 1, 1, 1, 1, 0])

    const second = await runHousekeeping({ trigger: 'MANUAL', now: later(now, MIN) })
    if (second.outcome === 'already-running') throw new Error('unexpected')
    expect(second.steps.map((s) => [s.step, s.count])).toEqual([
      ['job-payloads', null],
      ['ai-usage', null],
      ['rate-limits', null],
      ['ops-events', 0],
      ['ops-alerts', 0],
      ['housekeeping-runs', 0],
      ['metric-days', 0],
      ['never-verified', 0],
      ['snapshots', 1], // only yesterday, rewritten with the same values
      ['alerts', null],
    ])
    const again = await prisma.pilotMetricDay.findMany({ orderBy: { day: 'asc' } })
    expect(again.slice(0, 7).map((r) => r.computedAt)).toEqual(rows.slice(0, 7).map((r) => r.computedAt)) // backfilled days untouched
    expect(again.map((r) => r.metricsJson)).toEqual(rows.map((r) => r.metricsJson))

    // A missing day inside the window is backfilled on the next run, once.
    await prisma.$executeRaw`DELETE FROM "PilotMetricDay" WHERE "day" = ${addDays(yesterday, -3)}::date`
    const third = await runHousekeeping({ trigger: 'MANUAL', now: later(now, 2 * MIN) })
    expect(stepOf(third, 'snapshots')).toMatchObject({ count: 2 })
  })
})

describe('the cron route', () => {
  it('answers 401 without the header, with a wrong secret and with the secret unset, and records nothing', async () => {
    for (const [secret, header] of [
      [SECRET, undefined],
      [SECRET, 'Bearer wrong-secret-0123456789'],
      [undefined, `Bearer ${SECRET}`],
      ['', 'Bearer '],
    ] as const) {
      vi.stubEnv('CRON_SECRET', secret as string)
      if (secret === undefined) delete process.env.CRON_SECRET
      const response = await cron(header ? { authorization: header } : {})
      expect(response.status).toBe(401)
      expect(await response.json()).toEqual({ error: 'UNAUTHORIZED' })
      expect(response.headers.get('cache-control')).toBe('private, no-store')
    }
    expect(await prisma.housekeepingRun.count()).toBe(0)
  })

  it('runs with the right secret (200, step summary, MANUAL or CRON trigger) and answers 409 while a run is unfinished', async () => {
    vi.stubEnv('CRON_SECRET', SECRET)
    const response = await cron({ authorization: `Bearer ${SECRET}` })
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    const body = (await response.json()) as { outcome: string; steps: { step: string; status: string; count: number | null }[] }
    expect(body.outcome).toBe('ok')
    expect(body.steps).toHaveLength(10)
    expect(Object.keys(body.steps[0]!).sort()).toEqual(['count', 'status', 'step'])
    expect((await prisma.housekeepingRun.findFirstOrThrow()).trigger).toBe('MANUAL')

    await prisma.housekeepingRun.deleteMany()
    await cron({ authorization: `Bearer ${SECRET}`, 'user-agent': 'vercel-cron/1.0' })
    expect((await prisma.housekeepingRun.findFirstOrThrow()).trigger).toBe('CRON')

    await insertRun({ startedAt: new Date() })
    const busy = await cron({ authorization: `Bearer ${SECRET}` })
    expect(busy.status).toBe(409)
    expect(await busy.json()).toEqual({ outcome: 'already-running' })
  })
})

// ----- standard PostgreSQL only: the required concurrency cases (scripts/required-pg-tests.json) -----

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
function gate() {
  let open!: () => void
  const promise = new Promise<void>((resolve) => (open = resolve))
  return { promise, open }
}

async function unverifiedAccount(daysOld = 15, email = `nv-${randomUUID()}@example.test`) {
  return prisma.user.create({
    data: { id: randomUUID(), name: 'בדיקה', email, emailVerified: false, createdAt: new Date(Date.now() - daysOld * DAY) },
  })
}

describe.skipIf(!REAL_POSTGRES)('ops and housekeeping on standard PostgreSQL', () => {
  it('a verification holding the user row makes the purge skip the account, which stays verified', async () => {
    const user = await unverifiedAccount()
    const locked = gate()
    const release = gate()
    const holder = prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`UPDATE "user" SET "emailVerified" = true WHERE "id" = ${user.id}`
        locked.open()
        await release.promise
      },
      { timeout: 30_000, maxWait: 30_000 },
    )
    holder.catch(() => {})
    await locked.promise
    const purge = purgeNeverVerified({ enabled: true })
    const outcome = await Promise.race([purge, sleep(2_000).then(() => 'still waiting after 2 s' as const)])
    console.log(`[N1] case 1 outcome within 2 s: ${JSON.stringify(outcome)}`)
    release.open()
    await holder
    await purge.catch(() => {})
    expect(outcome).toMatchObject({ mode: 'delete', eligible: 1, deleted: 0, skipped: 1 })
    expect(await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({ emailVerified: true })
  })

  it('the purge holding the user row makes a concurrent verification fail with one 500 and leaves no user and no session', async () => {
    const email = `case2-${randomUUID()}@example.test`
    const signUp = await auth.api.signUpEmail({ body: { email, password: PASSWORD, name: 'בדיקה' } as never, headers: new Headers({ origin: BASE }), asResponse: true })
    expect(signUp.status).toBe(200)
    const user = await prisma.user.update({ where: { email }, data: { createdAt: new Date(Date.now() - 15 * DAY) } })
    const token = await createEmailVerificationToken(process.env.BETTER_AUTH_SECRET!, email, undefined, 3600)
    const link = `${BASE}/api/auth/verify-email?token=${token}&callbackURL=${encodeURIComponent('/verify-email?verified=1')}`

    const locked = gate()
    const release = gate()
    const purge = purgeNeverVerified({
      enabled: true,
      afterLock: async () => {
        locked.open()
        await release.promise
      },
    })
    purge.catch(() => {})
    await locked.promise
    const verification = authGET(new Request(link))
    verification.catch(() => {})
    let waited = false
    for (let i = 0; i < 200 && !waited; i++) {
      const rows = await prisma.$queryRaw<{ n: number }[]>`
        SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'`
      waited = (rows[0]?.n ?? 0) > 0
      if (!waited) await sleep(25)
    }
    release.open()
    const response = await verification
    const result = await purge
    const body = await response.text()
    const setCookie = response.headers.getSetCookie()
    // The observed response, printed for the evidence record (status, body length, cookie names only).
    console.log(`[case 2] waited-on-lock=${waited} status=${response.status} body-length=${body.length} set-cookie=${JSON.stringify(setCookie.map((c) => c.split('=')[0]))}`)
    expect(waited).toBe(true)
    expect(response.status).toBe(500)
    expect(body).toBe('')
    expect(setCookie.some((c) => c.includes('session_token'))).toBe(false)
    expect(await prisma.user.count({ where: { id: user.id } })).toBe(0)
    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0)
    expect(result).toMatchObject({ deleted: 1 })
  })

  it('ten concurrent purges over many eligible accounts delete each account exactly once', async () => {
    for (let i = 0; i < 30; i++) await unverifiedAccount()
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => purgeNeverVerified({ enabled: true })))
    expect(results.filter((r) => r.status === 'rejected')).toEqual([])
    const deleted = results.reduce((sum, r) => sum + (r.status === 'fulfilled' ? r.value.deleted : 0), 0)
    expect(deleted).toBe(30)
    expect(await prisma.user.count({ where: { emailVerified: false } })).toBe(0)
  })

  it('ten concurrent alert evaluations over one threshold crossing open one alert and send one notification', async () => {
    const outbox = freshOutbox()
    vi.stubEnv('ALERT_EMAIL', 'ops-alerts@example.test')
    const now = new Date()
    await insertEvents('SERVER_ERROR', 3, now)
    // SCRATCH N2 (never merged): run without the partial unique index, then recreate it exactly as the migration does.
    await prisma.$executeRawUnsafe('DROP INDEX "OpsAlert_one_open_per_key"')
    try {
      await Promise.all(Array.from({ length: 10 }, () => evaluateAlerts('server-error', { now })))
    } finally {
      await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX "OpsAlert_one_open_per_key" ON "OpsAlert" ("dedupKey") WHERE "resolvedAt" IS NULL')
    }
    const restored = await prisma.$queryRaw<{ indexdef: string }[]>`SELECT indexdef FROM pg_indexes WHERE indexname = 'OpsAlert_one_open_per_key'`
    console.log(`[N2] alerts=${await prisma.opsAlert.count({ where: { rule: 'SERVER_ERRORS' } })} notifications=${alertFiles(outbox).length} index-restored=${JSON.stringify(restored.map((r) => r.indexdef))}`)
    const alerts = await prisma.opsAlert.findMany({ where: { rule: 'SERVER_ERRORS' } })
    expect(alerts).toHaveLength(1)
    expect(alerts[0]).toMatchObject({ resolvedAt: null, notifyAttempts: 1, notifyStatus: 'SENT' })
    expect(alertFiles(outbox)).toHaveLength(1)
  })

  it('five concurrent housekeeping starts run once and refuse the others', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        runHousekeeping({ trigger: 'MANUAL', beforeStep: (step) => (step === 'job-payloads' ? sleep(300) : undefined) }),
      ),
    )
    expect(results.filter((r) => r.outcome === 'ok')).toHaveLength(1)
    expect(results.filter((r) => r.outcome === 'already-running')).toHaveLength(4)
    expect(await prisma.housekeepingRun.count()).toBe(1)
  })
})
