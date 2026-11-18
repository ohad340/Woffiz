// Purge of never-verified accounts (docs/DECISIONS.md P4-6, O8-O9; owner decision F3: 14 days after creation).
// Deletes only when NEVER_VERIFIED_PURGE is exactly "on"; otherwise it only counts. account-deletion.ts is not shared.
import { deleteRequestUnits } from '../ai/quota'
import { prisma } from '../db'
import { utcTs } from '../ops/time'
import { NEVER_VERIFIED_DAYS, PURGE_BATCH } from './retention'

export type PurgeResult = { mode: 'delete' | 'dry-run'; eligible: number; deleted: number; skipped: number; legacyWithData: number }

/** Raised when the final user DELETE does not remove exactly one row: the account transaction rolls back. */
export class PurgeLostRow extends Error {
  constructor() {
    super('PurgeLostRow')
    this.name = 'PurgeLostRow'
  }
}

const PER_ACCOUNT_TX = { maxWait: 5_000, timeout: 5_000 } as const

/**
 * Eligible: emailVerified = false, role OWNER, created more than 14 days ago, no Puppy row and no unexpired session.
 * Legacy unverified accounts that hold data (a puppy) are never purged; they are counted for the owner.
 * Each account is deleted in its own short transaction that first locks the user row with SKIP LOCKED (never waits),
 * re-checks the conditions under the lock, deletes the dependent rows and then the user row, which must be exactly one.
 * `afterLock` is the test seam of the required concurrency case 2 (runs under the lock); it is never read from the environment.
 */
export async function purgeNeverVerified({
  now = new Date(),
  enabled = process.env.NEVER_VERIFIED_PURGE === 'on',
  limit = PURGE_BATCH,
  afterLock,
}: { now?: Date; enabled?: boolean; limit?: number; afterLock?: (userId: string) => Promise<void> } = {}): Promise<PurgeResult> {
  const cutoff = utcTs(new Date(now.getTime() - NEVER_VERIFIED_DAYS * 86_400_000))
  const at = utcTs(now)
  const candidates = await prisma.$queryRaw<{ id: string }[]>`
    SELECT u.id FROM "user" u
    WHERE u."emailVerified" = false AND u.role = 'OWNER' AND u."createdAt" < ${cutoff}
      AND NOT EXISTS (SELECT 1 FROM "Puppy" p WHERE p."ownerId" = u.id)
      AND NOT EXISTS (SELECT 1 FROM "session" s WHERE s."userId" = u.id AND s."expiresAt" > ${at})
    ORDER BY u."createdAt" LIMIT ${limit}`
  const [legacy] = await prisma.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n FROM "user" u
    WHERE u."emailVerified" = false AND u.role = 'OWNER' AND EXISTS (SELECT 1 FROM "Puppy" p WHERE p."ownerId" = u.id)`

  const result: PurgeResult = { mode: enabled ? 'delete' : 'dry-run', eligible: candidates.length, deleted: 0, skipped: 0, legacyWithData: legacy?.n ?? 0 }
  if (enabled) {
    for (const { id } of candidates) {
      const deleted = await prisma.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<{ id: string }[]>`
          SELECT u.id FROM "user" u
          WHERE u.id = ${id} AND u."emailVerified" = false AND u.role = 'OWNER' AND u."createdAt" < ${cutoff}
          FOR UPDATE OF u` // SCRATCH N1 (never merged): SKIP LOCKED removed
        if (locked.length === 0) return false // lost to a concurrent writer, or no longer eligible
        await afterLock?.(id)
        const [blockers] = await tx.$queryRaw<{ puppies: number; sessions: number }[]>`
          SELECT (SELECT count(*)::int FROM "Puppy" WHERE "ownerId" = ${id}) AS puppies,
                 (SELECT count(*)::int FROM "session" WHERE "userId" = ${id} AND "expiresAt" > ${at}) AS sessions`
        if (!blockers || blockers.puppies > 0 || blockers.sessions > 0) return false
        await tx.$executeRaw`DELETE FROM "verification" WHERE "value" = ${id}`
        await tx.$executeRaw`DELETE FROM "session" WHERE "userId" = ${id}`
        await tx.$executeRaw`DELETE FROM "account" WHERE "userId" = ${id}`
        await tx.$executeRaw`DELETE FROM "IdempotencyKey" WHERE "userId" = ${id}`
        await deleteRequestUnits(tx, id, now)
        const removed = await tx.$executeRaw`DELETE FROM "user" WHERE "id" = ${id} AND "emailVerified" = false`
        if (removed !== 1) throw new PurgeLostRow()
        return true
      }, PER_ACCOUNT_TX)
      if (deleted) result.deleted++
      else result.skipped++
    }
  }
  console.log(
    `[housekeeping] never-verified: mode=${result.mode} eligible=${result.eligible} deleted=${result.deleted} skipped=${result.skipped} legacyWithData=${result.legacyWithData}`,
  )
  return result
}
