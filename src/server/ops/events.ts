import type { OpsEventKind } from '@/generated/prisma/client'
import { prisma } from '../db'

const RECORD_TIMEOUT_MS = 2_000

/**
 * Records one operational event: a kind and the database time, nothing else (docs/DECISIONS.md P4-6, O4).
 * One INSERT, raced against a 2 s timer. It never throws and never records an event about its own failure:
 * on failure or timeout it logs one fixed line with the kind.
 */
export async function recordOpsEvent(kind: OpsEventKind): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const insert = prisma.$executeRaw`
      INSERT INTO "OpsEvent" ("id", "kind", "createdAt")
      VALUES (gen_random_uuid(), ${kind}::"OpsEventKind", (CURRENT_TIMESTAMP AT TIME ZONE 'UTC'))`
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('timeout')), RECORD_TIMEOUT_MS)
    })
    await Promise.race([insert, timeout])
  } catch {
    console.error(`[ops] event not recorded: ${kind}`)
  } finally {
    clearTimeout(timer)
  }
}
