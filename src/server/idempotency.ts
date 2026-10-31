import { createHash } from 'node:crypto'
import { AppError } from './errors'
import type { Tx } from './db'

/** Stable JSON: object keys sorted, so equal payloads always hash equally. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1))
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

export function hashPayload(payload: unknown): string {
  return createHash('sha256').update(canonical(payload)).digest('hex')
}

export type IdempotencyScope = {
  userId: string
  /** e.g. "attempt.record" or "mastery.confirm". Keys never collide across operations. */
  operation: string
  key: string
  payload: unknown
}

/**
 * Runs `run` at most once per (user, operation, key).
 *
 * Call it inside a transaction that already holds the row lock for the resource being mutated
 * (SELECT ... FOR UPDATE), so concurrent retries are serialized: the second caller waits, then
 * finds the saved row. The saved response commits atomically with the mutation, and a retry
 * returns it unchanged even after the plan has moved on. Reusing a key with a different payload
 * is rejected.
 */
export async function withIdempotency<T extends object>(tx: Tx, scope: IdempotencyScope, run: () => Promise<T>): Promise<T> {
  const requestHash = hashPayload(scope.payload)
  const existing = await tx.idempotencyKey.findUnique({
    where: { userId_operation_key: { userId: scope.userId, operation: scope.operation, key: scope.key } },
  })
  if (existing) {
    if (existing.requestHash !== requestHash) throw new AppError('IDEMPOTENCY_MISMATCH')
    return existing.responseJson as T
  }
  const result = await run()
  await tx.idempotencyKey.create({
    data: {
      userId: scope.userId,
      operation: scope.operation,
      key: scope.key,
      requestHash,
      responseJson: result,
    },
  })
  return result
}
