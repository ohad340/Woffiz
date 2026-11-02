import { randomUUID } from 'node:crypto'
import { prisma } from '@/server/db'
import { completeOnboarding, saveOnboardingDraft } from '@/server/onboarding'

export const REAL_POSTGRES = process.env.TEST_DB_KIND === 'postgres'

const TABLES = [
  'EmailRateLimit',
  'IdempotencyKey',
  'MasteryEvent',
  'Attempt',
  'ExerciseVersion',
  'Level',
  'Plan',
  'Puppy',
  'session',
  'account',
  'verification',
  'user',
]

export async function resetDatabase() {
  await prisma.$executeRawUnsafe(`TRUNCATE ${TABLES.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`)
}

export async function createUser(email = `owner-${randomUUID()}@example.test`) {
  return prisma.user.create({ data: { id: randomUUID(), name: 'Test', email, emailVerified: true } })
}

export const FULL_ANSWERS = {
  name: 'לוקה',
  age: '10-16w',
  skills: ['name'],
  difficulties: ['biting'],
  limitations: '',
  time: '10',
} as const

export async function onboard(userId: string) {
  await saveOnboardingDraft(userId, { step: 4, answers: { ...FULL_ANSWERS, skills: [...FULL_ANSWERS.skills], difficulties: [...FULL_ANSWERS.difficulties] } })
  return completeOnboarding(userId)
}

export async function planFor(userId: string) {
  return prisma.plan.findFirstOrThrow({
    where: { puppy: { ownerId: userId } },
    include: { levels: { orderBy: { position: 'asc' } } },
  })
}

export const key = () => `key-${randomUUID()}`
