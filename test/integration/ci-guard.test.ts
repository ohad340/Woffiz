import { describe, expect, it } from 'vitest'
import { REAL_POSTGRES } from './helpers'

// The atomicity and row-locking tests (concurrency.test.ts, ai-limits.test.ts, email-auth.test.ts) are skipped on
// the local PGlite database, and a skipped run is not a pass. CI must therefore run on real PostgreSQL: if the
// workflow ever loses TEST_DB_KIND=postgres, this fails instead of the guarded tests silently being skipped.
describe.runIf(process.env.CI === 'true')('CI runs the PostgreSQL-only tests', () => {
  it('uses a standard PostgreSQL server (TEST_DB_KIND=postgres)', () => {
    expect(REAL_POSTGRES).toBe(true)
  })

  it('does not cap the connection pool, so concurrent requests really use separate connections', () => {
    expect(Number(process.env.DATABASE_POOL_MAX) || undefined).toBeUndefined() // same reading as src/server/db.ts
  })
})
