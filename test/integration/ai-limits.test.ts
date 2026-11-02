import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { aiLimits, DEFAULT_LIMITS } from '@/server/ai/config'
import { takeCallUnit, takeRequestUnit } from '@/server/ai/quota'
import { prisma } from '@/server/db'
import { completeOnboarding, saveOnboardingDraft } from '@/server/onboarding'
import { recordAttempt } from '@/server/progress'
import { adaptCurrentExercise, reviseFuturePlan } from '@/server/revision'
import { FULL_ANSWERS, REAL_POSTGRES, createUser, insertJob, key, onboard, planFor, resetDatabase, usageCount } from './helpers'

beforeEach(resetDatabase)
afterEach(() => {
  delete process.env.AI_FAKE_MODE
  process.env.AI_DAILY_ACCOUNT_MAX = '10000'
  process.env.AI_DAILY_CALLS_MAX = '100000'
})

const rejects = (promise: Promise<unknown>, code: string) => expect(promise).rejects.toMatchObject({ code })

async function draft(userId: string) {
  await saveOnboardingDraft(userId, {
    step: 4,
    answers: { ...FULL_ANSWERS, skills: [...FULL_ANSWERS.skills], difficulties: [...FULL_ANSWERS.difficulties] },
  })
}

async function usage() {
  return prisma.aiUsageDay.findMany({ orderBy: { count: 'asc' } })
}

describe('configured limits', () => {
  it('are 3 generation/adaptation requests per account per UTC day and 100 provider calls for the system', () => {
    expect(DEFAULT_LIMITS).toEqual({ requestsPerAccountPerDay: 3, providerCallsPerDay: 100 })
    expect(aiLimits({})).toEqual({ requestsPerAccountPerDay: 3, providerCallsPerDay: 100 })
    expect(aiLimits({ AI_DAILY_ACCOUNT_MAX: '7', AI_DAILY_CALLS_MAX: '9' })).toEqual({ requestsPerAccountPerDay: 7, providerCallsPerDay: 9 })
    expect(aiLimits({ AI_DAILY_ACCOUNT_MAX: '0', AI_DAILY_CALLS_MAX: 'x' })).toEqual({ requestsPerAccountPerDay: 3, providerCallsPerDay: 100 })
  })
})

describe('daily request limit per account', () => {
  it('a failed request gives its unit back, so failures never use up the daily 3 (the provider calls stay charged)', async () => {
    const user = await createUser()
    await draft(user.id)
    process.env.AI_DAILY_ACCOUNT_MAX = String(DEFAULT_LIMITS.requestsPerAccountPerDay)
    process.env.AI_FAKE_MODE = 'fail'

    for (let i = 0; i < 4; i++) await rejects(completeOnboarding(user.id), 'GENERATION_FAILED') // more than 3, none refused
    expect(await usageCount('ai-request', user.id)).toBe(0)
    expect(await usageCount('ai-calls', 'all')).toBe(8) // 4 requests x 2 attempts, never refunded

    const jobs = await prisma.generationJob.findMany({ where: { ownerId: user.id } })
    expect(jobs).toHaveLength(4)
    for (const job of jobs) expect(job).toMatchObject({ status: 'FAILED', attempts: 2, errorCode: 'provider status 503' })
    expect(jobs.every((j) => j.quotaChargedDay !== null && j.quotaRefundedAt !== null)).toBe(true) // each refunded once
    expect(await prisma.plan.count()).toBe(0) // nothing was saved or changed
  })

  it('counts initial plans, adaptations and revisions in the same daily total', async () => {
    const user = await createUser()
    await onboard(user.id) // request 1
    const plan = await planFor(user.id)
    await recordAttempt(user.id, { levelId: plan.levels[0]!.id, outcome: 'STRUGGLING', idempotencyKey: key() })
    await recordAttempt(user.id, { levelId: plan.levels[0]!.id, outcome: 'STRUGGLING', idempotencyKey: key() })
    process.env.AI_DAILY_ACCOUNT_MAX = '3'

    const adapted = await adaptCurrentExercise(user.id, { planRevision: plan.revision }, key()) // request 2
    await reviseFuturePlan(user.id, { planRevision: adapted.planRevision }, key()) // request 3
    const after = await prisma.plan.findFirstOrThrow({ where: { puppy: { ownerId: user.id } } })
    await rejects(reviseFuturePlan(user.id, { planRevision: after.revision }, key()), 'AI_QUOTA_EXCEEDED') // 4th

    // The refused request changed nothing.
    expect((await prisma.plan.findFirstOrThrow({ where: { puppy: { ownerId: user.id } } })).revision).toBe(after.revision)
  })

  it('does not count a repeated request that is served from the stored result', async () => {
    const user = await createUser()
    await onboard(user.id) // one request unit and one provider call
    await completeOnboarding(user.id)
    await completeOnboarding(user.id)
    expect((await usage()).map((u) => u.count)).toEqual([1, 1])
  })

  it.skipIf(!REAL_POSTGRES)('is atomic under concurrency: 25 simultaneous requests are granted exactly 3 units', async () => {
    const results = await Promise.all(Array.from({ length: 25 }, () => takeRequestUnit('concurrent-user', 3)))
    expect(results.filter(Boolean)).toHaveLength(3)
    expect((await usage())[0]?.count).toBe(3) // refused attempts never raise the stored count
  })

  it.skipIf(!REAL_POSTGRES)('the provider call budget is atomic too', async () => {
    const results = await Promise.all(Array.from({ length: 40 }, () => takeCallUnit(7)))
    expect(results.filter(Boolean)).toHaveLength(7)
  })

  it('shares the counter across fresh module instances (it lives in PostgreSQL, not in memory)', async () => {
    expect(await takeRequestUnit('another-user', 2)).toBe(true)
    expect(await takeRequestUnit('another-user', 2)).toBe(true)
    expect(await takeRequestUnit('another-user', 2)).toBe(false)
    expect(await takeRequestUnit('third-user', 2)).toBe(true)
    expect((await usage()).map((u) => u.count).sort()).toEqual([1, 2])
  })
})

describe('system-wide provider call budget (retries counted separately)', () => {
  it('takes one unit per call including the retry, and stops before calling when the budget is gone', async () => {
    const user = await createUser()
    await draft(user.id)
    process.env.AI_FAKE_MODE = 'fail'
    process.env.AI_DAILY_CALLS_MAX = '2'

    await rejects(completeOnboarding(user.id), 'GENERATION_FAILED') // attempt + retry = 2 calls
    const [first] = await prisma.generationJob.findMany({ where: { puppy: { ownerId: user.id } } })
    expect(first?.attempts).toBe(2)

    await rejects(completeOnboarding(user.id), 'AI_QUOTA_EXCEEDED') // budget gone: not even the first call is made
    const all = await prisma.generationJob.findMany({ where: { puppy: { ownerId: user.id } }, orderBy: { createdAt: 'asc' } })
    expect(all.map((j) => `${j.status}:${j.errorCode}:${j.attempts}`)).toEqual(['FAILED:provider status 503:2', 'FAILED:quota-calls:0'])
  })

  it('gives the account its request unit back when the request never reached the model', async () => {
    const user = await createUser()
    await draft(user.id)
    process.env.AI_FAKE_MODE = 'fail'
    process.env.AI_DAILY_CALLS_MAX = '2'
    await rejects(completeOnboarding(user.id), 'GENERATION_FAILED') // request 1 (2 calls)
    await rejects(completeOnboarding(user.id), 'AI_QUOTA_EXCEEDED') // refused, refunded

    const requestCounters = await usage()
    // Both requests failed without a result, so the account has nothing counted; the system keeps the 2 calls it made.
    expect(requestCounters.map((u) => u.count)).toEqual([2])
  })

  it('stops a retry when only the first call fits in the budget, and keeps saved plans', async () => {
    const user = await createUser()
    await onboard(user.id)
    const plan = await planFor(user.id)
    const levelsBefore = plan.levels.map((l) => l.id)
    await prisma.aiUsageDay.deleteMany()
    process.env.AI_FAKE_MODE = 'fail'
    process.env.AI_DAILY_CALLS_MAX = '1'

    await rejects(reviseFuturePlan(user.id, { planRevision: plan.revision }, key()), 'AI_QUOTA_EXCEEDED') // 1st call made, retry refused
    const [job] = await prisma.generationJob.findMany({ where: { kind: 'REVISE_FUTURE' } })
    expect(job).toMatchObject({ status: 'FAILED', errorCode: 'quota-calls', attempts: 1 })
    const after = await planFor(user.id)
    expect(after.levels.map((l) => l.id)).toEqual(levelsBefore)
    expect(after.revision).toBe(plan.revision)
  })
})

describe('only one active generation per puppy', () => {
  it('blocks a second generation of any kind while one is pending', async () => {
    const user = await createUser()
    await onboard(user.id)
    const plan = await planFor(user.id)
    const puppy = await prisma.puppy.findUniqueOrThrow({ where: { ownerId: user.id } })
    await insertJob({ puppyId: puppy.id, ownerId: user.id, kind: 'ADAPT_CURRENT', expectedRevision: plan.revision })
    const usedBefore = (await usage()).map((u) => u.count)
    await rejects(reviseFuturePlan(user.id, { planRevision: plan.revision }, key()), 'GENERATION_PENDING')
    await expect(
      insertJob({ puppyId: puppy.id, ownerId: user.id, kind: 'REVISE_FUTURE', expectedRevision: plan.revision }),
    ).rejects.toThrow() // the partial unique index itself refuses a second PENDING row
    // A blocked request does not consume the daily limit.
    expect((await usage()).map((u) => u.count)).toEqual(usedBefore)
  })
})

describe('repeated requests reuse the stored result', () => {
  async function struggling() {
    const user = await createUser()
    await onboard(user.id)
    const plan = await planFor(user.id)
    const levelId = plan.levels[0]!.id
    await recordAttempt(user.id, { levelId, outcome: 'STRUGGLING', idempotencyKey: key() })
    await recordAttempt(user.id, { levelId, outcome: 'STRUGGLING', idempotencyKey: key() })
    return { user, plan, levelId }
  }

  it('an adaptation repeated with the same key returns the same result: no new job, version, call or quota', async () => {
    const { user, plan, levelId } = await struggling()
    const idem = key()
    const first = await adaptCurrentExercise(user.id, { planRevision: plan.revision }, idem)
    const requestsAfterFirst = (await usage()).map((u) => u.count)

    const again = await adaptCurrentExercise(user.id, { planRevision: plan.revision }, idem) // plan.revision is stale by now
    expect(again).toEqual(first)
    expect(await prisma.generationJob.count({ where: { kind: 'ADAPT_CURRENT' } })).toBe(1)
    expect(await prisma.exerciseVersion.count({ where: { levelId } })).toBe(2)
    expect((await usage()).map((u) => u.count)).toEqual(requestsAfterFirst)
  })

  it('a revision repeated with the same key returns the same result', async () => {
    const user = await createUser()
    await onboard(user.id)
    const plan = await planFor(user.id)
    const idem = key()
    const first = await reviseFuturePlan(user.id, { planRevision: plan.revision }, idem)
    expect(await reviseFuturePlan(user.id, { planRevision: plan.revision }, idem)).toEqual(first)
    expect(await prisma.generationJob.count({ where: { kind: 'REVISE_FUTURE' } })).toBe(1)
  })

  it('rejects the same key for a different request, and treats a new key as a new request', async () => {
    const { user, plan } = await struggling()
    const idem = key()
    const first = await adaptCurrentExercise(user.id, { planRevision: plan.revision }, idem)
    await rejects(adaptCurrentExercise(user.id, { planRevision: plan.revision + 5 }, idem), 'IDEMPOTENCY_MISMATCH')
    // A different key with the now-stale revision is a new request and is refused as stale.
    await rejects(adaptCurrentExercise(user.id, { planRevision: plan.revision }, key()), 'STALE_PLAN')
    expect(first.exerciseVersion).toBe(2)
  })

  it('a failed generation stores no result, so the same key may be retried', async () => {
    const { user, plan } = await struggling()
    const idem = key()
    process.env.AI_FAKE_MODE = 'fail'
    await rejects(adaptCurrentExercise(user.id, { planRevision: plan.revision }, idem), 'GENERATION_FAILED')
    delete process.env.AI_FAKE_MODE
    const result = await adaptCurrentExercise(user.id, { planRevision: plan.revision }, idem)
    expect(result.exerciseVersion).toBe(2)
  })
})
