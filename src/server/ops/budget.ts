import { createHash } from 'node:crypto'
import { aiLimits } from '../ai/config'
import { prisma } from '../db'

/**
 * Key of the system-wide 'ai-calls' counter of one UTC day. quota.ts keeps its keyOf private, so the formula is repeated
 * here; an integration test takes real units with takeCallUnit and compares, so a drift fails the suite.
 */
export const aiCallsKey = (utcDay: string) => createHash('sha256').update(`ai-calls\nall\n${utcDay}`).digest('hex')

/** Today's (UTC) provider-call count, 0 when no unit was taken yet. */
export async function aiCallsToday(utcDay: string): Promise<number> {
  const rows = await prisma.$queryRaw<{ count: number }[]>`SELECT "count" FROM "AiUsageDay" WHERE "key" = ${aiCallsKey(utcDay)}`
  return rows[0]?.count ?? 0
}

export const aiDailyCallsMax = () => aiLimits().providerCallsPerDay
