// The daily housekeeping run under a PostgreSQL run lease (docs/DECISIONS.md P4-6, O10).
// One unfinished run at a time (partial unique index "HousekeepingRun_one_unfinished"); an unfinished run older than 15 min is
// closed as abandoned first. Steps are isolated: a failure is recorded, logged as a class only, and the next step runs.
import type { HousekeepingTrigger } from '@/generated/prisma/client'
import { prisma } from '../db'
import { raiseHousekeepingAlert, recordOpsEvent, resolveHousekeepingAlert } from '../ops'
import { MINUTE_MS, minus, utcTs } from '../ops/time'
import { STEPS, STEP_NAMES, type StepName } from './steps'

export type StepStatus = 'ok' | 'failed' | 'skipped'
export type StepRecord = { step: StepName; status: StepStatus; count: number | null; error?: string }
export type HousekeepingResult = { outcome: 'ok' | 'partial'; steps: StepRecord[] } | { outcome: 'already-running' }

const ABANDONED_AFTER_MS = 15 * MINUTE_MS
const DEADLINE_MS = 50_000

/** The error's class only: a Prisma code (P####) or the constructor name. Never a message (it can carry query text). */
function errorClass(error: unknown): string {
  const code = (error as { code?: unknown })?.code
  if (typeof code === 'string' && /^P\d{4}$/.test(code)) return code
  return error instanceof Error ? error.constructor.name : 'unknown'
}

/**
 * Runs every step once. `now` exists for tests (retention cutoffs and run times follow it); `beforeStep` is a test seam that
 * throws to inject a step failure. Neither is read from the environment.
 */
export async function runHousekeeping({
  trigger,
  now = new Date(),
  beforeStep,
}: {
  trigger: HousekeepingTrigger
  now?: Date
  beforeStep?: (step: StepName) => void | Promise<void>
}): Promise<HousekeepingResult> {
  const started = Date.now()
  const at = () => new Date(now.getTime() + (Date.now() - started))

  await prisma.$executeRaw`
    UPDATE "HousekeepingRun" SET "finishedAt" = ${utcTs(now)}, "stepsJson" = jsonb_set("stepsJson", '{outcome}', '"abandoned"')
    WHERE "finishedAt" IS NULL AND "startedAt" < ${utcTs(minus(now, ABANDONED_AFTER_MS))}`
  const [run] = await prisma.$queryRaw<{ id: string }[]>`
    INSERT INTO "HousekeepingRun" ("id", "trigger", "startedAt", "stepsJson")
    VALUES (gen_random_uuid(), ${trigger}::"HousekeepingTrigger", ${utcTs(now)}, '{"v":1,"outcome":"running","steps":[]}'::jsonb)
    ON CONFLICT DO NOTHING
    RETURNING "id"`
  if (!run) return { outcome: 'already-running' }

  const steps: StepRecord[] = []
  for (const step of STEP_NAMES) {
    let record: StepRecord
    if (Date.now() - started > DEADLINE_MS) {
      record = { step, status: 'skipped', count: null }
    } else {
      try {
        await beforeStep?.(step)
        record = { step, status: 'ok', count: await STEPS[step](now) }
      } catch (error) {
        const kind = errorClass(error)
        console.error(`[housekeeping] step ${step} failed: ${kind}`)
        await recordOpsEvent('HOUSEKEEPING_FAILED')
        record = { step, status: 'failed', count: null, error: kind }
      }
    }
    steps.push(record)
    // Appended at once, so an abandoned run keeps its partial record.
    await prisma.$executeRaw`
      UPDATE "HousekeepingRun" SET "stepsJson" = jsonb_set("stepsJson", '{steps}', ("stepsJson" -> 'steps') || ${JSON.stringify([record])}::jsonb)
      WHERE "id" = ${run.id}::uuid`
  }

  const outcome = steps.every((s) => s.status === 'ok') ? 'ok' : 'partial'
  const finished = at()
  await prisma.$executeRaw`
    UPDATE "HousekeepingRun" SET "finishedAt" = ${utcTs(finished)}, "stepsJson" = jsonb_set("stepsJson", '{outcome}', ${JSON.stringify(outcome)}::jsonb)
    WHERE "id" = ${run.id}::uuid`
  if (outcome === 'partial') await raiseHousekeepingAlert(steps.filter((s) => s.status !== 'ok').length, finished)
  else await resolveHousekeepingAlert(finished)
  return { outcome, steps }
}
