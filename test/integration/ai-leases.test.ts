import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MAX_TIMEOUT_MS, operationPlan, ROUTE_MAX_DURATION_MS } from '@/server/ai/config'
import { fenceJob, finishJob, refundJobUnitOnce, settleWithoutResult, startJob } from '@/server/ai/jobs'
import { takeRequestUnit } from '@/server/ai/quota'
import { prisma } from '@/server/db'
import { recordAttempt } from '@/server/progress'
import { adaptCurrentExercise, reviseFuturePlan } from '@/server/revision'
import { REAL_POSTGRES, createUser, expireLease, insertJob, key, onboard, planFor, puppyOf, resetDatabase, usageCount } from './helpers'

beforeEach(resetDatabase)
afterEach(() => {
  delete process.env.AI_FAKE_MODE
  process.env.AI_TIMEOUT_MS = ''
  process.env.AI_DAILY_ACCOUNT_MAX = '10000'
  process.env.AI_DAILY_CALLS_MAX = '100000'
})

const rejects = (promise: Promise<unknown>, code: string) => expect(promise).rejects.toMatchObject({ code })
const today = () => new Date().toISOString().slice(0, 10)
const dayOffset = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)

async function waitFor(condition: () => Promise<boolean>, what: string) {
  for (let i = 0; i < 100; i++) {
    if (await condition()) return
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`timed out waiting for ${what}`)
}

async function owner() {
  const user = await createUser()
  await onboard(user.id)
  return { user, plan: await planFor(user.id), puppy: await puppyOf(user.id) }
}

async function strugglingOwner() {
  const ctx = await owner()
  const levelId = ctx.plan.levels[0]!.id
  await recordAttempt(ctx.user.id, { levelId, outcome: 'STRUGGLING', idempotencyKey: key() })
  await recordAttempt(ctx.user.id, { levelId, outcome: 'STRUGGLING', idempotencyKey: key() })
  return { ...ctx, levelId }
}

type Ctx = Awaited<ReturnType<typeof owner>>
const start = (ctx: Ctx, idempotencyKey: string, kind: 'REVISE_FUTURE' | 'ADAPT_CURRENT' = 'REVISE_FUTURE') =>
  startJob({ kind, puppyId: ctx.puppy.id, userId: ctx.user.id, expectedRevision: ctx.plan.revision, idempotencyKey })

describe('operation timing', () => {
  it('keeps the whole operation below the route duration, and the lease longer than one attempt', () => {
    for (const timeout of [1_000, 45_000, MAX_TIMEOUT_MS]) {
      const plan = operationPlan(timeout)
      expect(plan.deadlineMs).toBe(2 * timeout + plan.retryDelayMs + 30_000)
      expect(plan.deadlineMs).toBeLessThan(ROUTE_MAX_DURATION_MS)
      expect(plan.leaseMs).toBeGreaterThan(timeout)
    }
    for (const route of ['onboarding/complete', 'plan/adapt', 'plan/revise']) {
      expect(readFileSync(`src/app/api/${route}/route.ts`, 'utf8')).toContain(`export const maxDuration = ${ROUTE_MAX_DURATION_MS / 1000}`)
    }
  })

  it('bounds the retry: two slow attempts stop at the attempt timeout, with a delay, and stay inside the deadline', async () => {
    const { user, plan } = await owner()
    process.env.AI_FAKE_MODE = 'slow'
    process.env.AI_TIMEOUT_MS = '1000'
    const started = Date.now()
    await rejects(reviseFuturePlan(user.id, { planRevision: plan.revision }, key()), 'GENERATION_FAILED')
    const elapsed = Date.now() - started

    const job = await prisma.generationJob.findFirstOrThrow({ where: { ownerId: user.id, kind: 'REVISE_FUTURE' } })
    expect(job).toMatchObject({ status: 'FAILED', attempts: 2, errorCode: 'provider timeout' })
    expect(elapsed).toBeGreaterThanOrEqual(1_900) // two attempt timeouts and the delay...
    expect(elapsed).toBeLessThan(operationPlan(1_000).deadlineMs) // ...and never beyond the operation deadline
    expect(await usageCount('ai-calls', 'all')).toBe(3) // onboarding (1) + two attempts: timeouts stay charged
  })
})

describe('a job is active while its lease is live', () => {
  it('answers pending to a repeated request without a provider call or a quota charge', async () => {
    const ctx = await owner()
    const idem = key()
    const job = await start(ctx, idem) // charges the account's unit once
    const requests = await usageCount('ai-request', ctx.user.id)
    const calls = await usageCount('ai-calls', 'all')

    for (let i = 0; i < 3; i++) await rejects(reviseFuturePlan(ctx.user.id, { planRevision: ctx.plan.revision }, idem), 'GENERATION_PENDING')
    await rejects(reviseFuturePlan(ctx.user.id, { planRevision: ctx.plan.revision }, key()), 'GENERATION_PENDING') // another key too

    expect(await usageCount('ai-request', ctx.user.id)).toBe(requests)
    expect(await usageCount('ai-calls', 'all')).toBe(calls)
    const row = await prisma.generationJob.findUniqueOrThrow({ where: { id: job.jobId } })
    expect(row).toMatchObject({ status: 'PENDING', generation: 1, attempts: 0 })
  })

  it('a completed job returns its saved result instead of running again', async () => {
    const { user, plan, levelId } = await strugglingOwner()
    const idem = key()
    const first = await adaptCurrentExercise(user.id, { planRevision: plan.revision }, idem)
    const requests = await usageCount('ai-request', user.id)
    expect(await adaptCurrentExercise(user.id, { planRevision: plan.revision }, idem)).toEqual(first)
    expect(await usageCount('ai-request', user.id)).toBe(requests)
    expect(await prisma.exerciseVersion.count({ where: { levelId } })).toBe(2)
  })
})

describe('a worker that lost ownership never commits', () => {
  it('fencing: after a reclaim the old generation can neither commit, finish nor refund; the new one can', async () => {
    const ctx = await owner()
    const idem = key()
    const a = await start(ctx, idem)
    expect(a).toMatchObject({ generation: 1, resumed: false })
    const requests = await usageCount('ai-request', ctx.user.id)

    await expireLease(a.jobId)
    await rejects(prisma.$transaction((tx) => fenceJob(tx, a)), 'GENERATION_PENDING') // an expired lease cannot commit even before any reclaim

    const b = await start(ctx, idem) // the same request takes the job over
    expect(b).toMatchObject({ jobId: a.jobId, generation: 2, resumed: true })
    expect(await usageCount('ai-request', ctx.user.id)).toBe(requests) // a takeover charges nothing

    await rejects(prisma.$transaction((tx) => fenceJob(tx, a)), 'GENERATION_PENDING')
    expect(await finishJob(a, 'SUCCEEDED')).toBe(false)
    expect(await settleWithoutResult(a, 'FAILED', { errorCode: 'late' })).toBe(false)
    expect(await usageCount('ai-request', ctx.user.id)).toBe(requests) // the late worker refunded nothing
    expect(await prisma.generationJob.findUniqueOrThrow({ where: { id: a.jobId } })).toMatchObject({ status: 'PENDING', generation: 2 })

    await prisma.$transaction((tx) => fenceJob(tx, b))
    expect(await finishJob(b, 'SUCCEEDED')).toBe(true)
    expect(await prisma.generationJob.findUniqueOrThrow({ where: { id: a.jobId } })).toMatchObject({ status: 'SUCCEEDED', generation: 2 })
  })

  it('end to end: a slow worker that wakes up after another worker finished the request commits nothing', async () => {
    const { user, plan, levelId } = await strugglingOwner()
    const idem = key()

    process.env.AI_FAKE_MODE = 'slow' // worker A is inside its (slow) provider call
    const late = adaptCurrentExercise(user.id, { planRevision: plan.revision }, idem).then(
      () => 'committed',
      (error: { code?: string }) => error.code,
    )
    await waitFor(async () => (await prisma.generationJob.count({ where: { ownerId: user.id, kind: 'ADAPT_CURRENT', attempts: 1 } })) === 1, 'worker A to call the provider')
    const job = await prisma.generationJob.findFirstOrThrow({ where: { ownerId: user.id, kind: 'ADAPT_CURRENT' } })
    await expireLease(job.id) // A looks dead

    delete process.env.AI_FAKE_MODE
    const done = await adaptCurrentExercise(user.id, { planRevision: plan.revision }, idem) // worker B reclaims and finishes
    expect(done.exerciseVersion).toBe(2)

    expect(await late).toBe('GENERATION_PENDING') // A woke up, lost ownership, committed nothing
    expect(await prisma.exerciseVersion.count({ where: { levelId } })).toBe(2)
    const row = await prisma.generationJob.findUniqueOrThrow({ where: { id: job.id } })
    expect(row).toMatchObject({ status: 'SUCCEEDED', generation: 2, attempts: 2 })
    expect(await adaptCurrentExercise(user.id, { planRevision: plan.revision }, idem)).toEqual(done) // the saved result is B's
  })

  it('retry after a lost response: while the request still runs it answers pending, afterwards the stored result', async () => {
    const { user, plan } = await strugglingOwner()
    const idem = key()
    process.env.AI_FAKE_MODE = 'slow'
    const first = adaptCurrentExercise(user.id, { planRevision: plan.revision }, idem)
    await waitFor(async () => (await prisma.generationJob.count({ where: { ownerId: user.id, kind: 'ADAPT_CURRENT', attempts: 1 } })) === 1, 'the provider call')
    delete process.env.AI_FAKE_MODE

    const requests = await usageCount('ai-request', user.id)
    const calls = await usageCount('ai-calls', 'all')
    await rejects(adaptCurrentExercise(user.id, { planRevision: plan.revision }, idem), 'GENERATION_PENDING') // the client retried; no second call
    expect(await usageCount('ai-calls', 'all')).toBe(calls)
    expect(await usageCount('ai-request', user.id)).toBe(requests)

    const result = await first // the original response arrives at the server but the client never saw it...
    const again = await adaptCurrentExercise(user.id, { planRevision: plan.revision }, idem) // ...so it asks again
    expect(again).toEqual(result)
    expect(await prisma.generationJob.count({ where: { ownerId: user.id, kind: 'ADAPT_CURRENT' } })).toBe(1)
  }, 30_000)
})

describe('reclaiming', () => {
  it('only a job with attempts left is resumed; the two-attempt maximum holds across workers', async () => {
    const ctx = await owner()
    await takeRequestUnit(ctx.user.id, 10, today())
    const spent = await insertJob({ puppyId: ctx.puppy.id, ownerId: ctx.user.id, kind: 'REVISE_FUTURE', key: 'k', attempts: 2, leaseSeconds: -5, chargedDay: today() })
    const requests = await usageCount('ai-request', ctx.user.id)

    const fresh = await start(ctx, 'k')
    expect(fresh.resumed).toBe(false) // both attempts were used: the old job is closed, not resumed
    expect(await prisma.generationJob.findUniqueOrThrow({ where: { id: spent } })).toMatchObject({ status: 'FAILED', errorCode: 'lease-expired' })
    expect(await usageCount('ai-request', ctx.user.id)).toBe(requests) // its unit went back once, the new request took one
  })

  it('a resumed job gets exactly the attempts it has left (one), not a fresh pair', async () => {
    const ctx = await owner()
    await takeRequestUnit(ctx.user.id, 10, today())
    const half = await insertJob({ puppyId: ctx.puppy.id, ownerId: ctx.user.id, kind: 'REVISE_FUTURE', key: 'half', attempts: 1, leaseSeconds: -5, chargedDay: today(), expectedRevision: ctx.plan.revision })
    const callsBefore = await usageCount('ai-calls', 'all')

    process.env.AI_FAKE_MODE = 'fail'
    await rejects(reviseFuturePlan(ctx.user.id, { planRevision: ctx.plan.revision }, 'half'), 'GENERATION_FAILED')
    const row = await prisma.generationJob.findUniqueOrThrow({ where: { id: half } })
    expect(row).toMatchObject({ status: 'FAILED', generation: 2, attempts: 2 }) // 1 earlier + 1 now, never 3
    expect(await usageCount('ai-calls', 'all')).toBe(callsBefore + 1)
    expect(row.quotaRefundedAt).not.toBeNull()
  })

  it.skipIf(!REAL_POSTGRES)('race: of 10 simultaneous retries of an expired job exactly one takes it over', async () => {
    const ctx = await owner()
    const a = await start(ctx, 'race')
    await expireLease(a.jobId)
    const requests = await usageCount('ai-request', ctx.user.id)

    const results = await Promise.allSettled(Array.from({ length: 10 }, () => start(ctx, 'race')))
    const won = results.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof start>>> => r.status === 'fulfilled')
    expect(won).toHaveLength(1)
    expect(won[0]!.value).toMatchObject({ jobId: a.jobId, generation: 2, resumed: true })
    for (const r of results.filter((x) => x.status === 'rejected')) expect((r as PromiseRejectedResult).reason).toMatchObject({ code: 'GENERATION_PENDING' })
    expect(await prisma.generationJob.findUniqueOrThrow({ where: { id: a.jobId } })).toMatchObject({ generation: 2 })
    expect(await usageCount('ai-request', ctx.user.id)).toBe(requests) // nobody was charged again
  })

  it.skipIf(!REAL_POSTGRES)('race: of 10 simultaneous new requests over an expired job, one job is started and the old unit is refunded once', async () => {
    const ctx = await owner()
    const old = await start(ctx, 'first')
    await expireLease(old.jobId)
    const requests = await usageCount('ai-request', ctx.user.id)

    const results = await Promise.allSettled(Array.from({ length: 10 }, () => start(ctx, 'second')))
    const won = results.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof start>>> => r.status === 'fulfilled')
    expect(won).toHaveLength(1)
    expect(won[0]!.value).toMatchObject({ resumed: false, generation: 1 })
    expect(won[0]!.value.jobId).not.toBe(old.jobId)
    for (const r of results.filter((x) => x.status === 'rejected')) expect((r as PromiseRejectedResult).reason).toMatchObject({ code: 'GENERATION_PENDING' })

    const closed = await prisma.generationJob.findUniqueOrThrow({ where: { id: old.jobId } })
    expect(closed).toMatchObject({ status: 'FAILED', errorCode: 'lease-expired' })
    expect(closed.quotaRefundedAt).not.toBeNull()
    expect(await usageCount('ai-request', ctx.user.id)).toBe(requests) // refund of the old unit (-1) + the new request (+1)
    expect(await prisma.generationJob.count({ where: { ownerId: user(ctx), kind: 'REVISE_FUTURE' } })).toBe(2)
  })
})

const user = (ctx: Ctx) => ctx.user.id

describe('the account unit is refunded at most once', () => {
  async function chargedFailedJob(ctx: Ctx, units: number, chargedDay = today()) {
    for (let i = 0; i < units; i++) await takeRequestUnit(ctx.user.id, 100, chargedDay)
    return insertJob({ puppyId: ctx.puppy.id, ownerId: ctx.user.id, status: 'FAILED', chargedDay, leaseSeconds: -5 })
  }

  it('refunds once and ignores repeats, including a late worker closing the job again', async () => {
    const ctx = await owner()
    const before = await usageCount('ai-request', ctx.user.id)
    const failed = await chargedFailedJob(ctx, 3)
    expect(await usageCount('ai-request', ctx.user.id)).toBe(before + 3)

    expect(await refundJobUnitOnce(failed)).toBe(true)
    expect(await refundJobUnitOnce(failed)).toBe(false)
    expect(await settleWithoutResult({ jobId: failed, generation: 1 }, 'FAILED')).toBe(false)
    expect(await usageCount('ai-request', ctx.user.id)).toBe(before + 2)
  })

  it('never refunds a job that is still active, that succeeded, or that was never charged', async () => {
    const ctx = await owner()
    await takeRequestUnit(ctx.user.id, 100, today())
    const before = await usageCount('ai-request', ctx.user.id)
    const pending = await insertJob({ puppyId: ctx.puppy.id, ownerId: ctx.user.id, status: 'PENDING', chargedDay: today(), key: 'p' })
    await prisma.generationJob.update({ where: { id: pending }, data: { status: 'SUCCEEDED' } })
    const uncharged = await insertJob({ puppyId: ctx.puppy.id, ownerId: ctx.user.id, status: 'FAILED', chargedDay: null, key: 'u' })
    expect(await refundJobUnitOnce(pending)).toBe(false)
    expect(await refundJobUnitOnce(uncharged)).toBe(false)
    expect(await usageCount('ai-request', ctx.user.id)).toBe(before)
  })

  it('refunds on the day it was charged, not today (a job that crossed midnight)', async () => {
    const ctx = await owner()
    const yesterday = dayOffset(-1)
    const failed = await chargedFailedJob(ctx, 2, yesterday)
    const todayBefore = await usageCount('ai-request', ctx.user.id)

    expect(await refundJobUnitOnce(failed)).toBe(true)
    expect(await usageCount('ai-request', ctx.user.id, yesterday)).toBe(1)
    expect(await usageCount('ai-request', ctx.user.id)).toBe(todayBefore)
  })

  it('keeps the provider-call units of the global budget after a refund', async () => {
    const ctx = await owner()
    process.env.AI_FAKE_MODE = 'fail'
    const callsBefore = await usageCount('ai-calls', 'all')
    await rejects(reviseFuturePlan(ctx.user.id, { planRevision: ctx.plan.revision }, key()), 'GENERATION_FAILED')
    expect(await usageCount('ai-calls', 'all')).toBe(callsBefore + 2) // both attempts stay charged
    expect(await usageCount('ai-request', ctx.user.id)).toBe(1) // the onboarding request only: the failed one went back
  })

  it.skipIf(!REAL_POSTGRES)('is atomic: 12 simultaneous refund attempts of one job lower the counter by exactly one', async () => {
    const ctx = await owner()
    const before = await usageCount('ai-request', ctx.user.id)
    const failed = await chargedFailedJob(ctx, 3)

    const results = await Promise.all(Array.from({ length: 12 }, () => refundJobUnitOnce(failed)))
    expect(results.filter(Boolean)).toHaveLength(1)
    expect(await usageCount('ai-request', ctx.user.id)).toBe(before + 2)
  })

  it.skipIf(!REAL_POSTGRES)('is atomic when owners race: a reclaim closing a job and the job closing itself refund once', async () => {
    const ctx = await owner()
    const a = await start(ctx, 'dup')
    const requests = await usageCount('ai-request', ctx.user.id)
    await expireLease(a.jobId)

    // The "dead" worker wakes up and fails at the same moment a new request reclaims and closes its job.
    const [late, fresh] = await Promise.allSettled([settleWithoutResult(a, 'FAILED', { errorCode: 'late' }), start(ctx, 'another')])
    expect(fresh.status).toBe('fulfilled')
    const closed = await prisma.generationJob.findUniqueOrThrow({ where: { id: a.jobId } })
    expect(closed.quotaRefundedAt).not.toBeNull()
    // Old unit refunded exactly once (-1) and the new request charged once (+1), whoever closed the old job.
    expect(await usageCount('ai-request', ctx.user.id)).toBe(requests)
    expect(late.status).toBe('fulfilled')
  })
})
