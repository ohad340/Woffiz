import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST as completePOST } from '@/app/api/onboarding/complete/route'
import { POST as draftPOST } from '@/app/api/onboarding/draft/route'
import { onRequestError } from '@/instrumentation'
import { takeCallUnit } from '@/server/ai/quota'
import { prisma } from '@/server/db'
import { sendAuthEmail } from '@/server/email/delivery'
import { AppError } from '@/server/errors'
import { adminRoute, postRoute } from '@/server/http'
import { evaluateAlerts, raiseHousekeepingAlert } from '@/server/ops'
import { aiCallsToday } from '@/server/ops/budget'
import { utcTs } from '@/server/ops/time'
import { z } from 'zod'
import { FULL_ANSWERS, insertJob, resetDatabase, usageCount } from './helpers'
import { jsonPost } from './mail'
import { HOUR, MIN, alertFiles, brokenOutbox, deferredTasks, eventCount, freshOutbox, insertEvents, later, openAlerts, signedInAccount } from './ops-helpers'

// Operational events and alerts (Phase 4, slice 6; docs/DECISIONS.md P4-6). Mail goes to a per-test local outbox directory.

let deferred: ReturnType<typeof deferredTasks>
beforeEach(async () => {
  await resetDatabase()
  deferred = deferredTasks()
})
afterEach(() => {
  deferred.uninstall()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  delete process.env.AI_FAKE_MODE
})

const ALERT_EMAIL = 'ops-alerts@example.test'
const requestContext = { routerKind: 'App Router', routePath: '/x', routeType: 'render', renderSource: 'react-server-components', revalidateReason: undefined } as const
const onRequest = (error: unknown) => onRequestError(error, { path: '/x', method: 'GET', headers: {} }, requestContext as never)

describe('ops events: one row per server-error source, none otherwise', () => {
  it('a postRoute handler that throws a plain Error records one SERVER_ERROR after the response', async () => {
    const owner = await signedInAccount()
    const route = postRoute(z.object({}).strict(), async () => {
      throw new Error('boom')
    })
    const response = await route(jsonPost('/api/x', {}, { cookie: owner.cookie }))
    expect(response.status).toBe(500)
    expect(await eventCount('SERVER_ERROR')).toBe(0) // nothing before the response is finished
    expect(deferred.count()).toBe(1)
    await deferred.drain()
    expect(await eventCount('SERVER_ERROR')).toBe(1)
  })

  it('an adminRoute handler that throws a plain Error records one SERVER_ERROR', async () => {
    const admin = await signedInAccount('ADMIN')
    const response = await adminRoute(jsonPost('/api/admin/x', {}, { cookie: admin.cookie }), async () => {
      throw new Error('boom')
    })
    expect(response.status).toBe(500)
    await deferred.drain()
    expect(await eventCount('SERVER_ERROR')).toBe(1)
  })

  it('onRequestError records one SERVER_ERROR for a plain error and none for the Next.js control-flow digests', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs')
    for (const digest of ['NEXT_REDIRECT;replace;/;307;', 'NEXT_NOT_FOUND', 'NEXT_HTTP_ERROR_FALLBACK;404', 'DYNAMIC_SERVER_USAGE', 'BAILOUT_TO_CLIENT_SIDE_RENDERING']) {
      await onRequest(Object.assign(new Error('control flow'), { digest }))
    }
    expect(await eventCount('SERVER_ERROR')).toBe(0)
    await onRequest(Object.assign(new Error('render failed'), { digest: '1234567' }))
    expect(await eventCount('SERVER_ERROR')).toBe(1)
  })

  it('onRequestError does nothing outside the Node.js runtime', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'edge')
    await onRequest(new Error('x'))
    expect(await eventCount('SERVER_ERROR')).toBe(0)
  })

  it('an AppError and the deleted-account branch record nothing', async () => {
    const owner = await signedInAccount()
    const refusing = postRoute(z.object({}).strict(), async () => {
      throw new AppError('GENERATION_PENDING')
    })
    expect((await refusing(jsonPost('/api/x', {}, { cookie: owner.cookie }))).status).toBe(409)
    expect((await adminRoute(jsonPost('/api/admin/x', {}, { cookie: owner.cookie }), async () => ({}))).status).toBe(404) // AppError NOT_FOUND

    const deleting = postRoute(z.object({}).strict(), async ({ user }) => {
      await prisma.user.delete({ where: { id: user.id } })
      throw new Error('foreign key violation after the deletion')
    })
    expect((await deleting(jsonPost('/api/x', {}, { cookie: owner.cookie }))).status).toBe(401)
    expect(deferred.count()).toBe(0)
    await deferred.drain()
    expect(await eventCount('SERVER_ERROR')).toBe(0)
  })

  it('a delivery failure in sendAuthEmail records one AUTH_EMAIL_FAILED; a policy skip records none', async () => {
    brokenOutbox()
    await sendAuthEmail('verify-email', 'someone@example.test', 'http://localhost:3000/api/auth/verify-email?token=t')
    await deferred.drain()
    expect(await eventCount('AUTH_EMAIL_FAILED')).toBe(1)

    // Resend in the test phase: an address other than TESTER_EMAIL is skipped before any delivery (no network).
    vi.stubEnv('EMAIL_TRANSPORT', '')
    vi.stubEnv('RESEND_API_KEY', 're_test_not_used')
    vi.stubEnv('EMAIL_FROM', 'Woffiz <onboarding@resend.dev>')
    vi.stubEnv('TESTER_EMAIL', 'tester@example.test')
    await sendAuthEmail('verify-email', 'someone-else@example.test', 'http://localhost:3000/api/auth/verify-email?token=t')
    await deferred.drain()
    expect(deferred.count()).toBe(0)
    expect(await eventCount('AUTH_EMAIL_FAILED')).toBe(1)
  })

  it('when the event cannot be recorded, the response is byte-identical and only the fixed line is logged', async () => {
    const owner = await signedInAccount()
    const route = postRoute(z.object({}).strict(), async () => {
      throw new Error('boom')
    })
    const snapshot = async (response: Response) => ({ status: response.status, headers: [...response.headers.entries()], body: await response.text() })
    const normal = await snapshot(await route(jsonPost('/api/x', {}, { cookie: owner.cookie })))
    await deferred.drain()

    const original = prisma.$executeRaw.bind(prisma)
    vi.spyOn(prisma, '$executeRaw').mockImplementation(((query: TemplateStringsArray, ...values: unknown[]) =>
      Array.isArray(query) && query.join('?').includes('INSERT INTO "OpsEvent"')
        ? Promise.reject(new Error('relation "OpsEvent" does not exist'))
        : original(query, ...values)) as never)
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const failing = await snapshot(await route(jsonPost('/api/x', {}, { cookie: owner.cookie })))
    await deferred.drain()
    expect(failing).toEqual(normal)
    expect(await eventCount('SERVER_ERROR')).toBe(1) // only the first request's event
    const lines = errors.mock.calls.map((call) => String(call[0]))
    expect(lines).toEqual(['[api] unexpected error', '[ops] event not recorded: SERVER_ERROR'])
  })
})

describe('alerts: thresholds, deduplication and notification', () => {
  it('three SERVER_ERROR in 60 min open one alert and send one email; two do nothing; a fourth adds no email', async () => {
    const outbox = freshOutbox()
    vi.stubEnv('ALERT_EMAIL', ALERT_EMAIL)
    const now = new Date()
    await insertEvents('SERVER_ERROR', 2, later(now, -59 * MIN))
    await evaluateAlerts('server-error', { now })
    expect(await openAlerts()).toEqual([])
    expect(alertFiles(outbox)).toHaveLength(0)

    await insertEvents('SERVER_ERROR', 1, later(now, -61 * MIN)) // outside the window: still two
    await evaluateAlerts('server-error', { now })
    expect(await openAlerts()).toEqual([])

    await insertEvents('SERVER_ERROR', 1, now)
    await evaluateAlerts('server-error', { now })
    const [alert] = await openAlerts()
    expect(alert).toMatchObject({ rule: 'SERVER_ERRORS', dedupKey: 'server-errors', eventCount: 3, notifyStatus: 'SENT', notifyAttempts: 1 })
    const files = alertFiles(outbox)
    expect(files).toHaveLength(1)
    expect(files[0]).toMatchObject({ to: ALERT_EMAIL, subject: 'Woffiz: התראה תפעולית (server-errors)', url: 'http://localhost:3000/admin/metrics' })

    await insertEvents('SERVER_ERROR', 1, later(now, 1 * MIN))
    await evaluateAlerts('server-error', { now: later(now, 1 * MIN) })
    expect(alertFiles(outbox)).toHaveLength(1)
    expect(await openAlerts()).toMatchObject([{ eventCount: 4, notifyAttempts: 1, lastEventAt: later(now, 1 * MIN) }])

    // Below the threshold later on (the early events left the window): only the last event time moves.
    await insertEvents('SERVER_ERROR', 1, later(now, 30 * MIN))
    await evaluateAlerts('server-error', { now: later(now, 61 * MIN) })
    expect(await openAlerts()).toMatchObject([{ eventCount: 4, lastEventAt: later(now, 30 * MIN) }])
    expect(alertFiles(outbox)).toHaveLength(1)
  })

  it('auth-email opens at two failures in 60 min', async () => {
    freshOutbox()
    vi.stubEnv('ALERT_EMAIL', ALERT_EMAIL)
    const now = new Date()
    await insertEvents('AUTH_EMAIL_FAILED', 1, now)
    await evaluateAlerts('auth-email', { now })
    expect(await openAlerts()).toEqual([])
    await insertEvents('AUTH_EMAIL_FAILED', 1, now)
    await evaluateAlerts('auth-email', { now })
    expect(await openAlerts()).toMatchObject([{ rule: 'AUTH_EMAIL', notifyStatus: 'SENT' }])
  })

  it('reminds once 24 h after the last notification while the alert stays open, not at 23 h 59 min', async () => {
    const outbox = freshOutbox()
    vi.stubEnv('ALERT_EMAIL', ALERT_EMAIL)
    const now = new Date()
    await raiseHousekeepingAlert(1, now) // never resolves by time
    expect(alertFiles(outbox)).toHaveLength(1)
    await evaluateAlerts('server-error', { now: later(now, 24 * HOUR - MIN) })
    expect(alertFiles(outbox)).toHaveLength(1)
    await evaluateAlerts('server-error', { now: later(now, 24 * HOUR) })
    expect(alertFiles(outbox)).toHaveLength(2)
    await evaluateAlerts('server-error', { now: later(now, 24 * HOUR + 30 * MIN) })
    expect(alertFiles(outbox)).toHaveLength(2)
    expect(await openAlerts()).toMatchObject([{ rule: 'HOUSEKEEPING', notifyStatus: 'SENT', notifyAttempts: 1 }])
  })

  it('a windowed alert resolves after 6 h without an event, and resolution sends nothing', async () => {
    const outbox = freshOutbox()
    vi.stubEnv('ALERT_EMAIL', ALERT_EMAIL)
    const now = new Date()
    await insertEvents('SERVER_ERROR', 3, now)
    await evaluateAlerts('server-error', { now })
    await evaluateAlerts('server-error', { now: later(now, 6 * HOUR) })
    expect(await openAlerts()).toHaveLength(1)
    await evaluateAlerts('server-error', { now: later(now, 6 * HOUR + 1000) })
    expect(await openAlerts()).toHaveLength(0)
    expect(alertFiles(outbox)).toHaveLength(1)
    expect(await prisma.opsAlert.count({ where: { resolvedAt: { not: null } } })).toBe(1)
  })

  it('the 11th notification of a UTC day is SUPPRESSED', async () => {
    const outbox = freshOutbox()
    vi.stubEnv('ALERT_EMAIL', ALERT_EMAIL)
    const now = new Date()
    // Ten notifications already sent today (resolved since, so the sweep leaves them alone).
    for (let i = 0; i < 10; i++) {
      await prisma.$executeRaw`
        INSERT INTO "OpsAlert" ("id", "rule", "dedupKey", "openedAt", "lastEventAt", "eventCount", "lastNotifiedAt", "notifyStatus", "notifyAttempts", "resolvedAt")
        VALUES (gen_random_uuid(), 'server-errors', ${`earlier-${i}`}, ${utcTs(now)}, ${utcTs(now)}, 3, ${utcTs(now)}, 'SENT', 1, ${utcTs(now)})`
    }
    await insertEvents('SERVER_ERROR', 3, now)
    await evaluateAlerts('server-error', { now })
    expect(await openAlerts()).toMatchObject([{ notifyStatus: 'SUPPRESSED', notifyAttempts: 0 }])
    expect(alertFiles(outbox)).toHaveLength(0)
  })

  it('a delivery failure gives FAILED, a retry after 5 min, and GAVE_UP after 3 attempts', async () => {
    brokenOutbox()
    vi.stubEnv('ALERT_EMAIL', ALERT_EMAIL)
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const now = new Date()
    await insertEvents('SERVER_ERROR', 3, now)
    await evaluateAlerts('server-error', { now })
    expect(await openAlerts()).toMatchObject([{ notifyStatus: 'FAILED', notifyAttempts: 1 }])
    await evaluateAlerts('server-error', { now: later(now, 4 * MIN) })
    expect(await openAlerts()).toMatchObject([{ notifyStatus: 'FAILED', notifyAttempts: 1 }])
    await evaluateAlerts('server-error', { now: later(now, 5 * MIN) })
    expect(await openAlerts()).toMatchObject([{ notifyStatus: 'FAILED', notifyAttempts: 2 }])
    await evaluateAlerts('server-error', { now: later(now, 10 * MIN) })
    expect(await openAlerts()).toMatchObject([{ notifyStatus: 'GAVE_UP', notifyAttempts: 3 }])
    await evaluateAlerts('server-error', { now: later(now, 30 * MIN) })
    expect(await openAlerts()).toMatchObject([{ notifyStatus: 'GAVE_UP', notifyAttempts: 3 }])
    expect(errors.mock.calls.map((c) => String(c[0]))).toEqual([
      '[ops] alert mail failed: server-errors attempt 1',
      '[ops] alert mail failed: server-errors attempt 2',
      '[ops] alert mail failed: server-errors attempt 3',
    ])
  })

  it('shared sender with another ALERT_EMAIL is SKIPPED (fixed log line); unset ALERT_EMAIL is NOT_CONFIGURED', async () => {
    const now = new Date()
    await insertEvents('SERVER_ERROR', 3, now)
    await evaluateAlerts('server-error', { now }) // ALERT_EMAIL unset
    expect(await openAlerts()).toMatchObject([{ notifyStatus: 'NOT_CONFIGURED', notifyAttempts: 0 }])

    await prisma.opsAlert.deleteMany()
    vi.stubEnv('EMAIL_TRANSPORT', '')
    vi.stubEnv('RESEND_API_KEY', 're_test_not_used')
    vi.stubEnv('EMAIL_FROM', 'Woffiz <onboarding@resend.dev>')
    vi.stubEnv('TESTER_EMAIL', 'tester@example.test')
    vi.stubEnv('ALERT_EMAIL', ALERT_EMAIL)
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    const warnings = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await evaluateAlerts('server-error', { now })
    expect(await openAlerts()).toMatchObject([{ notifyStatus: 'SKIPPED', notifyAttempts: 0 }])
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(warnings.mock.calls.map((c) => String(c[0]))).toEqual(['[ops] alert mail skipped: shared sender delivers only to TESTER_EMAIL'])
  })

  it('budget warning and exhaustion fire once per UTC day from the real ai-calls counter', async () => {
    const outbox = freshOutbox()
    vi.stubEnv('ALERT_EMAIL', ALERT_EMAIL)
    vi.stubEnv('AI_DAILY_CALLS_MAX', '5')
    const now = new Date()
    for (let i = 0; i < 3; i++) expect(await takeCallUnit(5)).toBe(true)
    // The ops reader recomputes quota.ts's private key: it must see the same count as the quota code.
    expect(await aiCallsToday(now.toISOString().slice(0, 10))).toBe(await usageCount('ai-calls', 'all'))
    await evaluateAlerts('generation', { now })
    expect(await openAlerts()).toEqual([])

    expect(await takeCallUnit(5)).toBe(true) // 4 = ceil(0.8 x 5)
    await evaluateAlerts('generation', { now })
    await evaluateAlerts('generation', { now })
    const day = now.toISOString().slice(0, 10)
    expect(await openAlerts()).toMatchObject([{ rule: 'AI_BUDGET_WARNING', dedupKey: `ai-budget-warning:${day}`, eventCount: 4 }])

    expect(await takeCallUnit(5)).toBe(true) // 5 = the maximum
    await evaluateAlerts('generation', { now })
    await evaluateAlerts('generation', { now })
    expect((await openAlerts()).map((a) => a.dedupKey).sort()).toEqual([`ai-budget-exhausted:${day}`, `ai-budget-warning:${day}`])
    expect(alertFiles(outbox).map((f) => f.subject).sort()).toEqual([
      'Woffiz: התראה תפעולית (ai-budget-exhausted)',
      'Woffiz: התראה תפעולית (ai-budget-warning)',
    ])

    // The next UTC day resolves both; nothing is sent for it.
    const tomorrow = new Date(`${day}T00:00:00.000Z`)
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)
    await evaluateAlerts('generation', { now: later(tomorrow, MIN) })
    expect(await openAlerts()).toEqual([])
    expect(alertFiles(outbox)).toHaveLength(2)
  })

  it('a quota-calls failure today opens the exhaustion alert even below the counter maximum', async () => {
    freshOutbox()
    vi.stubEnv('ALERT_EMAIL', ALERT_EMAIL)
    const owner = await signedInAccount()
    const puppy = await prisma.puppy.create({ data: { ownerId: owner.id } })
    const jobId = await insertJob({ puppyId: puppy.id, ownerId: owner.id, status: 'FAILED' })
    await prisma.$executeRaw`UPDATE "GenerationJob" SET "errorCode" = 'quota-calls', "finishedAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') WHERE "id" = ${jobId}::uuid`
    await evaluateAlerts('generation')
    expect(await openAlerts()).toMatchObject([{ rule: 'AI_BUDGET_EXHAUSTED', notifyStatus: 'SENT' }])
  })

  it('G1/G2: three onboarding completions failing in the real route (fake generator in fail mode) open one generation-failures alert and one email with no personal data', async () => {
    const outbox = freshOutbox()
    vi.stubEnv('ALERT_EMAIL', ALERT_EMAIL)
    process.env.AI_FAKE_MODE = 'fail'
    const puppyName = `כלבלב-${randomUUID().slice(0, 8)}`
    const owners = []
    for (let i = 0; i < 3; i++) {
      const owner = await signedInAccount('OWNER', `g1-owner-${i}-${randomUUID()}@example.test`)
      const draft = await draftPOST(jsonPost('/api/onboarding/draft', { step: 4, answers: { ...FULL_ANSWERS, name: puppyName, skills: [...FULL_ANSWERS.skills], difficulties: [...FULL_ANSWERS.difficulties] } }, { cookie: owner.cookie }))
      expect(draft.status).toBe(200)
      owners.push(owner)
    }
    for (const owner of owners) {
      const response = await completePOST(jsonPost('/api/onboarding/complete', {}, { cookie: owner.cookie }))
      expect(response.status).not.toBe(200)
      expect(deferred.count()).toBe(1) // registered before the work, run after the response
      await deferred.drain()
    }
    expect(await prisma.generationJob.count({ where: { status: 'FAILED', errorCode: { startsWith: 'provider ' } } })).toBe(3)
    expect(await openAlerts()).toMatchObject([{ rule: 'GENERATION_FAILURES', eventCount: 3, notifyStatus: 'SENT' }])
    const files = alertFiles(outbox)
    expect(files).toHaveLength(1)
    for (const value of [puppyName, ...owners.flatMap((o) => [o.email, o.id, o.name])]) expect(files[0]!.raw).not.toContain(value)
  })
})
