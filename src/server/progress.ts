import { prisma, type Tx } from './db'
import { AppError } from './errors'
import { withIdempotency } from './idempotency'

/**
 * Progression service (PRD section 5). All frontier changes happen here, inside one transaction
 * that holds the plan row lock. Nothing else in the codebase may change Level.state.
 *
 * - An attempt only records what the owner reported. It never moves the frontier.
 * - Mastery completes the current level and opens exactly the next one.
 */

async function lockPlan(tx: Tx, planId: string) {
  await tx.$queryRaw`SELECT id FROM "Plan" WHERE id = ${planId}::uuid FOR UPDATE`
}

/** Loads a level only if the authenticated user owns it; anything else looks like "not found". */
async function ownedLevel(tx: Tx, userId: string, levelId: string) {
  const level = await tx.level.findUnique({
    where: { id: levelId },
    include: { plan: { include: { puppy: true } } },
  })
  if (!level || level.plan.puppy.ownerId !== userId) throw new AppError('NOT_FOUND')
  return level
}

async function latestExercise(tx: Tx, levelId: string) {
  const exercise = await tx.exerciseVersion.findFirst({ where: { levelId }, orderBy: { version: 'desc' } })
  if (!exercise) throw new AppError('NOT_FOUND')
  return exercise
}

export type RecordAttemptInput = {
  levelId: string
  outcome: 'INDEPENDENT' | 'WITH_HELP' | 'STRUGGLING'
  idempotencyKey: string
}

export type RecordAttemptResult = {
  attemptId: string
  levelId: string
  mode: 'CURRENT' | 'REVIEW'
  outcome: RecordAttemptInput['outcome']
  exerciseVersionId: string
  criterionVersion: number
  planRevision: number
}

export async function recordAttempt(userId: string, input: RecordAttemptInput): Promise<RecordAttemptResult> {
  return prisma.$transaction(async (tx) => {
    const owned = await ownedLevel(tx, userId, input.levelId)
    await lockPlan(tx, owned.planId)

    return withIdempotency<RecordAttemptResult>(
      tx,
      { userId, operation: 'attempt.record', key: input.idempotencyKey, payload: { levelId: input.levelId, outcome: input.outcome } },
      async () => {
        // Re-read under the lock: the state may have changed while we waited.
        const level = await tx.level.findUniqueOrThrow({ where: { id: input.levelId }, include: { plan: true } })
        if (level.state === 'LOCKED') throw new AppError('LEVEL_LOCKED')

        const mode = level.state === 'CURRENT' ? 'CURRENT' : 'REVIEW'
        const exercise = await latestExercise(tx, level.id)
        const attempt = await tx.attempt.create({
          data: {
            puppyId: owned.plan.puppyId,
            levelId: level.id,
            exerciseVersionId: exercise.id,
            outcome: input.outcome,
            mode,
          },
        })
        return {
          attemptId: attempt.id,
          levelId: level.id,
          mode,
          outcome: input.outcome,
          exerciseVersionId: exercise.id,
          criterionVersion: exercise.criterionVersion,
          planRevision: level.plan.revision,
        }
      },
    )
  })
}

export type ConfirmMasteryInput = {
  levelId: string
  attemptId: string
  /** The criterion version the owner was shown. */
  criterionVersion: number
  /** The plan revision the client last saw. */
  planRevision: number
  idempotencyKey: string
}

export type ConfirmMasteryResult = {
  levelId: string
  completedPosition: number
  nextLevelId: string | null
  nextPosition: number | null
  planCompleted: boolean
  planRevision: number
}

export async function confirmMastery(userId: string, input: ConfirmMasteryInput): Promise<ConfirmMasteryResult> {
  return prisma.$transaction(async (tx) => {
    const owned = await ownedLevel(tx, userId, input.levelId)
    await lockPlan(tx, owned.planId)

    return withIdempotency<ConfirmMasteryResult>(
      tx,
      {
        userId,
        operation: 'mastery.confirm',
        key: input.idempotencyKey,
        payload: {
          levelId: input.levelId,
          attemptId: input.attemptId,
          criterionVersion: input.criterionVersion,
          planRevision: input.planRevision,
        },
      },
      async () => {
        const level = await tx.level.findUniqueOrThrow({ where: { id: input.levelId } })
        const plan = await tx.plan.findUniqueOrThrow({ where: { id: level.planId } })

        if (level.state === 'LOCKED') throw new AppError('LEVEL_LOCKED')

        if (level.state === 'COMPLETED') {
          // A duplicate request carrying a new key but the same mastery event returns the same result.
          const event = await tx.masteryEvent.findUnique({ where: { levelId: level.id } })
          if (event && event.attemptId === input.attemptId) return completionResult(tx, level.id, level.position, plan)
          throw new AppError('LEVEL_NOT_CURRENT')
        }

        if (plan.revision !== input.planRevision) throw new AppError('STALE_PLAN')

        // The attempt must be a current-mode, independent success on this level, by this owner's
        // puppy, against the exercise and criterion version that was displayed.
        const attempt = await tx.attempt.findUnique({ where: { id: input.attemptId } })
        const exercise = await latestExercise(tx, level.id)
        const valid =
          attempt !== null &&
          attempt.puppyId === plan.puppyId &&
          attempt.levelId === level.id &&
          attempt.mode === 'CURRENT' &&
          attempt.outcome === 'INDEPENDENT' &&
          attempt.exerciseVersionId === exercise.id &&
          exercise.criterionVersion === input.criterionVersion
        if (!valid) throw new AppError('ATTEMPT_INVALID')

        await tx.masteryEvent.create({
          data: { levelId: level.id, attemptId: input.attemptId, criterionVersion: exercise.criterionVersion },
        })
        // Order matters: free the "one CURRENT per plan" slot before opening the next level.
        await tx.level.update({ where: { id: level.id }, data: { state: 'COMPLETED' } })

        const next = await tx.level.findUnique({ where: { planId_position: { planId: plan.id, position: level.position + 1 } } })
        let updatedPlan
        if (next) {
          await tx.level.update({ where: { id: next.id }, data: { state: 'CURRENT' } })
          updatedPlan = await tx.plan.update({
            where: { id: plan.id },
            data: { currentLevelId: next.id, revision: { increment: 1 } },
          })
        } else {
          updatedPlan = await tx.plan.update({
            where: { id: plan.id },
            data: { status: 'COMPLETED', currentLevelId: null, revision: { increment: 1 } },
          })
        }
        return completionResult(tx, level.id, level.position, updatedPlan)
      },
    )
  })
}

async function completionResult(
  tx: Tx,
  levelId: string,
  position: number,
  plan: { id: string; status: string; revision: number },
): Promise<ConfirmMasteryResult> {
  const next = await tx.level.findUnique({ where: { planId_position: { planId: plan.id, position: position + 1 } } })
  return {
    levelId,
    completedPosition: position,
    nextLevelId: next?.id ?? null,
    nextPosition: next?.position ?? null,
    planCompleted: next === null,
    planRevision: plan.revision,
  }
}
