import { randomUUID } from 'node:crypto'
import { Prisma, type GenerationKind, type GenerationStatus } from '@/generated/prisma/client'
import { prisma, type Tx } from '../db'
import { AppError } from '../errors'
import { aiConfig, aiLimits, operationPlan, PERSIST_RESERVE_MS, type ActiveAiConfig } from './config'
import { POLICY_VERSION, PROMPT_VERSION } from './prompts'
import { AiProviderError, generate, type GenerateRequest } from './provider'
import { chargeDay, pruneAiUsage, refundRequestUnit, takeCallUnit, takeRequestUnit } from './quota'

/** One automatic retry: at most two provider attempts per job, counted in the database across workers. */
export const MAX_ATTEMPTS = 2
const PAYLOAD_RETENTION_DAYS = 30

/** Bounds of the short transaction that commits a result (persistence is part of the operation deadline). */
export const COMMIT_TX = { maxWait: 10_000, timeout: 20_000 } as const

/** The database clock as a naive UTC timestamp, which is how Prisma stores every timestamp column. */
const NOW = Prisma.sql`(CURRENT_TIMESTAMP AT TIME ZONE 'UTC')`
const inMs = (ms: number) => Prisma.sql`${NOW} + (${ms} * INTERVAL '1 millisecond')`

/**
 * A worker's claim on one generation job: the job, the fencing token (generation) it holds, and the deadline of
 * its operation. Everything that writes for the job re-checks the token, so a worker that lost ownership (its
 * lease expired and another worker reclaimed the job) can neither commit nor change the job.
 */
export type JobHandle = {
  jobId: string
  userId: string
  generation: number
  config: ActiveAiConfig
  plan: ReturnType<typeof operationPlan>
  /** Wall-clock end of this worker's operation (attempts, retry delay, validation and persistence). */
  deadlineAt: number
  /** True when this worker took over an expired job of the same request instead of starting a new one. */
  resumed: boolean
}

const isUniqueViolation = (error: unknown) => {
  const e = error as { code?: string; message?: string; meta?: unknown } | null
  if (e?.code === 'P2002') return true
  const text = `${e?.message ?? ''} ${JSON.stringify(e?.meta ?? {})}`
  return /23505|one_pending_per_puppy|unique constraint/i.test(text)
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Starts (or takes over) the generation job of a request. Nothing here talks to the provider and no transaction is
 * held open. The request is identified by (puppy, kind, idempotencyKey):
 *  1. An expired job of the same request that still has attempts left is taken over, atomically, with a higher
 *     generation. Its request unit was already charged, so nothing is charged again.
 *  2. Any other expired job of the puppy is dead: it is closed and its unit given back once.
 *  3. Otherwise a new job is inserted. The partial unique index allows one PENDING job per puppy, so an active job
 *     (valid lease) answers GENERATION_PENDING without any provider call or quota charge.
 *  4. Only then is the account's daily request unit taken (atomic, shared by all instances).
 */
export async function startJob(params: {
  kind: GenerationKind
  puppyId: string
  userId: string
  expectedRevision: number
  idempotencyKey: string
}): Promise<JobHandle> {
  const config = aiConfig()
  if (config.kind === 'none') throw new AppError('AI_UNAVAILABLE')
  const plan = operationPlan(config.timeoutMs)
  const handle = (jobId: string, generation: number, resumed: boolean): JobHandle => ({
    jobId,
    userId: params.userId,
    generation,
    config,
    plan,
    deadlineAt: Date.now() + plan.deadlineMs,
    resumed,
  })

  const taken = await prisma.$queryRaw<{ id: string; generation: number }[]>`
    UPDATE "GenerationJob"
    SET "generation" = "generation" + 1, "leaseExpiresAt" = ${inMs(plan.leaseMs)}
    WHERE "puppyId" = ${params.puppyId}::uuid AND "status" = 'PENDING' AND "leaseExpiresAt" <= ${NOW}
      AND "idempotencyKey" = ${params.idempotencyKey} AND "kind" = ${params.kind}::"GenerationKind"
      AND "attempts" < ${MAX_ATTEMPTS}
    RETURNING "id", "generation"`
  if (taken[0]) return handle(taken[0].id, taken[0].generation, true)

  const dead = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE "GenerationJob"
    SET "status" = 'FAILED', "errorCode" = 'lease-expired', "finishedAt" = ${NOW}
    WHERE "puppyId" = ${params.puppyId}::uuid AND "status" = 'PENDING' AND "leaseExpiresAt" <= ${NOW}
    RETURNING "id"`
  for (const row of dead) await refundJobUnitOnce(row.id)

  const jobId = randomUUID()
  try {
    await prisma.$executeRaw`
      INSERT INTO "GenerationJob" ("id", "puppyId", "kind", "status", "expectedRevision", "promptVersion", "policyVersion",
        "model", "attempts", "createdAt", "ownerId", "idempotencyKey", "generation", "leaseExpiresAt")
      VALUES (${jobId}::uuid, ${params.puppyId}::uuid, ${params.kind}::"GenerationKind", 'PENDING', ${params.expectedRevision},
        ${PROMPT_VERSION}, ${POLICY_VERSION}, ${config.model}, 0, ${NOW}, ${params.userId}, ${params.idempotencyKey}, 1,
        ${inMs(plan.leaseMs)})`
  } catch (error) {
    if (isUniqueViolation(error)) throw new AppError('GENERATION_PENDING')
    throw error
  }

  const day = chargeDay()
  if (!(await takeRequestUnit(params.userId, aiLimits().requestsPerAccountPerDay, day))) {
    await finishJob({ jobId, generation: 1 }, 'FAILED', { errorCode: 'quota-account' }) // nothing was charged: no refund
    throw new AppError('AI_QUOTA_EXCEEDED')
  }
  await prisma.generationJob.update({ where: { id: jobId }, data: { quotaChargedDay: new Date(day) } })
  // Housekeeping stays off the critical path of correctness.
  void Promise.all([pruneAiUsage(), pruneJobPayloads()]).catch(() => undefined)
  return handle(jobId, 1, false)
}

/**
 * Closes the job if this worker still owns it (and it is still PENDING). Returns whether it did, so that only the
 * owner ever follows up with a refund.
 */
export async function finishJob(
  job: { jobId: string; generation?: number },
  status: Exclude<GenerationStatus, 'PENDING'>,
  extra: { errorCode?: string; payload?: unknown } = {},
  tx: Tx | typeof prisma = prisma,
): Promise<boolean> {
  const result = await tx.generationJob.updateMany({
    where: { id: job.jobId, status: 'PENDING', ...(job.generation === undefined ? {} : { generation: job.generation }) },
    data: {
      status,
      errorCode: extra.errorCode ?? null,
      payloadJson: extra.payload === undefined ? undefined : (extra.payload as Prisma.InputJsonValue),
      finishedAt: new Date(),
    },
  })
  return result.count > 0
}

/**
 * Gives the account's request unit back for a job that ended without a committed result, AT MOST ONCE per job:
 * the claim is one conditional UPDATE (only a closed, uncommitted, charged and not yet refunded job matches), so
 * any number of concurrent or repeated callers, including a late worker, produce one refund. Only the account's
 * request unit is returned; the provider-call units of the global budget are never refunded.
 */
export async function refundJobUnitOnce(jobId: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ ownerId: string; day: string }[]>`
    UPDATE "GenerationJob" SET "quotaRefundedAt" = ${NOW}
    WHERE "id" = ${jobId}::uuid AND "quotaChargedDay" IS NOT NULL AND "quotaRefundedAt" IS NULL
      AND "status" NOT IN ('PENDING', 'SUCCEEDED')
    RETURNING "ownerId", to_char("quotaChargedDay", 'YYYY-MM-DD') AS "day"`
  const claimed = rows[0]
  if (!claimed) return false
  await refundRequestUnit(claimed.ownerId, claimed.day)
  return true
}

/** Closes a job without a result (failure, rejection, stale) and gives its request unit back once. Owner only. */
export async function settleWithoutResult(
  job: { jobId: string; generation: number },
  status: Exclude<GenerationStatus, 'PENDING' | 'SUCCEEDED'>,
  extra: { errorCode?: string; payload?: unknown } = {},
): Promise<boolean> {
  const changed = await finishJob(job, status, extra)
  if (changed) await refundJobUnitOnce(job.jobId)
  return changed
}

/**
 * Called first inside every transaction that commits a result. It renews the lease and takes the job row lock in
 * one UPDATE that only matches while this worker still holds the current generation and the lease is live. When it
 * matches nothing, ownership was lost (the job was reclaimed, closed or its lease ran out): nothing may be
 * committed, and the caller's HTTP request answers "pending" so the client asks again with the same key.
 * The row lock is held to the end of the transaction, so a reclaim cannot slip in between check and commit.
 */
export async function fenceJob(tx: Tx, job: JobHandle) {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    UPDATE "GenerationJob" SET "leaseExpiresAt" = ${inMs(job.plan.leaseMs)}
    WHERE "id" = ${job.jobId}::uuid AND "generation" = ${job.generation} AND "status" = 'PENDING' AND "leaseExpiresAt" > ${NOW}
    RETURNING "id"`
  if (rows.length === 0) throw new AppError('GENERATION_PENDING')
}

/** Failed-job payloads (candidate outputs, which can echo owner text) are kept 30 days. */
export async function pruneJobPayloads() {
  await prisma.$executeRaw`
    UPDATE "GenerationJob" SET "payloadJson" = NULL
    WHERE "payloadJson" IS NOT NULL AND "createdAt" < ${NOW} - (${PAYLOAD_RETENTION_DAYS} * INTERVAL '1 day')`
}

/**
 * Takes the next provider attempt of the job and renews the lease in one UPDATE. The attempt is counted in the
 * database BEFORE the call, so a worker that dies during the call still counts it and the two-attempt maximum holds
 * across workers. Returns the attempt number (1 or 2).
 */
export async function claimAttempt(job: JobHandle): Promise<number> {
  const rows = await prisma.$queryRaw<{ attempts: number }[]>`
    UPDATE "GenerationJob" SET "attempts" = "attempts" + 1, "leaseExpiresAt" = ${inMs(job.plan.leaseMs)}
    WHERE "id" = ${job.jobId}::uuid AND "generation" = ${job.generation} AND "status" = 'PENDING'
      AND "leaseExpiresAt" > ${NOW} AND "attempts" < ${MAX_ATTEMPTS}
    RETURNING "attempts"`
  if (rows[0]) return rows[0].attempts

  const state = await prisma.$queryRaw<{ attempts: number }[]>`
    SELECT "attempts" FROM "GenerationJob"
    WHERE "id" = ${job.jobId}::uuid AND "generation" = ${job.generation} AND "status" = 'PENDING' AND "leaseExpiresAt" > ${NOW}`
  if (state[0]) {
    // Still ours, but both attempts are used (a reclaimed job whose previous worker used them).
    await settleWithoutResult(job, 'FAILED', { errorCode: 'attempts-exhausted' })
    throw new AppError('GENERATION_FAILED')
  }
  throw new AppError('GENERATION_PENDING') // ownership lost
}

async function addUsage(job: JobHandle, usage: { inputTokens: number; outputTokens: number; latencyMs: number }) {
  await prisma.$executeRaw`
    UPDATE "GenerationJob"
    SET "inputTokens" = COALESCE("inputTokens", 0) + ${usage.inputTokens}, "outputTokens" = COALESCE("outputTokens", 0) + ${usage.outputTokens},
        "latencyMs" = COALESCE("latencyMs", 0) + ${usage.latencyMs}
    WHERE "id" = ${job.jobId}::uuid AND "generation" = ${job.generation} AND "status" = 'PENDING'`
}

/** `issues` are validator labels only (no owner text, no candidate text), so they are safe to send back to the model on the retry. */
export type Parsed<T> = { ok: true; data: T } | { ok: false; reason: string; issues?: string[] }

/**
 * Calls the provider (outside any transaction), parses and validates the answer, and retries once on a provider
 * failure or an invalid candidate, within the operation deadline. Per attempt: a provider-call unit of the global
 * daily budget (never refunded, so timeouts and lost responses stay charged), then the attempt is claimed in the
 * database (which also renews the lease), then the call is made with the SDK's own retries off. Leaves the job
 * PENDING on success so the caller can mark it SUCCEEDED in the transaction that commits the result; any failure
 * closes the job, gives the account's request unit back once, and throws.
 */
export async function runJob<T>(
  job: JobHandle,
  request: GenerateRequest,
  parse: (json: unknown) => Parsed<T>,
): Promise<T> {
  const minAttemptMs = Math.min(5_000, Math.floor(job.plan.attemptTimeoutMs / 2))
  const remainingMs = () => job.deadlineAt - Date.now() - PERSIST_RESERVE_MS
  let providerFailure: AiProviderError | null = null
  let candidate: unknown = undefined
  let feedback = ''

  try {
    for (;;) {
      if (remainingMs() < minAttemptMs) {
        await settleWithoutResult(job, 'FAILED', { errorCode: 'deadline' })
        throw new AppError('GENERATION_FAILED')
      }
      if (!(await takeCallUnit(aiLimits().providerCallsPerDay))) {
        await settleWithoutResult(job, 'FAILED', { errorCode: 'quota-calls' })
        console.error(`[ai] generation ${request.kind} stopped: daily provider call budget reached`)
        throw new AppError('AI_QUOTA_EXCEEDED')
      }
      const attempt = await claimAttempt(job)
      if (attempt > 1) await sleep(Math.max(0, Math.min(job.plan.retryDelayMs, remainingMs() - minAttemptMs)))
      const timeoutMs = Math.max(minAttemptMs, Math.min(job.plan.attemptTimeoutMs, remainingMs()))

      try {
        const result = await generate(
          { ...job.config, timeoutMs },
          feedback
            ? {
                ...request,
                system: `${request.system}\n\nYour previous answer was rejected because: ${feedback}. Fix every point and answer again.`,
              }
            : request,
        )
        await addUsage(job, {
          inputTokens: result.inputTokens ?? 0,
          outputTokens: result.outputTokens ?? 0,
          latencyMs: result.latencyMs,
        })
        const parsed = parse(result.json)
        if (parsed.ok) return parsed.data
        providerFailure = null
        candidate = result.json
        feedback = (parsed.issues ?? []).slice(0, 8).join('; ')
      } catch (error) {
        if (!(error instanceof AiProviderError)) throw error
        providerFailure = error
        if (!error.retryable) break
      }
      if (attempt >= MAX_ATTEMPTS) break
    }
  } catch (error) {
    if (error instanceof AppError) throw error
    await settleWithoutResult(job, 'FAILED', { errorCode: 'internal' }) // a bug: do not leave the job to expire
    throw error
  }

  const rejected = providerFailure === null
  const errorCode = providerFailure === null ? 'rejected' : (providerFailure as AiProviderError).message.slice(0, 80)
  await settleWithoutResult(job, rejected ? 'REJECTED' : 'FAILED', { errorCode, payload: rejected ? candidate : undefined })
  console.error(`[ai] generation ${request.kind} ${rejected ? 'rejected' : 'failed'}: ${errorCode}`)
  throw new AppError('GENERATION_FAILED')
}
