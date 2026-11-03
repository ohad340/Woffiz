import { ensureTestMediaRows, offeredCatalog } from './ai/media'
import { COMMIT_TX, fenceJob, finishJob, runJob, settleWithoutResult, startJob } from './ai/jobs'
import { parseAdapt, parseRevise } from './ai/parse'
import { PLAN_LEVELS, POLICY_VERSION, adaptCurrentRequest, reviseFutureRequest } from './ai/prompts'
import type { AttemptSummary, GeneratedLevel, TopicName } from './ai/schema'
import { exerciseContentSchema } from './content'
import { prisma, type Tx } from './db'
import { AppError } from './errors'
import { hashPayload } from './idempotency'
import { readAnswers } from './onboarding'
import { lockPlan } from './progress'
import { boundColumns, modelTechniques } from './ai/techniques'
import { choiceFromColumns, eligibleReplacements, loadOfferedTechniques, mediaRequired, recheckBoundTechniques, techniqueDeps, type TechniqueDeps } from './media/offer'

export type GenerationOptions = { techniqueDeps?: Partial<TechniqueDeps> }

/** Closes a job whose bound demonstration disappeared before commit: nothing stored, unit refunded. */
async function rejectForMedia(job: Parameters<typeof settleWithoutResult>[0]): Promise<never> {
  await settleWithoutResult(job, 'REJECTED', { errorCode: 'media-unavailable' })
  throw new AppError('GENERATION_FAILED', 'a bound demonstration became unavailable before commit')
}

/**
 * AI-driven changes to the plan content (PRD section 5, items 8 and 9). The only things this module may change:
 * - a NEW ExerciseVersion for the CURRENT level (old versions and attempts stay), or
 * - the LOCKED future levels, which have no attempts and no mastery.
 * It never writes MasteryEvent, never changes Level.state of an existing level, and never touches completed levels.
 * Every commit re-checks Plan.revision under the plan row lock, so a result computed from older progress is rejected.
 */

const MIN_STRUGGLES = 2

/**
 * A repeated request (same user, operation and Idempotency-Key) returns the stored result: no new job, no quota,
 * no model call, even when the plan has moved on since. The key row is written in the same transaction that
 * commits the change, so a result exists exactly when the change does. Reusing a key for another request is rejected.
 */
async function storedResult<T>(userId: string, operation: string, key: string, payload: unknown): Promise<T | null> {
  const existing = await prisma.idempotencyKey.findUnique({ where: { userId_operation_key: { userId, operation, key } } })
  if (!existing) return null
  if (existing.requestHash !== hashPayload(payload)) throw new AppError('IDEMPOTENCY_MISMATCH')
  return existing.responseJson as T
}

async function saveResult(tx: Tx, userId: string, operation: string, key: string, payload: unknown, result: object) {
  await tx.idempotencyKey.create({
    data: { userId, operation, key, requestHash: hashPayload(payload), responseJson: result },
  })
}

async function activePlanFor(tx: Tx | typeof prisma, userId: string) {
  const puppy = await tx.puppy.findUnique({ where: { ownerId: userId } })
  if (!puppy) throw new AppError('NOT_FOUND')
  const plan = await tx.plan.findFirst({ where: { puppyId: puppy.id, status: 'ACTIVE' }, orderBy: { version: 'desc' } })
  if (!plan || !plan.currentLevelId) throw new AppError('NOT_FOUND')
  return { puppy, plan, currentLevelId: plan.currentLevelId }
}

async function recentAttempts(tx: Tx | typeof prisma, puppyId: string): Promise<AttemptSummary[]> {
  const rows = await tx.attempt.findMany({ where: { puppyId }, orderBy: { createdAt: 'desc' }, take: 10 })
  return rows.map((row) => ({ outcome: row.outcome, mode: row.mode }))
}

function contentOf(json: unknown) {
  return exerciseContentSchema.parse(json)
}

export type AdaptResult = { planRevision: number; exerciseVersion: number; explanation: string }

/** adapt_current: a new, easier version of the CURRENT exercise after repeated non-independent attempts. */
export async function adaptCurrentExercise(
  userId: string,
  input: { planRevision: number },
  idempotencyKey: string,
  options: GenerationOptions = {},
): Promise<AdaptResult> {
  const deps = techniqueDeps(options.techniqueDeps)
  const reused = await storedResult<AdaptResult>(userId, 'plan.adapt', idempotencyKey, input)
  if (reused) return reused

  const snapshot = await prisma.$transaction(async (tx) => {
    const { puppy, plan, currentLevelId } = await activePlanFor(tx, userId)
    if (plan.revision !== input.planRevision) throw new AppError('STALE_PLAN')
    const level = await tx.level.findUniqueOrThrow({ where: { id: currentLevelId } })
    const exercise = await tx.exerciseVersion.findFirstOrThrow({ where: { levelId: level.id }, orderBy: { version: 'desc' } })
    const struggles = await tx.attempt.count({
      where: { levelId: level.id, exerciseVersionId: exercise.id, mode: 'CURRENT', outcome: { not: 'INDEPENDENT' } },
    })
    // A suspended technique pauses the guidance: the owner may ask for a replacement without the struggle rule.
    const state = exercise.techniqueKey && exercise.techniqueVersion !== null
      ? await tx.techniqueVersionState.findUnique({ where: { techniqueKey_techniqueVersion: { techniqueKey: exercise.techniqueKey, techniqueVersion: exercise.techniqueVersion } } })
      : null
    const suspended = Boolean(state?.suspendedAt)
    if (!suspended && struggles < MIN_STRUGGLES) throw new AppError('ADAPT_NOT_NEEDED')
    return {
      suspended,
      puppyId: puppy.id,
      profile: readAnswers(puppy.profileJson),
      planId: plan.id,
      revision: plan.revision,
      level,
      exercise,
      attempts: await recentAttempts(tx, puppy.id),
    }
  })

  const catalog = offeredCatalog()
  const techniques = await loadOfferedTechniques(prisma, deps)
  // After a suspension the replacement MUST be another offered technique of the same topic. When there is none, say so
  // now: before any job, quota unit or model call (no repeated failing adaptations).
  if (snapshot.suspended && eligibleReplacements(techniques, snapshot.level.topic, snapshot.profile).length === 0) {
    throw new AppError('ADAPT_UNAVAILABLE')
  }
  const required = snapshot.suspended || mediaRequired(deps.env)
  const job = await startJob({
    kind: 'ADAPT_CURRENT',
    puppyId: snapshot.puppyId,
    userId,
    expectedRevision: snapshot.revision,
    idempotencyKey,
  })
  const output = await runJob(
    job,
    adaptCurrentRequest({
      task: 'adapt_current',
      profile: snapshot.profile,
      mediaCatalog: catalog,
      techniques: modelTechniques(techniques),
      mediaRequired: required,
      policyVersion: POLICY_VERSION,
      currentLevel: { stableKey: snapshot.level.stableKey, topic: snapshot.level.topic, position: snapshot.level.position },
      currentExercise: contentOf(snapshot.exercise.contentJson),
      currentTechnique: snapshot.suspended ? null : choiceFromColumns(snapshot.exercise),
      recentAttempts: snapshot.attempts,
    }),
    parseAdapt({ answers: snapshot.profile, catalog, techniques, mediaRequired: required }, snapshot.level.topic),
  )

  const committed = await prisma.$transaction(async (tx) => {
    await fenceJob(tx, job) // a worker that lost ownership of the job commits nothing
    await lockPlan(tx, snapshot.planId)
    const plan = await tx.plan.findUniqueOrThrow({ where: { id: snapshot.planId } })
    const latest = await tx.exerciseVersion.findFirstOrThrow({ where: { levelId: snapshot.level.id }, orderBy: { version: 'desc' } })
    if (plan.revision !== snapshot.revision || plan.currentLevelId !== snapshot.level.id || latest.id !== snapshot.exercise.id) {
      return null
    }
    if ((await recheckBoundTechniques(tx, [output.exercise.technique], deps)).length > 0) return 'media' as const
    const { mediaId, technique, ...content } = output.exercise
    await ensureTestMediaRows(tx, [mediaId])
    const created = await tx.exerciseVersion.create({
      data: {
        levelId: snapshot.level.id,
        version: latest.version + 1,
        criterionVersion: latest.criterionVersion + 1,
        contentJson: content,
        mediaId,
        ...boundColumns(technique, techniques),
      },
    })
    await tx.level.update({ where: { id: snapshot.level.id }, data: { contentVersion: { increment: 1 } } })
    const updated = await tx.plan.update({ where: { id: plan.id }, data: { revision: { increment: 1 } } })
    await finishJob(job, 'SUCCEEDED', {}, tx)
    const result: AdaptResult = { planRevision: updated.revision, exerciseVersion: created.version, explanation: output.explanation }
    await saveResult(tx, userId, 'plan.adapt', idempotencyKey, input, result)
    return result
  }, COMMIT_TX)

  if (committed === 'media') return rejectForMedia(job)
  if (!committed) {
    await settleWithoutResult(job, 'STALE', { errorCode: 'stale' })
    throw new AppError('STALE_PLAN')
  }
  return committed
}

export type ReviseResult = { planRevision: number; replacedLevels: number }

/** revise_future: replaces ONLY the locked future levels. Completed and current levels never change. */
export async function reviseFuturePlan(
  userId: string,
  input: { planRevision: number },
  idempotencyKey: string,
  options: GenerationOptions = {},
): Promise<ReviseResult> {
  const deps = techniqueDeps(options.techniqueDeps)
  const reused = await storedResult<ReviseResult>(userId, 'plan.revise', idempotencyKey, input)
  if (reused) return reused

  const snapshot = await prisma.$transaction(async (tx) => {
    const { puppy, plan, currentLevelId } = await activePlanFor(tx, userId)
    if (plan.revision !== input.planRevision) throw new AppError('STALE_PLAN')
    const levels = await tx.level.findMany({
      where: { planId: plan.id },
      orderBy: { position: 'asc' },
      include: { exerciseVersions: { orderBy: { version: 'desc' }, take: 1 } },
    })
    const current = levels.find((level) => level.id === currentLevelId)
    if (!current) throw new AppError('NOT_FOUND')
    const locked = levels.filter((level) => level.state === 'LOCKED')
    if (locked.length === 0) throw new AppError('REVISE_NOT_NEEDED')
    const kept = levels.filter((level) => level.state !== 'LOCKED')
    return {
      puppyId: puppy.id,
      profile: readAnswers(puppy.profileJson),
      planId: plan.id,
      revision: plan.revision,
      current,
      lockedIds: locked.map((level) => level.id),
      locked: locked.map((level): GeneratedLevel => {
        const exercise = level.exerciseVersions[0]
        return {
          ...contentOf(exercise?.contentJson),
          stableKey: level.stableKey ?? `legacy-${level.position}`,
          topic: level.topic,
          prerequisites: Array.isArray(level.prerequisitesJson) ? (level.prerequisitesJson as string[]) : [],
          mediaId: exercise?.techniqueKey ? null : (exercise?.mediaId ?? null),
          technique: exercise ? choiceFromColumns(exercise) : null,
        }
      }),
      kept: {
        stableKeys: kept.flatMap((level) => (level.stableKey ? [level.stableKey] : [])),
        topics: kept.map((level): TopicName => level.topic),
        count: kept.length,
      },
      completed: kept
        .filter((level) => level.state === 'COMPLETED')
        .map((level) => ({
          stableKey: level.stableKey,
          topic: level.topic as TopicName,
          title: contentOf(level.exerciseVersions[0]?.contentJson).title,
        })),
      attempts: await recentAttempts(tx, puppy.id),
    }
  })

  const catalog = offeredCatalog()
  const techniques = await loadOfferedTechniques(prisma, deps)
  const required = mediaRequired(deps.env)
  const job = await startJob({
    kind: 'REVISE_FUTURE',
    puppyId: snapshot.puppyId,
    userId,
    expectedRevision: snapshot.revision,
    idempotencyKey,
  })
  const output = await runJob(
    job,
    reviseFutureRequest({
      task: 'revise_future',
      profile: snapshot.profile,
      mediaCatalog: catalog,
      techniques: modelTechniques(techniques),
      mediaRequired: required,
      policyVersion: POLICY_VERSION,
      completedSummaries: snapshot.completed,
      currentLevel: {
        stableKey: snapshot.current.stableKey,
        topic: snapshot.current.topic,
        position: snapshot.current.position,
      },
      lockedLevels: snapshot.locked,
      recentAttempts: snapshot.attempts,
      totalLevelBounds: PLAN_LEVELS,
    }),
    parseRevise({ answers: snapshot.profile, catalog, techniques, mediaRequired: required }, snapshot.kept, PLAN_LEVELS),
  )

  const committed = await prisma.$transaction(async (tx) => {
    await fenceJob(tx, job) // a worker that lost ownership of the job commits nothing
    await lockPlan(tx, snapshot.planId)
    const plan = await tx.plan.findUniqueOrThrow({ where: { id: snapshot.planId } })
    const locked = await tx.level.findMany({ where: { planId: plan.id, state: 'LOCKED' }, select: { id: true } })
    const sameLocked =
      locked.length === snapshot.lockedIds.length && locked.every((level) => snapshot.lockedIds.includes(level.id))
    if (plan.revision !== snapshot.revision || plan.currentLevelId !== snapshot.current.id || !sameLocked) return null
    if ((await recheckBoundTechniques(tx, output.levels.map((level) => level.technique), deps)).length > 0) return 'media' as const

    await ensureTestMediaRows(tx, output.levels.map((level) => level.mediaId))
    // Locked levels have no attempts or mastery, so deleting them cannot lose history. Positions are freed first.
    await tx.level.deleteMany({ where: { planId: plan.id, state: 'LOCKED' } })
    for (const [index, level] of output.levels.entries()) {
      const { stableKey, topic, prerequisites, mediaId, technique, ...content } = level
      await tx.level.create({
        data: {
          planId: plan.id,
          position: snapshot.current.position + 1 + index,
          topic,
          state: 'LOCKED',
          stableKey,
          prerequisitesJson: prerequisites,
          exerciseVersions: { create: { version: 1, criterionVersion: 1, contentJson: content, mediaId, ...boundColumns(technique, techniques) } },
        },
      })
    }
    const updated = await tx.plan.update({ where: { id: plan.id }, data: { revision: { increment: 1 } } })
    await finishJob(job, 'SUCCEEDED', {}, tx)
    const result: ReviseResult = { planRevision: updated.revision, replacedLevels: output.levels.length }
    await saveResult(tx, userId, 'plan.revise', idempotencyKey, input, result)
    return result
  }, COMMIT_TX)

  if (committed === 'media') return rejectForMedia(job)
  if (!committed) {
    await settleWithoutResult(job, 'STALE', { errorCode: 'stale' })
    throw new AppError('STALE_PLAN')
  }
  return committed
}
