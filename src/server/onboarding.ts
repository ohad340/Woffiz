import { randomUUID } from 'node:crypto'
import { prisma, type Tx } from './db'
import { AppError } from './errors'
import { COMMIT_TX, fenceJob, finishJob, runJob, settleWithoutResult, startJob } from './ai/jobs'
import { ensureTestMediaRows, offeredCatalog } from './ai/media'
import { parsePlan } from './ai/parse'
import { PLAN_LEVELS, POLICY_VERSION, initialPlanRequest } from './ai/prompts'
import { EMPTY_ANSWERS, onboardingAnswersSchema, type OnboardingAnswers } from './content'

export const ONBOARDING_STEPS = 5

/**
 * Creates the owner's puppy row if it is missing. A plain upsert is not safe under concurrency
 * (parallel first requests both try to insert and one hits the unique constraint), so the insert
 * itself is conflict-tolerant and the row is read back afterwards.
 */
async function ensurePuppy(tx: Tx, ownerId: string) {
  await tx.$executeRaw`INSERT INTO "Puppy" ("id", "ownerId", "updatedAt") VALUES (${randomUUID()}::uuid, ${ownerId}, now()) ON CONFLICT ("ownerId") DO NOTHING`
  return tx.puppy.findUniqueOrThrow({ where: { ownerId } })
}

/** Serializes concurrent requests for the same puppy (draft saves and completion). */
async function lockPuppy(tx: Tx, puppyId: string) {
  await tx.$queryRaw`SELECT id FROM "Puppy" WHERE id = ${puppyId}::uuid FOR UPDATE`
}

export function readAnswers(profileJson: unknown): OnboardingAnswers {
  const parsed = onboardingAnswersSchema.safeParse({ ...EMPTY_ANSWERS, ...(profileJson as object) })
  return parsed.success ? parsed.data : EMPTY_ANSWERS
}

export type OnboardingState = {
  answers: OnboardingAnswers
  step: number
  revision: number
  onboarded: boolean
}

export async function getOnboardingState(userId: string): Promise<OnboardingState> {
  const puppy = await prisma.puppy.findUnique({ where: { ownerId: userId } })
  if (!puppy) return { answers: EMPTY_ANSWERS, step: 0, revision: 0, onboarded: false }
  return {
    answers: readAnswers(puppy.profileJson),
    step: puppy.onboardingStep,
    revision: puppy.revision,
    onboarded: puppy.onboardedAt !== null,
  }
}

/** Saves partial answers. The owner always comes from the session, never from the client. */
export async function saveOnboardingDraft(
  userId: string,
  input: { step: number; answers: Partial<OnboardingAnswers> },
): Promise<OnboardingState> {
  return prisma.$transaction(async (tx) => {
    const puppy = await ensurePuppy(tx, userId)
    await lockPuppy(tx, puppy.id)
    const fresh = await tx.puppy.findUniqueOrThrow({ where: { id: puppy.id } })
    if (fresh.onboardedAt) throw new AppError('ONBOARDING_DONE')

    const merged = onboardingAnswersSchema.parse({ ...readAnswers(fresh.profileJson), ...input.answers })
    const updated = await tx.puppy.update({
      where: { id: fresh.id },
      data: {
        name: merged.name,
        profileJson: merged,
        onboardingStep: Math.min(Math.max(input.step, 0), ONBOARDING_STEPS - 1),
        revision: { increment: 1 },
      },
    })
    return { answers: merged, step: updated.onboardingStep, revision: updated.revision, onboarded: false }
  })
}

export type OnboardingResult = { puppyId: string; planId: string; created: boolean }

async function existingResult(tx: Tx, puppyId: string): Promise<OnboardingResult> {
  const existing = await tx.plan.findFirst({ where: { puppyId }, orderBy: { version: 'asc' } })
  if (!existing) throw new AppError('ONBOARDING_INCOMPLETE')
  return { puppyId, planId: existing.id, created: false }
}

/**
 * Creates the puppy's plan with the generation pipeline (src/server/ai): pending-job control and quota, one
 * provider call OUTSIDE any transaction, validation, then one transaction that re-locks the puppy row and
 * commits the plan. Idempotent: a repeated call after success returns the existing plan, a concurrent call
 * while generating answers GENERATION_PENDING. On any failure the puppy stays not-onboarded with its answers.
 */
export async function completeOnboarding(userId: string): Promise<OnboardingResult> {
  const prepared = await prisma.$transaction(async (tx) => {
    const puppy = await ensurePuppy(tx, userId)
    await lockPuppy(tx, puppy.id)
    const fresh = await tx.puppy.findUniqueOrThrow({ where: { id: puppy.id } })
    if (fresh.onboardedAt) return { kind: 'done' as const, result: await existingResult(tx, fresh.id) }

    const answers = readAnswers(fresh.profileJson)
    if (!answers.name || !answers.age || !answers.time) throw new AppError('ONBOARDING_INCOMPLETE')
    return { kind: 'ready' as const, puppyId: fresh.id, revision: fresh.revision, answers }
  })
  if (prepared.kind === 'done') return prepared.result

  const catalog = offeredCatalog()
  // The request is identified by the answers' revision: asking again for the same answers is the same request.
  const job = await startJob({
    kind: 'INITIAL_PLAN',
    puppyId: prepared.puppyId,
    userId,
    expectedRevision: prepared.revision,
    idempotencyKey: `initial-plan:${prepared.revision}`,
  })
  const output = await runJob(
    job,
    initialPlanRequest({
      task: 'initial_plan',
      profile: prepared.answers,
      mediaCatalog: catalog,
      policyVersion: POLICY_VERSION,
      levelCount: PLAN_LEVELS,
    }),
    parsePlan({ answers: prepared.answers, catalog }),
  )

  const committed = await prisma.$transaction(async (tx) => {
    await fenceJob(tx, job) // a worker that lost ownership of the job commits nothing
    await lockPuppy(tx, prepared.puppyId)
    const fresh = await tx.puppy.findUniqueOrThrow({ where: { id: prepared.puppyId } })
    if (fresh.onboardedAt) return { kind: 'stale' as const, existing: await existingResult(tx, fresh.id) }
    // The answers changed while the plan was being generated: the candidate no longer matches them.
    if (fresh.revision !== prepared.revision) return { kind: 'stale' as const, existing: null }

    await ensureTestMediaRows(tx, output.levels.map((level) => level.mediaId))
    const plan = await tx.plan.create({
      data: {
        puppyId: fresh.id,
        version: 1,
        status: 'ACTIVE',
        source: job.config.kind === 'fake' ? 'fake' : `ai:${job.config.model}`,
      },
    })
    let firstLevelId: string | null = null
    for (const [index, level] of output.levels.entries()) {
      const { stableKey, topic, prerequisites, mediaId, ...content } = level
      const created = await tx.level.create({
        data: {
          planId: plan.id,
          position: index + 1,
          topic,
          state: index === 0 ? 'CURRENT' : 'LOCKED',
          stableKey,
          prerequisitesJson: prerequisites,
          exerciseVersions: { create: { version: 1, criterionVersion: 1, contentJson: content, mediaId } },
        },
      })
      if (index === 0) firstLevelId = created.id
    }
    await tx.plan.update({ where: { id: plan.id }, data: { currentLevelId: firstLevelId } })
    await tx.puppy.update({ where: { id: fresh.id }, data: { onboardedAt: new Date(), revision: { increment: 1 } } })
    await finishJob(job, 'SUCCEEDED', {}, tx)
    return { kind: 'created' as const, result: { puppyId: fresh.id, planId: plan.id, created: true } satisfies OnboardingResult }
  }, COMMIT_TX)

  if (committed.kind === 'created') return committed.result
  await settleWithoutResult(job, 'STALE', { errorCode: 'stale' })
  if (committed.existing) return committed.existing
  throw new AppError('STALE_PLAN')
}
