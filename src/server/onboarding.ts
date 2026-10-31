import { DEV_PLAN } from '@/fixtures/devPlan'
import { prisma, type Tx } from './db'
import { AppError } from './errors'
import { EMPTY_ANSWERS, onboardingAnswersSchema, type OnboardingAnswers } from './content'

export const ONBOARDING_STEPS = 5

async function ensurePuppy(tx: Tx, ownerId: string) {
  return tx.puppy.upsert({ where: { ownerId }, create: { ownerId }, update: {} })
}

/** Serializes concurrent requests for the same puppy (draft saves and completion). */
async function lockPuppy(tx: Tx, puppyId: string) {
  await tx.$queryRaw`SELECT id FROM "Puppy" WHERE id = ${puppyId}::uuid FOR UPDATE`
}

function readAnswers(profileJson: unknown): OnboardingAnswers {
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

/**
 * Creates the puppy's plan from the labeled development fixture. Idempotent: repeated or
 * concurrent calls serialize on the puppy row, and exactly one call creates the plan.
 */
export async function completeOnboarding(userId: string): Promise<OnboardingResult> {
  return prisma.$transaction(async (tx) => {
    const puppy = await ensurePuppy(tx, userId)
    await lockPuppy(tx, puppy.id)
    const fresh = await tx.puppy.findUniqueOrThrow({ where: { id: puppy.id } })

    if (fresh.onboardedAt) {
      const existing = await tx.plan.findFirst({ where: { puppyId: fresh.id }, orderBy: { version: 'asc' } })
      if (!existing) throw new AppError('ONBOARDING_INCOMPLETE')
      return { puppyId: fresh.id, planId: existing.id, created: false }
    }

    const answers = readAnswers(fresh.profileJson)
    if (!answers.name || !answers.age || !answers.time) throw new AppError('ONBOARDING_INCOMPLETE')

    const plan = await tx.plan.create({ data: { puppyId: fresh.id, version: 1, status: 'ACTIVE', source: 'dev-fixture' } })
    let firstLevelId: string | null = null
    for (const [index, level] of DEV_PLAN.entries()) {
      const created = await tx.level.create({
        data: {
          planId: plan.id,
          position: index + 1,
          topic: level.topic,
          state: index === 0 ? 'CURRENT' : 'LOCKED',
          exerciseVersions: {
            create: {
              version: 1,
              criterionVersion: 1,
              contentJson: { ...level.content, estimatedMinutes: level.estimatedMinutes },
            },
          },
        },
      })
      if (index === 0) firstLevelId = created.id
    }
    await tx.plan.update({ where: { id: plan.id }, data: { currentLevelId: firstLevelId } })
    await tx.puppy.update({ where: { id: fresh.id }, data: { onboardedAt: new Date(), revision: { increment: 1 } } })
    return { puppyId: fresh.id, planId: plan.id, created: true }
  })
}
