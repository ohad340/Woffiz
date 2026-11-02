import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { completeOnboarding, saveOnboardingDraft } from '@/server/onboarding'
import { confirmMastery, recordAttempt } from '@/server/progress'
import { createUser, FULL_ANSWERS, key, onboard, planFor, REAL_POSTGRES, resetDatabase } from './helpers'

/**
 * Row-locking acceptance tests. They only mean something on a standard PostgreSQL server with
 * independent connections, so they run when TEST_DB_KIND=postgres (CI) and are skipped on PGlite,
 * which serializes everything over one connection. A skipped run is NOT a pass.
 */
describe.runIf(REAL_POSTGRES)('concurrency on standard PostgreSQL', () => {
  beforeEach(resetDatabase)

  it('uses independent database connections', async () => {
    const pids = await Promise.all(
      Array.from({ length: 5 }, () => prisma.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid FROM pg_sleep(0.3)`),
    )
    expect(new Set(pids.map((rows) => rows[0]!.pid)).size).toBeGreaterThanOrEqual(3)
  })

  it('parallel mastery confirmations unlock exactly one level', async () => {
    const user = await createUser()
    await onboard(user.id)
    const plan = await planFor(user.id)
    const level = plan.levels[0]!
    const attempt = await recordAttempt(user.id, { levelId: level.id, outcome: 'INDEPENDENT', idempotencyKey: key() })

    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () =>
        confirmMastery(user.id, { levelId: level.id, attemptId: attempt.attemptId, criterionVersion: 1, planRevision: 0, idempotencyKey: key() }),
      ),
    )
    expect(results.every((r) => r.status === 'fulfilled')).toBe(true)
    const values = results.map((r) => (r as PromiseFulfilledResult<unknown>).value)
    for (const value of values) expect(value).toEqual(values[0])

    const levels = await prisma.level.findMany({ where: { planId: plan.id }, orderBy: { position: 'asc' } })
    expect(levels.filter((l) => l.state === 'CURRENT').map((l) => l.position)).toEqual([2])
    expect(levels.filter((l) => l.state === 'COMPLETED')).toHaveLength(1)
    expect(await prisma.masteryEvent.count()).toBe(1)
    expect((await planFor(user.id)).revision).toBe(1)
  })

  it('parallel confirmations with the SAME key all return one stored result', async () => {
    const user = await createUser()
    await onboard(user.id)
    const level = (await planFor(user.id)).levels[0]!
    const attempt = await recordAttempt(user.id, { levelId: level.id, outcome: 'INDEPENDENT', idempotencyKey: key() })
    const input = { levelId: level.id, attemptId: attempt.attemptId, criterionVersion: 1, planRevision: 0, idempotencyKey: key() }

    const results = await Promise.all(Array.from({ length: 8 }, () => confirmMastery(user.id, input)))
    // Same values; key order may differ between the original object and the stored JSON.
    for (const result of results) expect(result).toEqual(results[0])
    expect(await prisma.masteryEvent.count()).toBe(1)
    expect(await prisma.idempotencyKey.count({ where: { operation: 'mastery.confirm' } })).toBe(1)
  })

  it('parallel attempt reports with the same key write one row', async () => {
    const user = await createUser()
    await onboard(user.id)
    const level = (await planFor(user.id)).levels[0]!
    const input = { levelId: level.id, outcome: 'WITH_HELP' as const, idempotencyKey: key() }
    const results = await Promise.all(Array.from({ length: 8 }, () => recordAttempt(user.id, input)))
    expect(new Set(results.map((r) => r.attemptId)).size).toBe(1)
    expect(await prisma.attempt.count()).toBe(1)
  })

  it('parallel onboarding completions create one puppy and one plan, and generate once', async () => {
    const user = await createUser()
    await saveOnboardingDraft(user.id, {
      step: 4,
      answers: { ...FULL_ANSWERS, skills: [...FULL_ANSWERS.skills], difficulties: [...FULL_ANSWERS.difficulties] },
    })
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => completeOnboarding(user.id)))

    // One request generates the plan. The others either find it already created or are told a generation is
    // running (the screen then waits and asks again); none of them starts a second generation.
    const fulfilled = results.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof completeOnboarding>>> => r.status === 'fulfilled')
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected')
    expect(fulfilled.filter((r) => r.value.created)).toHaveLength(1)
    expect(new Set(fulfilled.map((r) => r.value.planId)).size).toBe(1)
    for (const r of rejected) expect(r.reason).toMatchObject({ code: 'GENERATION_PENDING' })

    expect(await prisma.puppy.count()).toBe(1)
    expect(await prisma.plan.count()).toBe(1)
    expect(await prisma.level.count({ where: { state: 'CURRENT' } })).toBe(1)
    expect(await prisma.generationJob.count({ where: { kind: 'INITIAL_PLAN', status: 'SUCCEEDED' } })).toBe(1)
    expect(await prisma.generationJob.count({ where: { status: 'PENDING' } })).toBe(0)
    // The one generation used one account request unit.
    expect((await prisma.aiUsageDay.findMany()).map((u) => u.count).sort()).toEqual([1, 1])
    // A request that arrives afterwards just gets the plan.
    expect((await completeOnboarding(user.id)).created).toBe(false)
  })

  it('parallel first drafts from one owner create one puppy', async () => {
    const user = await createUser()
    await Promise.all(Array.from({ length: 8 }, (_, i) => saveOnboardingDraft(user.id, { step: 0, answers: { name: `שם ${i}` } })))
    expect(await prisma.puppy.count()).toBe(1)
  })
})
