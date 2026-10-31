import { beforeEach, describe, expect, it } from 'vitest'
import { prisma } from '@/server/db'
import { completeOnboarding, getOnboardingState, saveOnboardingDraft } from '@/server/onboarding'
import { createUser, FULL_ANSWERS, onboard, resetDatabase } from './helpers'

beforeEach(resetDatabase)

const answers = { ...FULL_ANSWERS, skills: [...FULL_ANSWERS.skills], difficulties: [...FULL_ANSWERS.difficulties] }

describe('onboarding drafts', () => {
  it('saves partial answers per step and restores them', async () => {
    const user = await createUser()
    await saveOnboardingDraft(user.id, { step: 0, answers: { name: 'בוני', age: '4-6m' } })
    await saveOnboardingDraft(user.id, { step: 1, answers: { skills: ['sit'] } })
    const state = await getOnboardingState(user.id)
    expect(state).toMatchObject({ step: 1, onboarded: false, answers: { name: 'בוני', age: '4-6m', skills: ['sit'] } })
    expect(state.revision).toBe(2)
  })

  it('keeps each owner\'s draft separate', async () => {
    const a = await createUser()
    const b = await createUser()
    await saveOnboardingDraft(a.id, { step: 0, answers: { name: 'א' } })
    await saveOnboardingDraft(b.id, { step: 0, answers: { name: 'ב' } })
    expect((await getOnboardingState(a.id)).answers.name).toBe('א')
    expect((await getOnboardingState(b.id)).answers.name).toBe('ב')
    expect(await prisma.puppy.count()).toBe(2)
  })

  it('rejects oversized or unknown fields', async () => {
    const user = await createUser()
    await expect(saveOnboardingDraft(user.id, { step: 0, answers: { name: 'x'.repeat(500) } })).rejects.toThrow()
    await expect(
      saveOnboardingDraft(user.id, { step: 0, answers: { name: 'ok', isAdmin: true } as never }),
    ).rejects.toThrow()
  })
})

describe('onboarding completion is idempotent', () => {
  it('refuses to create a plan from incomplete answers', async () => {
    const user = await createUser()
    await saveOnboardingDraft(user.id, { step: 0, answers: { name: 'לוקה' } })
    await expect(completeOnboarding(user.id)).rejects.toMatchObject({ code: 'ONBOARDING_INCOMPLETE' })
    expect(await prisma.plan.count()).toBe(0)
  })

  it('repeated submissions create one puppy, one plan and one current level', async () => {
    const user = await createUser()
    await saveOnboardingDraft(user.id, { step: 4, answers })
    const first = await completeOnboarding(user.id)
    const second = await completeOnboarding(user.id)
    const third = await completeOnboarding(user.id)

    expect(first.created).toBe(true)
    expect(second).toMatchObject({ created: false, planId: first.planId, puppyId: first.puppyId })
    expect(third.planId).toBe(first.planId)
    expect(await prisma.puppy.count()).toBe(1)
    expect(await prisma.plan.count({ where: { status: 'ACTIVE' } })).toBe(1)
    expect(await prisma.level.count({ where: { state: 'CURRENT' } })).toBe(1)
    expect(await prisma.level.count()).toBe(12)
  })

  it('does not allow editing the questionnaire after the plan exists', async () => {
    const user = await createUser()
    await onboard(user.id)
    await expect(saveOnboardingDraft(user.id, { step: 0, answers: { name: 'חדש' } })).rejects.toMatchObject({ code: 'ONBOARDING_DONE' })
  })
})

describe('database guarantees behind the rules', () => {
  it('cannot hold two active plans for one puppy', async () => {
    const user = await createUser()
    await onboard(user.id)
    const puppy = await prisma.puppy.findFirstOrThrow()
    await expect(prisma.plan.create({ data: { puppyId: puppy.id, version: 2, status: 'ACTIVE' } })).rejects.toThrow()
  })

  it('cannot hold two current levels in one plan', async () => {
    const user = await createUser()
    await onboard(user.id)
    const locked = await prisma.level.findFirstOrThrow({ where: { state: 'LOCKED' } })
    await expect(prisma.level.update({ where: { id: locked.id }, data: { state: 'CURRENT' } })).rejects.toThrow()
  })

  it('cannot record two mastery events for one level', async () => {
    const user = await createUser()
    await onboard(user.id)
    const level = await prisma.level.findFirstOrThrow({ where: { position: 1 } })
    const exercise = await prisma.exerciseVersion.findFirstOrThrow({ where: { levelId: level.id } })
    const puppy = await prisma.puppy.findFirstOrThrow()
    const attempts = await Promise.all(
      [1, 2].map(() =>
        prisma.attempt.create({ data: { puppyId: puppy.id, levelId: level.id, exerciseVersionId: exercise.id, outcome: 'INDEPENDENT', mode: 'CURRENT' } }),
      ),
    )
    await prisma.masteryEvent.create({ data: { levelId: level.id, attemptId: attempts[0]!.id, criterionVersion: 1 } })
    await expect(
      prisma.masteryEvent.create({ data: { levelId: level.id, attemptId: attempts[1]!.id, criterionVersion: 1 } }),
    ).rejects.toThrow()
  })

  it('creates accounts as OWNER by default', async () => {
    const user = await createUser()
    expect(user.role).toBe('OWNER')
  })
})
