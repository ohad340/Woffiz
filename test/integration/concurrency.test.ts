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
      Array.from({ length: 5 }, () => prisma.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid, pg_sleep(0.3)`),
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
    expect(new Set(values.map((v) => JSON.stringify(v))).size).toBe(1)

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
    expect(new Set(results.map((r) => JSON.stringify(r))).size).toBe(1)
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

  it('parallel onboarding completions create one puppy and one plan', async () => {
    const user = await createUser()
    await saveOnboardingDraft(user.id, {
      step: 4,
      answers: { ...FULL_ANSWERS, skills: [...FULL_ANSWERS.skills], difficulties: [...FULL_ANSWERS.difficulties] },
    })
    const results = await Promise.all(Array.from({ length: 8 }, () => completeOnboarding(user.id)))
    expect(results.filter((r) => r.created)).toHaveLength(1)
    expect(new Set(results.map((r) => r.planId)).size).toBe(1)
    expect(await prisma.puppy.count()).toBe(1)
    expect(await prisma.plan.count()).toBe(1)
    expect(await prisma.level.count({ where: { state: 'CURRENT' } })).toBe(1)
  })

  it('parallel first drafts from one owner create one puppy', async () => {
    const user = await createUser()
    await Promise.all(Array.from({ length: 8 }, (_, i) => saveOnboardingDraft(user.id, { step: 0, answers: { name: `שם ${i}` } })))
    expect(await prisma.puppy.count()).toBe(1)
  })
})
