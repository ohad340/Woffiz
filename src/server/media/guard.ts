import type { Tx } from '../db'
import { AppError } from '../errors'

/**
 * Suspension guard for progression writes (slice 3D). Called INSIDE the attempt and mastery transactions, after the plan
 * row lock (lock order: plan, then technique state). It takes the technique version's state row FOR SHARE, the row a
 * suspension takes FOR UPDATE, so a suspension either committed first (and the write is refused) or waits until this
 * write has committed. Free-form exercises have no technique and are never paused. History is never touched: a paused
 * exercise simply cannot receive new reports or a mastery confirmation until it is replaced (adapt) or the owner lifts
 * the suspension.
 */
export async function assertGuidanceAvailable(tx: Tx, exercise: { techniqueKey: string | null; techniqueVersion: number | null }) {
  if (!exercise.techniqueKey || exercise.techniqueVersion === null) return
  const rows = await tx.$queryRaw<{ suspendedAt: Date | null }[]>`
    SELECT "suspendedAt" FROM "TechniqueVersionState"
    WHERE "techniqueKey" = ${exercise.techniqueKey} AND "techniqueVersion" = ${exercise.techniqueVersion} FOR SHARE`
  if (rows[0]?.suspendedAt) throw new AppError('GUIDANCE_PAUSED')
}
