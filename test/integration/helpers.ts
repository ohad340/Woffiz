import { randomUUID } from 'node:crypto'
import { prisma } from '@/server/db'
import { completeOnboarding, saveOnboardingDraft } from '@/server/onboarding'

export const REAL_POSTGRES = process.env.TEST_DB_KIND === 'postgres'

const TABLES = [
  'EmailRateLimit',
  'AiUsageDay',
  'GenerationJob',
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

// ----- Generation job helpers (leases, fencing, refunds) -----

type JobStatus = 'PENDING' | 'SUCCEEDED' | 'FAILED' | 'REJECTED' | 'STALE'

/**
 * Inserts a generation job directly. leaseSeconds is relative to the database clock (negative = already expired);
 * chargedDay marks the UTC day whose request counter the job was charged to (null = never charged).
 */
export async function insertJob(o: {
  puppyId: string
  ownerId: string
  kind?: 'INITIAL_PLAN' | 'ADAPT_CURRENT' | 'REVISE_FUTURE'
  key?: string
  status?: JobStatus
  leaseSeconds?: number
  attempts?: number
  generation?: number
  chargedDay?: string | null
  expectedRevision?: number
}): Promise<string> {
  const id = randomUUID()
  await prisma.$executeRaw`
    INSERT INTO "GenerationJob" ("id", "puppyId", "kind", "status", "expectedRevision", "promptVersion", "policyVersion", "model",
      "attempts", "createdAt", "ownerId", "idempotencyKey", "generation", "leaseExpiresAt", "quotaChargedDay")
    VALUES (${id}::uuid, ${o.puppyId}::uuid, ${o.kind ?? 'INITIAL_PLAN'}::"GenerationKind", ${o.status ?? 'PENDING'}::"GenerationStatus",
      ${o.expectedRevision ?? 0}, 'p', 'p', 'fake', ${o.attempts ?? 0}, (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'), ${o.ownerId},
      ${o.key ?? `key-${id}`}, ${o.generation ?? 1},
      (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') + (${o.leaseSeconds ?? 120} * INTERVAL '1 second'), ${o.chargedDay ?? null}::date)`
  return id
}

/** Makes the job's lease already expired (the worker holding it is now "late"). */
export async function expireLease(jobId: string) {
  await prisma.$executeRaw`
    UPDATE "GenerationJob" SET "leaseExpiresAt" = (CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - INTERVAL '1 second' WHERE "id" = ${jobId}::uuid`
}

const utcToday = () => new Date().toISOString().slice(0, 10)

/** Current value of one daily counter ('ai-request' per account, 'ai-calls' for the system), 0 when absent. */
export async function usageCount(scope: 'ai-request' | 'ai-calls', subject: string, day = utcToday()) {
  const { createHash } = await import('node:crypto')
  const key = createHash('sha256').update(`${scope}\n${subject}\n${day}`).digest('hex')
  return (await prisma.aiUsageDay.findUnique({ where: { key } }))?.count ?? 0
}

export async function puppyOf(userId: string) {
  return prisma.puppy.findUniqueOrThrow({ where: { ownerId: userId } })
}
