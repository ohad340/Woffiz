import { verifyPassword } from 'better-auth/crypto'
import { getCookies } from 'better-auth/cookies'
import { auth } from './auth'
import { prisma } from './db'
import { COMMIT_TX } from './ai/jobs'
import { deleteRequestUnits } from './ai/quota'
import { takeRateLimit } from './email/rate-limit'
import { AppError } from './errors'

/**
 * Permanent account deletion (Phase 4, slice 4; docs/DECISIONS.md P4-4). The only write path: one interactive
 * transaction removes every owner-scoped row, then every session is gone with it.
 *
 * LOCK ORDER. The real lock graph (explicit locks plus the FOR KEY SHARE locks that foreign-key inserts take) orders
 * every write path of the app as job -> plan -> puppy -> user:
 *  - generation commits take the job row (fenceJob), then the puppy (onboarding) or the plan (adapt, revise);
 *  - progression takes the plan, then inserts rows that key-share the puppy and the user.
 * So deletion locks the account's jobs, then its plans, then the puppy, and deletes the user last. Locking the puppy
 * before the plans would close a cycle with progression (it holds the plan and waits for the puppy): 40P01.
 * A job created after the first job pass whose worker already holds its row would make deletion wait for it while
 * holding the puppy, so right after the puppy lock the jobs are locked again with NOWAIT: deletion never waits for
 * anything while it holds the puppy. On 55P03, 40P01 or 40001 the whole transaction rolls back and is retried (at most
 * 3 attempts, with jitter), then the error propagates (500, nothing deleted).
 *
 * Two foreign keys are RESTRICT (Attempt -> ExerciseVersion, MasteryEvent -> Attempt), so rows are deleted explicitly in
 * dependency order. The shared media tables and the opaque audit ids in them are never touched.
 */

export const DELETE_LIMIT = { scope: 'account-delete', max: 5, windowSeconds: 15 * 60 } as const
export const MAX_ATTEMPTS = 3

/** Optional seams for tests. None of them is used by the default path, and none is read from the environment. */
export type DeletionDeps = {
  /** Runs after the first job-lock pass and the plan locks, before the puppy lock, on every attempt. */
  afterJobLock?: (attempt: number) => Promise<void>
  /** Runs inside the transaction after each delete step ({ step } is the table); throw to inject a failure. */
  afterDelete?: (step: string) => Promise<void>
  /** Called when an attempt is rolled back for a lock conflict and another attempt follows. */
  onRetry?: (reason: string, attempt: number) => void
  maxAttempts?: number
  /** Pause before the next attempt, in milliseconds (default 50-150 ms). */
  jitterMs?: () => number
}

const RETRYABLE = /55P03|40P01|40001|P2034/

/** Lock-not-available, deadlock and serialization failures, however Prisma or the adapter wraps them. */
export function isLockConflict(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const seen = new Set<unknown>()
  const walk = (value: unknown, depth: number): boolean => {
    if (value === null || value === undefined || depth > 5 || seen.has(value)) return false
    if (typeof value === 'string') return RETRYABLE.test(value)
    if (typeof value !== 'object') return false
    seen.add(value)
    const record = value as Record<string, unknown>
    for (const key of ['code', 'originalCode', 'message']) if (typeof record[key] === 'string' && RETRYABLE.test(record[key] as string)) return true
    for (const key of ['meta', 'cause', 'driverAdapterError']) if (walk(record[key], depth + 1)) return true
    return false
  }
  return walk(error, 0)
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function attemptDeletion(userId: string, password: string, attempt: number, deps: DeletionDeps) {
  await prisma.$transaction(async (tx) => {
    // 1. Identity first, before any row lock: scrypt runs while this transaction holds nothing.
    const user = await tx.user.findUnique({ where: { id: userId }, select: { role: true } })
    if (!user) throw new AppError('UNAUTHENTICATED')
    if (user.role === 'ADMIN') throw new AppError('ADMIN_DELETE_BLOCKED')
    const credential = await tx.account.findFirst({ where: { userId, providerId: 'credential' }, select: { password: true } })
    if (!credential?.password || !(await verifyPassword({ hash: credential.password, password }))) throw new AppError('PASSWORD_INCORRECT')

    const puppy = await tx.puppy.findUnique({ where: { ownerId: userId }, select: { id: true } })
    if (puppy) {
      // 2-4. Jobs, plans, puppy, then the jobs again without waiting (see the header).
      await tx.$queryRaw`SELECT "id" FROM "GenerationJob" WHERE "puppyId" = ${puppy.id}::uuid ORDER BY "id" FOR UPDATE`
      await tx.$queryRaw`SELECT "id" FROM "Plan" WHERE "puppyId" = ${puppy.id}::uuid ORDER BY "id" FOR UPDATE`
      await deps.afterJobLock?.(attempt)
      await tx.$queryRaw`SELECT "id" FROM "Puppy" WHERE "ownerId" = ${userId} FOR UPDATE`
      await tx.$queryRaw`SELECT "id" FROM "GenerationJob" WHERE "puppyId" = ${puppy.id}::uuid ORDER BY "id" FOR UPDATE NOWAIT`
    }

    // 5. Deletes, each scoped to this account, in dependency order.
    const step = async (name: string, run: () => Promise<unknown>) => {
      await run()
      await deps.afterDelete?.(name)
    }
    if (puppy) {
      const puppyId = puppy.id
      await step('MasteryEvent', () => tx.masteryEvent.deleteMany({ where: { level: { plan: { puppyId } } } }))
      await step('Attempt', () => tx.attempt.deleteMany({ where: { puppyId } }))
      await step('ExerciseVersion', () => tx.exerciseVersion.deleteMany({ where: { level: { plan: { puppyId } } } }))
      await step('Level', () => tx.level.deleteMany({ where: { plan: { puppyId } } }))
      await step('Plan', () => tx.plan.deleteMany({ where: { puppyId } }))
      await step('GenerationJob', () => tx.generationJob.deleteMany({ where: { puppyId } }))
      await step('Puppy', () => tx.puppy.deleteMany({ where: { id: puppyId } }))
    }
    await step('IdempotencyKey', () => tx.idempotencyKey.deleteMany({ where: { userId } }))
    // A password-reset request stores the user id as the value of its verification row (Better Auth 1.7.14).
    await step('verification', () => tx.verification.deleteMany({ where: { value: userId } }))
    await step('AiUsageDay', () => deleteRequestUnits(tx, userId))
    await step('session', () => tx.session.deleteMany({ where: { userId } }))
    await step('account', () => tx.account.deleteMany({ where: { userId } }))
    // The user goes last; exactly one row must go. Zero means another deletion got there first.
    const removed = await tx.user.deleteMany({ where: { id: userId } })
    if (removed.count !== 1) throw new AppError('UNAUTHENTICATED')
    await deps.afterDelete?.('user')
  }, COMMIT_TX)
}

/**
 * Deletes the signed-in owner's account after checking their current password. The attempt is counted BEFORE the
 * password is checked and outside the retried transaction, so a retry never takes another unit.
 */
export async function deleteAccount(userId: string, password: string, deps: DeletionDeps = {}) {
  if (!(await takeRateLimit(DELETE_LIMIT, userId))) throw new AppError('RATE_LIMITED')
  const max = deps.maxAttempts ?? MAX_ATTEMPTS
  for (let attempt = 1; ; attempt++) {
    try {
      await attemptDeletion(userId, password, attempt, deps)
      return
    } catch (error) {
      if (!isLockConflict(error) || attempt >= max) throw error
      deps.onRetry?.(String((error as { code?: unknown }).code ?? 'lock-conflict'), attempt)
      await sleep(deps.jitterMs?.() ?? 50 + Math.random() * 100)
    }
  }
}

/** True when this account appears in the media audit tables (opaque string ids, never foreign keys). Used by /puppy. */
export async function hasMediaAuditRecords(userId: string): Promise<boolean> {
  const [version, review, suspension] = await Promise.all([
    prisma.mediaVersion.findFirst({ where: { OR: [{ createdById: userId }, { publishedById: userId }, { withdrawnById: userId }] }, select: { id: true } }),
    prisma.mediaReview.findFirst({ where: { reviewerId: userId }, select: { id: true } }),
    prisma.techniqueSuspensionEvent.findFirst({ where: { actorId: userId }, select: { id: true } }),
  ])
  return Boolean(version || review || suspension)
}

type CookieOptions = Parameters<typeof getCookies>[0]

/**
 * The Set-Cookie expiry of the signed-in device, built from Better Auth's own cookie names and attributes (including
 * the __Secure- prefix on HTTPS), the same data its sign-out uses. It does not depend on the session row that the
 * deletion has just removed. `options` defaults to this app's configuration; a test passes another instance's.
 */
export function expiredAuthCookies(options: CookieOptions = auth.options) {
  const { sessionToken, sessionData, dontRememberToken } = getCookies(options)
  return [sessionToken, sessionData, dontRememberToken].map(({ name, attributes }) => ({
    name,
    value: '',
    attributes: {
      path: attributes.path ?? '/',
      httpOnly: attributes.httpOnly ?? true,
      secure: attributes.secure ?? false,
      sameSite: (attributes.sameSite ?? 'lax').toLowerCase() as 'lax' | 'strict' | 'none',
      ...(attributes.domain ? { domain: attributes.domain } : {}),
      maxAge: 0,
    },
  }))
}
