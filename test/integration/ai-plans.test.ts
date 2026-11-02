import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { completeOnboarding, saveOnboardingDraft } from '@/server/onboarding'
import { confirmMastery, recordAttempt } from '@/server/progress'
import { adaptCurrentExercise, reviseFuturePlan } from '@/server/revision'
import { FULL_ANSWERS, createUser, expireLease, insertJob, key, onboard, planFor, puppyOf, resetDatabase } from './helpers'

beforeEach(resetDatabase)
afterEach(() => {
  delete process.env.AI_FAKE_MODE
  process.env.AI_PROVIDER = 'fake'
  process.env.AI_DAILY_ACCOUNT_MAX = '10000'
})

const rejects = (promise: Promise<unknown>, code: string) => expect(promise).rejects.toMatchObject({ code })

async function jobs(userId: string) {
  return prisma.generationJob.findMany({ where: { puppy: { ownerId: userId } }, orderBy: { createdAt: 'asc' } })
}

async function draft(userId: string) {
  await saveOnboardingDraft(userId, {
    step: 4,
    answers: { ...FULL_ANSWERS, skills: [...FULL_ANSWERS.skills], difficulties: [...FULL_ANSWERS.difficulties] },
  })
}

async function master(userId: string, levelId: string, planRevision: number) {
  const attempt = await recordAttempt(userId, { levelId, outcome: 'INDEPENDENT', idempotencyKey: key() })
  return confirmMastery(userId, {
    levelId,
    attemptId: attempt.attemptId,
    criterionVersion: attempt.criterionVersion,
    planRevision,
    idempotencyKey: key(),
  })
}

describe('initial plan generation', () => {
  it('records a succeeded job and stores stable, validated levels', async () => {
    const user = await createUser()
    await onboard(user.id)
    const plan = await planFor(user.id)
    expect(plan.source).toBe('fake')
    expect(plan.levels.length).toBeGreaterThanOrEqual(12)
    expect(plan.levels.every((level) => level.stableKey)).toBe(true)
    const [job] = await jobs(user.id)
    expect(job).toMatchObject({ kind: 'INITIAL_PLAN', status: 'SUCCEEDED', model: 'fake', attempts: 1 })
    expect(job?.promptVersion).toBeTruthy()
    expect(job?.policyVersion).toBeTruthy()
  })

  it('an outage leaves the owner not onboarded with answers kept, and a later retry works', async () => {
    const user = await createUser()
    await draft(user.id)
    process.env.AI_FAKE_MODE = 'fail'
    await rejects(completeOnboarding(user.id), 'GENERATION_FAILED')

    const puppy = await prisma.puppy.findUniqueOrThrow({ where: { ownerId: user.id } })
    expect(puppy.onboardedAt).toBeNull()
    expect(puppy.name).toBe(FULL_ANSWERS.name)
    expect(await prisma.plan.count({ where: { puppyId: puppy.id } })).toBe(0)
    const [failed] = await jobs(user.id)
    expect(failed).toMatchObject({ status: 'FAILED', attempts: 2 }) // one automatic retry

    delete process.env.AI_FAKE_MODE
    const result = await completeOnboarding(user.id)
    expect(result.created).toBe(true)
  })

  it('rejects an invalid candidate after one retry, keeps it for review and creates nothing', async () => {
    const user = await createUser()
    await draft(user.id)
    process.env.AI_FAKE_MODE = 'invalid'
    await rejects(completeOnboarding(user.id), 'GENERATION_FAILED')
    const [job] = await jobs(user.id)
    expect(job).toMatchObject({ status: 'REJECTED', attempts: 2, errorCode: 'rejected' })
    expect(job?.payloadJson).not.toBeNull()
    expect(await prisma.plan.count()).toBe(0)
  })

  it('reports the service as unavailable (no fixture fallback) when no provider is configured', async () => {
    const user = await createUser()
    await draft(user.id)
    process.env.AI_PROVIDER = 'none'
    await rejects(completeOnboarding(user.id), 'AI_UNAVAILABLE')
    expect(await jobs(user.id)).toHaveLength(0)
    expect(await prisma.plan.count()).toBe(0)
  })

  it('stops at the daily limit without calling the provider again', async () => {
    const user = await createUser()
    await draft(user.id)
    process.env.AI_DAILY_ACCOUNT_MAX = '1'
    await completeOnboarding(user.id) // the one allowed request succeeds
    const plan = await planFor(user.id)
    await rejects(reviseFuturePlan(user.id, { planRevision: plan.revision }, key()), 'AI_QUOTA_EXCEEDED')
    const all = await jobs(user.id)
    expect(all.map((job) => job.errorCode)).toEqual([null, 'quota-account'])
    expect(all[1]?.attempts).toBe(0) // the refused request never reached the model
  })

  it('allows one pending generation per puppy and frees an abandoned one', async () => {
    const user = await createUser()
    await draft(user.id)
    const puppy = await puppyOf(user.id)
    const pending = await insertJob({ puppyId: puppy.id, ownerId: user.id, expectedRevision: puppy.revision })
    await rejects(completeOnboarding(user.id), 'GENERATION_PENDING')

    await expireLease(pending) // its worker is gone: the lease ran out
    expect((await completeOnboarding(user.id)).created).toBe(true)
    const stale = await prisma.generationJob.findUniqueOrThrow({ where: { id: pending } })
    expect(stale).toMatchObject({ status: 'FAILED', errorCode: 'lease-expired' })
  })

  it('is idempotent: a repeated call returns the same plan and runs no second generation', async () => {
    const user = await createUser()
    const first = await onboard(user.id)
    const again = await completeOnboarding(user.id)
    expect(again).toMatchObject({ planId: first.planId, created: false })
    expect(await jobs(user.id)).toHaveLength(1)
  })
})

describe('adapt_current', () => {
  async function started() {
    const user = await createUser()
    await onboard(user.id)
    const plan = await planFor(user.id)
    return { user, plan, level: plan.levels[0]! }
  }

  it('needs repeated non-independent attempts, then appends a new version without touching history', async () => {
    const { user, plan, level } = await started()
    await rejects(adaptCurrentExercise(user.id, { planRevision: plan.revision }, key()), 'ADAPT_NOT_NEEDED')

    const first = await recordAttempt(user.id, { levelId: level.id, outcome: 'STRUGGLING', idempotencyKey: key() })
    await recordAttempt(user.id, { levelId: level.id, outcome: 'WITH_HELP', idempotencyKey: key() })
    const before = await prisma.exerciseVersion.findMany({ where: { levelId: level.id } })

    const result = await adaptCurrentExercise(user.id, { planRevision: plan.revision }, key())
    expect(result.exerciseVersion).toBe(2)
    expect(result.planRevision).toBe(plan.revision + 1)

    const versions = await prisma.exerciseVersion.findMany({ where: { levelId: level.id }, orderBy: { version: 'asc' } })
    expect(versions.map((v) => v.version)).toEqual([1, 2])
    expect(versions[0]).toEqual(before[0]) // the old snapshot is byte-identical
    expect(versions[1]?.criterionVersion).toBe(2)
    expect(await prisma.attempt.count({ where: { levelId: level.id } })).toBe(2)
    const after = await prisma.level.findUniqueOrThrow({ where: { id: level.id } })
    expect(after.state).toBe('CURRENT')
    expect(await prisma.masteryEvent.count()).toBe(0)

    // A mastery confirmation prepared against the old version no longer applies.
    await rejects(
      confirmMastery(user.id, {
        levelId: level.id,
        attemptId: first.attemptId,
        criterionVersion: first.criterionVersion,
        planRevision: result.planRevision,
        idempotencyKey: key(),
      }),
      'ATTEMPT_INVALID',
    )
    await rejects(adaptCurrentExercise(user.id, { planRevision: plan.revision }, key()), 'STALE_PLAN')
  })
})

describe('revise_future', () => {
  it('replaces only locked levels and leaves completed history and mastery untouched', async () => {
    const user = await createUser()
    await onboard(user.id)
    const plan = await planFor(user.id)
    const [l1, l2] = plan.levels
    const m1 = await master(user.id, l1!.id, plan.revision)
    const m2 = await master(user.id, l2!.id, m1.planRevision)

    const keepIds = plan.levels.slice(0, 3).map((l) => l.id)
    const snapshot = async () =>
      prisma.exerciseVersion.findMany({ where: { levelId: { in: keepIds } }, orderBy: [{ levelId: 'asc' }, { version: 'asc' }] })
    const before = await snapshot()

    const result = await reviseFuturePlan(user.id, { planRevision: m2.planRevision }, key())
    expect(result.replacedLevels).toBe(plan.levels.length - 3)
    expect(result.planRevision).toBe(m2.planRevision + 1)

    const after = await prisma.level.findMany({ where: { planId: plan.id }, orderBy: { position: 'asc' } })
    expect(after.map((l) => l.position)).toEqual(after.map((_, i) => i + 1))
    expect(after.slice(0, 3).map((l) => l.id)).toEqual(keepIds)
    expect(after.slice(0, 3).map((l) => l.state)).toEqual(['COMPLETED', 'COMPLETED', 'CURRENT'])
    expect(after.slice(3).every((l) => l.state === 'LOCKED' && l.stableKey?.startsWith('rv-'))).toBe(true)
    expect(await snapshot()).toEqual(before)
    expect(await prisma.masteryEvent.count()).toBe(2)
    expect(after.filter((l) => l.state === 'CURRENT')).toHaveLength(1)
    await rejects(reviseFuturePlan(user.id, { planRevision: m2.planRevision }, key()), 'STALE_PLAN')
  })

  it('rejects a result computed before the owner made progress, and never lets it overwrite newer progress', async () => {
    const user = await createUser()
    await onboard(user.id)
    const plan = await planFor(user.id)
    const lockedBefore = plan.levels.slice(1).map((l) => l.id)

    process.env.AI_FAKE_MODE = 'slow'
    const revising = reviseFuturePlan(user.id, { planRevision: plan.revision }, key())
    const outcome = revising.then(
      () => 'committed',
      (error: { code?: string }) => error.code,
    )
    // Wait until the job is waiting for the (slow) generator, then the owner masters level 1 meanwhile.
    for (let i = 0; i < 100 && (await prisma.generationJob.count({ where: { status: 'PENDING' } })) === 0; i++) {
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
    delete process.env.AI_FAKE_MODE
    await master(user.id, plan.levels[0]!.id, plan.revision)

    expect(await outcome).toBe('STALE_PLAN')
    const [job] = await jobs(user.id).then((all) => all.filter((j) => j.kind === 'REVISE_FUTURE'))
    expect(job?.status).toBe('STALE')
    const levels = await prisma.level.findMany({ where: { planId: plan.id }, orderBy: { position: 'asc' } })
    expect(levels.slice(1).map((l) => l.id)).toEqual(lockedBefore) // untouched
    expect(levels.map((l) => l.state).slice(0, 3)).toEqual(['COMPLETED', 'CURRENT', 'LOCKED'])
  }, 30_000)

  it('an outage leaves the current plan usable and mastery unchanged', async () => {
    const user = await createUser()
    await onboard(user.id)
    const plan = await planFor(user.id)
    process.env.AI_FAKE_MODE = 'fail'
    await rejects(reviseFuturePlan(user.id, { planRevision: plan.revision }, key()), 'GENERATION_FAILED')
    delete process.env.AI_FAKE_MODE

    const after = await planFor(user.id)
    expect(after.revision).toBe(plan.revision)
    expect(after.levels.map((l) => l.id)).toEqual(plan.levels.map((l) => l.id))
    const next = await master(user.id, plan.levels[0]!.id, plan.revision)
    expect(next.planRevision).toBe(plan.revision + 1)
  })
})

describe('AI code cannot award mastery', () => {
  it('has no path to MasteryEvent or to Level.state changes', () => {
    const dir = join(process.cwd(), 'src/server/ai')
    const files = [...readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts')).map((f) => join(dir, f)), join(process.cwd(), 'src/server/revision.ts')]
    for (const file of files) {
      const source = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')
      expect(source, file).not.toMatch(/masteryEvent|confirmMastery/)
      expect(source, file).not.toMatch(/level\.update(Many)?\(\{[^}]*state/)
    }
  })
})
