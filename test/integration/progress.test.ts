import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { AppError } from '@/server/errors'
import { confirmMastery, recordAttempt } from '@/server/progress'
import { createUser, key, onboard, planFor, resetDatabase } from './helpers'

beforeEach(resetDatabase)

async function setup() {
  const user = await createUser()
  await onboard(user.id)
  const plan = await planFor(user.id)
  return { user, plan, levels: plan.levels }
}

async function currentCounts(planId: string) {
  const levels = await prisma.level.findMany({ where: { planId }, orderBy: { position: 'asc' } })
  return {
    current: levels.filter((l) => l.state === 'CURRENT').map((l) => l.position),
    completed: levels.filter((l) => l.state === 'COMPLETED').length,
  }
}

async function masterLevel(userId: string, levelId: string, planRevision: number) {
  const attempt = await recordAttempt(userId, { levelId, outcome: 'INDEPENDENT', idempotencyKey: key() })
  return confirmMastery(userId, {
    levelId,
    attemptId: attempt.attemptId,
    criterionVersion: attempt.criterionVersion,
    planRevision,
    idempotencyKey: key(),
  })
}

const rejects = (promise: Promise<unknown>, code: string) =>
  expect(promise).rejects.toMatchObject({ code })

describe('plan creation', () => {
  it('gives a new profile a valid plan with exactly one current level', async () => {
    const { plan, levels } = await setup()
    expect(levels.length).toBe(12)
    expect(levels.map((l) => l.position)).toEqual(levels.map((_, i) => i + 1))
    expect(await currentCounts(plan.id)).toEqual({ current: [1], completed: 0 })
    expect(plan.currentLevelId).toBe(levels[0]!.id)
  })
})

describe('feedback never unlocks', () => {
  it.each(['INDEPENDENT', 'WITH_HELP', 'STRUGGLING'] as const)('a %s report alone leaves the frontier unchanged', async (outcome) => {
    const { user, plan, levels } = await setup()
    const result = await recordAttempt(user.id, { levelId: levels[0]!.id, outcome, idempotencyKey: key() })
    expect(result.mode).toBe('CURRENT')
    expect(await currentCounts(plan.id)).toEqual({ current: [1], completed: 0 })
    expect((await planFor(user.id)).revision).toBe(0)
  })
})

describe('mastery', () => {
  it('unlocks exactly the next level', async () => {
    const { user, plan, levels } = await setup()
    const result = await masterLevel(user.id, levels[0]!.id, 0)
    expect(result).toMatchObject({ completedPosition: 1, nextPosition: 2, planCompleted: false, planRevision: 1 })
    expect(await currentCounts(plan.id)).toEqual({ current: [2], completed: 1 })
    expect(await prisma.masteryEvent.count()).toBe(1)
  })

  it('requires an independent success: help or struggle cannot confirm', async () => {
    const { user, levels } = await setup()
    for (const outcome of ['WITH_HELP', 'STRUGGLING'] as const) {
      const attempt = await recordAttempt(user.id, { levelId: levels[0]!.id, outcome, idempotencyKey: key() })
      await rejects(
        confirmMastery(user.id, { levelId: levels[0]!.id, attemptId: attempt.attemptId, criterionVersion: 1, planRevision: 0, idempotencyKey: key() }),
        'ATTEMPT_INVALID',
      )
    }
    expect(await prisma.masteryEvent.count()).toBe(0)
  })

  it('rejects an unknown attempt id', async () => {
    const { user, levels } = await setup()
    await rejects(
      confirmMastery(user.id, { levelId: levels[0]!.id, attemptId: crypto.randomUUID(), criterionVersion: 1, planRevision: 0, idempotencyKey: key() }),
      'ATTEMPT_INVALID',
    )
  })

  it('never accepts a review-mode attempt, even an independent one on the current level', async () => {
    const { user, plan, levels } = await setup()
    const exercise = await prisma.exerciseVersion.findFirstOrThrow({ where: { levelId: levels[0]!.id } })
    const puppy = await prisma.puppy.findFirstOrThrow({ where: { ownerId: user.id } })
    const review = await prisma.attempt.create({
      data: { puppyId: puppy.id, levelId: levels[0]!.id, exerciseVersionId: exercise.id, outcome: 'INDEPENDENT', mode: 'REVIEW' },
    })
    await rejects(
      confirmMastery(user.id, { levelId: levels[0]!.id, attemptId: review.id, criterionVersion: 1, planRevision: 0, idempotencyKey: key() }),
      'ATTEMPT_INVALID',
    )
    expect(await currentCounts(plan.id)).toEqual({ current: [1], completed: 0 })
  })

  it('rejects an attempt from another level', async () => {
    const { user, levels } = await setup()
    await masterLevel(user.id, levels[0]!.id, 0)
    const reviewAttempt = await recordAttempt(user.id, { levelId: levels[0]!.id, outcome: 'INDEPENDENT', idempotencyKey: key() })
    expect(reviewAttempt.mode).toBe('REVIEW')
    await rejects(
      confirmMastery(user.id, { levelId: levels[1]!.id, attemptId: reviewAttempt.attemptId, criterionVersion: 1, planRevision: 1, idempotencyKey: key() }),
      'ATTEMPT_INVALID',
    )
  })

  it('rejects a wrong criterion version and a stale plan revision', async () => {
    const { user, levels } = await setup()
    const attempt = await recordAttempt(user.id, { levelId: levels[0]!.id, outcome: 'INDEPENDENT', idempotencyKey: key() })
    const base = { levelId: levels[0]!.id, attemptId: attempt.attemptId, idempotencyKey: key() }
    await rejects(confirmMastery(user.id, { ...base, criterionVersion: 2, planRevision: 0 }), 'ATTEMPT_INVALID')
    await rejects(confirmMastery(user.id, { ...base, idempotencyKey: key(), criterionVersion: 1, planRevision: 5 }), 'STALE_PLAN')
  })

  it('rejects an attempt recorded against an older exercise version', async () => {
    const { user, levels } = await setup()
    const attempt = await recordAttempt(user.id, { levelId: levels[0]!.id, outcome: 'INDEPENDENT', idempotencyKey: key() })
    const v1 = await prisma.exerciseVersion.findFirstOrThrow({ where: { levelId: levels[0]!.id } })
    await prisma.exerciseVersion.create({ data: { levelId: levels[0]!.id, version: 2, criterionVersion: 2, contentJson: v1.contentJson! } })
    await rejects(
      confirmMastery(user.id, { levelId: levels[0]!.id, attemptId: attempt.attemptId, criterionVersion: 1, planRevision: 0, idempotencyKey: key() }),
      'ATTEMPT_INVALID',
    )
  })

  it('completes the plan at the last level without creating a phantom level', async () => {
    const { user, plan, levels } = await setup()
    let revision = 0
    for (const level of levels) {
      const result = await masterLevel(user.id, level.id, revision)
      revision = result.planRevision
      if (level.position === levels.length) {
        expect(result).toMatchObject({ planCompleted: true, nextLevelId: null, nextPosition: null })
      }
    }
    const final = await planFor(user.id)
    expect(final.status).toBe('COMPLETED')
    expect(final.currentLevelId).toBeNull()
    expect(final.levels).toHaveLength(12)
    expect(final.levels.every((l) => l.state === 'COMPLETED')).toBe(true)
    expect(await currentCounts(plan.id)).toEqual({ current: [], completed: 12 })
  })
})

describe('review and locked levels', () => {
  it('review reports never move the frontier', async () => {
    const { user, plan, levels } = await setup()
    await masterLevel(user.id, levels[0]!.id, 0)
    const before = await planFor(user.id)
    for (const outcome of ['INDEPENDENT', 'STRUGGLING'] as const) {
      const r = await recordAttempt(user.id, { levelId: levels[0]!.id, outcome, idempotencyKey: key() })
      expect(r.mode).toBe('REVIEW')
    }
    const after = await planFor(user.id)
    expect(after.revision).toBe(before.revision)
    expect(await currentCounts(plan.id)).toEqual({ current: [2], completed: 1 })
  })

  it('a completed level cannot be re-confirmed with a different attempt', async () => {
    const { user, levels } = await setup()
    await masterLevel(user.id, levels[0]!.id, 0)
    const review = await recordAttempt(user.id, { levelId: levels[0]!.id, outcome: 'INDEPENDENT', idempotencyKey: key() })
    await rejects(
      confirmMastery(user.id, { levelId: levels[0]!.id, attemptId: review.attemptId, criterionVersion: 1, planRevision: 1, idempotencyKey: key() }),
      'LEVEL_NOT_CURRENT',
    )
  })

  it('a locked level rejects attempts and mastery', async () => {
    const { user, levels } = await setup()
    await rejects(recordAttempt(user.id, { levelId: levels[1]!.id, outcome: 'INDEPENDENT', idempotencyKey: key() }), 'LEVEL_LOCKED')
    await rejects(
      confirmMastery(user.id, { levelId: levels[1]!.id, attemptId: crypto.randomUUID(), criterionVersion: 1, planRevision: 0, idempotencyKey: key() }),
      'LEVEL_LOCKED',
    )
    expect(await prisma.attempt.count()).toBe(0)
  })
})

describe('ownership', () => {
  it('another account cannot record, confirm or use attempts', async () => {
    const a = await setup()
    const b = await setup()
    const attemptA = await recordAttempt(a.user.id, { levelId: a.levels[0]!.id, outcome: 'INDEPENDENT', idempotencyKey: key() })

    await rejects(recordAttempt(b.user.id, { levelId: a.levels[0]!.id, outcome: 'INDEPENDENT', idempotencyKey: key() }), 'NOT_FOUND')
    await rejects(
      confirmMastery(b.user.id, { levelId: a.levels[0]!.id, attemptId: attemptA.attemptId, criterionVersion: 1, planRevision: 0, idempotencyKey: key() }),
      'NOT_FOUND',
    )
    // B's own current level cannot be unlocked with A's attempt.
    await rejects(
      confirmMastery(b.user.id, { levelId: b.levels[0]!.id, attemptId: attemptA.attemptId, criterionVersion: 1, planRevision: 0, idempotencyKey: key() }),
      'ATTEMPT_INVALID',
    )
    expect(await currentCounts(a.plan.id)).toEqual({ current: [1], completed: 0 })
    expect(await currentCounts(b.plan.id)).toEqual({ current: [1], completed: 0 })
  })
})

describe('idempotency', () => {
  it('a retry with the same key and payload returns the original result and writes once', async () => {
    const { user, levels } = await setup()
    const k = key()
    const first = await recordAttempt(user.id, { levelId: levels[0]!.id, outcome: 'WITH_HELP', idempotencyKey: k })
    const second = await recordAttempt(user.id, { levelId: levels[0]!.id, outcome: 'WITH_HELP', idempotencyKey: k })
    expect(second).toEqual(first)
    expect(await prisma.attempt.count()).toBe(1)
  })

  it('rejects reuse of a key with a different payload', async () => {
    const { user, levels } = await setup()
    const k = key()
    await recordAttempt(user.id, { levelId: levels[0]!.id, outcome: 'WITH_HELP', idempotencyKey: k })
    await rejects(recordAttempt(user.id, { levelId: levels[0]!.id, outcome: 'STRUGGLING', idempotencyKey: k }), 'IDEMPOTENCY_MISMATCH')
    expect(await prisma.attempt.count()).toBe(1)
  })

  it('scopes keys by user and by operation', async () => {
    const a = await setup()
    const b = await setup()
    const k = key()
    await recordAttempt(a.user.id, { levelId: a.levels[0]!.id, outcome: 'WITH_HELP', idempotencyKey: k })
    // Same key, other user: independent.
    await recordAttempt(b.user.id, { levelId: b.levels[0]!.id, outcome: 'WITH_HELP', idempotencyKey: k })
    // Same key, other operation: independent.
    const attempt = await recordAttempt(a.user.id, { levelId: a.levels[0]!.id, outcome: 'INDEPENDENT', idempotencyKey: key() })
    await confirmMastery(a.user.id, { levelId: a.levels[0]!.id, attemptId: attempt.attemptId, criterionVersion: 1, planRevision: 0, idempotencyKey: k })
    expect(await prisma.idempotencyKey.count({ where: { key: k } })).toBe(3)
  })

  it('a successful retry returns the original result after the plan has advanced', async () => {
    const { user, plan, levels } = await setup()
    const attempt = await recordAttempt(user.id, { levelId: levels[0]!.id, outcome: 'INDEPENDENT', idempotencyKey: key() })
    const input = { levelId: levels[0]!.id, attemptId: attempt.attemptId, criterionVersion: 1, planRevision: 0, idempotencyKey: key() }
    const first = await confirmMastery(user.id, input)
    await masterLevel(user.id, levels[1]!.id, first.planRevision) // the plan moves on
    expect((await planFor(user.id)).revision).toBe(2)

    const retry = await confirmMastery(user.id, input)
    expect(retry).toEqual(first)
    expect(await prisma.masteryEvent.count()).toBe(2)
    expect(await currentCounts(plan.id)).toEqual({ current: [3], completed: 2 })
  })

  it('a failed request stores nothing, so the key stays usable', async () => {
    const { user, levels } = await setup()
    const k = key()
    await rejects(
      confirmMastery(user.id, { levelId: levels[0]!.id, attemptId: crypto.randomUUID(), criterionVersion: 1, planRevision: 0, idempotencyKey: k }),
      'ATTEMPT_INVALID',
    )
    expect(await prisma.idempotencyKey.count()).toBe(0)
    const attempt = await recordAttempt(user.id, { levelId: levels[0]!.id, outcome: 'INDEPENDENT', idempotencyKey: key() })
    const ok = await confirmMastery(user.id, { levelId: levels[0]!.id, attemptId: attempt.attemptId, criterionVersion: 1, planRevision: 0, idempotencyKey: k })
    expect(ok.nextPosition).toBe(2)
  })

  it('a duplicate confirmation with a new key returns the same result', async () => {
    const { user, levels } = await setup()
    const attempt = await recordAttempt(user.id, { levelId: levels[0]!.id, outcome: 'INDEPENDENT', idempotencyKey: key() })
    const base = { levelId: levels[0]!.id, attemptId: attempt.attemptId, criterionVersion: 1, planRevision: 0 }
    const first = await confirmMastery(user.id, { ...base, idempotencyKey: key() })
    const again = await confirmMastery(user.id, { ...base, idempotencyKey: key() })
    expect(again).toEqual(first)
    expect(await prisma.masteryEvent.count()).toBe(1)
  })
})

describe('AppError', () => {
  it('carries a status and a Hebrew message', () => {
    const e = new AppError('LEVEL_LOCKED')
    expect(e.status).toBe(409)
    expect(e.hebrew).toMatch(/נעול/)
  })
})
