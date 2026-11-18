import { createHash, timingSafeEqual } from 'node:crypto'

const digest = (value: string) => createHash('sha256').update(value).digest()

/**
 * The cron route's only gate: `Authorization: Bearer <CRON_SECRET>`. An unset or empty secret fails closed. The comparison
 * is constant-time over SHA-256 digests, so neither the value nor its length leaks through timing.
 */
export function authorizeCron(header: string | null | undefined, secret: string | undefined): boolean {
  const expected = secret?.trim()
  if (!expected) return false
  return timingSafeEqual(digest(header ?? ''), digest(`Bearer ${expected}`))
}
