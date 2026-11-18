import { randomUUID } from 'node:crypto'
import { createEmailVerificationToken } from 'better-auth/api'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET as authGET } from '@/app/api/auth/[...all]/route'
import { takeRequestUnit } from '@/server/ai/quota'
import { auth } from '@/server/auth'
import { prisma } from '@/server/db'
import { purgeNeverVerified } from '@/server/housekeeping/never-verified'
import { runHousekeeping } from '@/server/housekeeping/run'
import { resetDatabase, usageCount } from './helpers'
import { BASE } from './mail'
import { HOUR, PASSWORD } from './ops-helpers'

// Purge of never-verified accounts (Phase 4, slice 6; docs/DECISIONS.md P4-6, O8-O9, F3 = 14 days). Disposable test accounts only.
beforeEach(resetDatabase)
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

const DAY = 24 * HOUR
const ago = (ms: number) => new Date(Date.now() - ms)

async function account(o: { verified?: boolean; role?: 'OWNER' | 'ADMIN'; age?: number } = {}) {
  return prisma.user.create({
    data: { id: randomUUID(), name: 'בדיקה', email: `nv-${randomUUID()}@example.test`, emailVerified: o.verified ?? false, role: o.role ?? 'OWNER', createdAt: ago(o.age ?? 15 * DAY) },
  })
}

async function session(userId: string, expiresAt: Date) {
  await prisma.session.create({ data: { id: randomUUID(), userId, token: randomUUID(), expiresAt } })
}

describe('never-verified purge', () => {
  it('deletes an eligible account with its verification (value), sessions, accounts, idempotency keys and request units', async () => {
    const user = await account()
    await session(user.id, ago(DAY)) // expired: does not protect
    await prisma.account.create({ data: { id: randomUUID(), accountId: user.id, providerId: 'credential', userId: user.id, password: 'hash' } })
    await prisma.verification.create({ data: { id: randomUUID(), identifier: 'reset-password:x', value: user.id, expiresAt: new Date(Date.now() + HOUR) } })
    await prisma.idempotencyKey.create({ data: { userId: user.id, operation: 'op', key: 'k', requestHash: 'h', responseJson: {} } })
    await takeRequestUnit(user.id, 10)
    const other = await prisma.verification.create({ data: { id: randomUUID(), identifier: 'other', value: 'someone-else', expiresAt: new Date(Date.now() + HOUR) } })

    expect(await purgeNeverVerified({ enabled: true })).toEqual({ mode: 'delete', eligible: 1, deleted: 1, skipped: 0, legacyWithData: 0 })
    expect(await prisma.user.count()).toBe(0)
    expect(await prisma.session.count()).toBe(0)
    expect(await prisma.account.count()).toBe(0)
    expect(await prisma.idempotencyKey.count()).toBe(0)
    expect(await usageCount('ai-request', user.id)).toBe(0)
    expect(await prisma.verification.findMany()).toEqual([other])
  })

  it('does not purge: verified, ADMIN, created 13 days 23 hours ago, has a puppy, has an unexpired session', async () => {
    const verified = await account({ verified: true })
    const admin = await account({ role: 'ADMIN' })
    const recent = await account({ age: 13 * DAY + 23 * HOUR })
    const withPuppy = await account()
    await prisma.puppy.create({ data: { ownerId: withPuppy.id } })
    const signedIn = await account()
    await session(signedIn.id, new Date(Date.now() + DAY))
    const eligible = await account({ age: 14 * DAY + HOUR })

    expect(await purgeNeverVerified({ enabled: true })).toEqual({ mode: 'delete', eligible: 1, deleted: 1, skipped: 0, legacyWithData: 1 })
    const left = (await prisma.user.findMany({ select: { id: true } })).map((u) => u.id).sort()
    expect(left).toEqual([verified.id, admin.id, recent.id, withPuppy.id, signedIn.id].sort())
    expect(left).not.toContain(eligible.id)
  })

  it('dry run (the switch is not exactly "on") deletes nothing and reports the counts', async () => {
    await account()
    await account()
    const legacy = await account()
    await prisma.puppy.create({ data: { ownerId: legacy.id } })
    for (const value of [undefined, '', 'true', 'ON', 'yes']) {
      if (value === undefined) delete process.env.NEVER_VERIFIED_PURGE
      else vi.stubEnv('NEVER_VERIFIED_PURGE', value)
      expect(await purgeNeverVerified()).toEqual({ mode: 'dry-run', eligible: 2, deleted: 0, skipped: 0, legacyWithData: 1 })
    }
    expect(await prisma.user.count()).toBe(3)
    vi.stubEnv('NEVER_VERIFIED_PURGE', 'on')
    expect(await purgeNeverVerified()).toMatchObject({ mode: 'delete', deleted: 2 })
  })

  it('in the housekeeping run: counted and kept with the switch off, deleted with it on; the log line carries counts only', async () => {
    const user = await account()
    const logs = vi.spyOn(console, 'log').mockImplementation(() => {})
    const off = await runHousekeeping({ trigger: 'MANUAL' })
    expect(off.outcome === 'already-running' ? null : off.steps.find((s) => s.step === 'never-verified')).toMatchObject({ status: 'ok', count: 1 })
    expect(await prisma.user.count()).toBe(1)
    vi.stubEnv('NEVER_VERIFIED_PURGE', 'on')
    const on = await runHousekeeping({ trigger: 'MANUAL' })
    expect(on.outcome === 'already-running' ? null : on.steps.find((s) => s.step === 'never-verified')).toMatchObject({ status: 'ok', count: 1 })
    expect(await prisma.user.count()).toBe(0)
    const lines = logs.mock.calls.map((c) => String(c[0])).filter((l) => l.startsWith('[housekeeping]'))
    expect(lines).toEqual([
      '[housekeeping] never-verified: mode=dry-run eligible=1 deleted=0 skipped=0 legacyWithData=0',
      '[housekeeping] never-verified: mode=delete eligible=1 deleted=1 skipped=0 legacyWithData=0',
    ])
    expect(lines.join('\n')).not.toContain(user.email)
  })

  it('inventory guard: every public table is classified for the purge, in both directions', async () => {
    const CLASSIFIED: Record<string, 'deleted' | 'excluded by eligibility' | 'not linked to an account'> = {
      user: 'deleted',
      session: 'deleted',
      account: 'deleted',
      verification: 'deleted',
      IdempotencyKey: 'deleted',
      AiUsageDay: 'deleted', // the account's request keys (deleteRequestUnits); the system counter is not personal
      Puppy: 'excluded by eligibility', // an account with a puppy is never purged
      Plan: 'excluded by eligibility', // every row below belongs to a puppy
      Level: 'excluded by eligibility',
      ExerciseVersion: 'excluded by eligibility',
      Attempt: 'excluded by eligibility',
      MasteryEvent: 'excluded by eligibility',
      GenerationJob: 'excluded by eligibility',
      EmailRateLimit: 'not linked to an account', // hashed keys, pruned within 24 h
      MediaAsset: 'not linked to an account',
      MediaVersion: 'not linked to an account', // ADMIN accounts are never eligible
      MediaReview: 'not linked to an account',
      TechniqueVersionState: 'not linked to an account',
      TechniqueSuspensionEvent: 'not linked to an account',
      OpsEvent: 'not linked to an account',
      OpsAlert: 'not linked to an account',
      HousekeepingRun: 'not linked to an account',
      PilotMetricDay: 'not linked to an account',
    }
    const rows = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations'`
    const actual = rows.map((r) => r.table_name).sort()
    expect(actual.filter((name) => !(name in CLASSIFIED))).toEqual([])
    expect(Object.keys(CLASSIFIED).filter((name) => !actual.includes(name))).toEqual([])
  })

  it('an old verification link after a purge answers the invalid-link redirect with no session, and the person can register again', async () => {
    const email = `old-link-${randomUUID()}@example.test`
    const signUp = () => auth.api.signUpEmail({ body: { email, password: PASSWORD, name: 'בדיקה' } as never, headers: new Headers({ origin: BASE }), asResponse: true })
    expect((await signUp()).status).toBe(200)
    await prisma.user.update({ where: { email }, data: { createdAt: ago(15 * DAY) } })
    const token = await createEmailVerificationToken(process.env.BETTER_AUTH_SECRET!, email, undefined, 3600)
    expect(await purgeNeverVerified({ enabled: true })).toMatchObject({ deleted: 1 })

    const response = await authGET(new Request(`${BASE}/api/auth/verify-email?token=${token}&callbackURL=${encodeURIComponent('/verify-email?verified=1')}`))
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('/verify-email?verified=1&error=USER_NOT_FOUND')
    expect(response.headers.getSetCookie().some((c) => c.includes('session_token'))).toBe(false)
    expect(await prisma.user.count()).toBe(0)
    expect(await prisma.session.count()).toBe(0)

    expect((await signUp()).status).toBe(200) // local open sign-up
    expect(await prisma.user.findUniqueOrThrow({ where: { email } })).toMatchObject({ emailVerified: false })
  })
})
