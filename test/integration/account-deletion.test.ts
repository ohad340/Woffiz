import { createHash, randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST as adaptPOST } from '@/app/api/plan/adapt/route'
import { POST as attemptsPOST } from '@/app/api/attempts/route'
import { POST as authPOST } from '@/app/api/auth/[...all]/route'
import { POST as completePOST } from '@/app/api/onboarding/complete/route'
import { POST as draftPOST } from '@/app/api/onboarding/draft/route'
import { POST as deletePOST } from '@/app/api/account/delete/route'
import { TECHNIQUES } from '@/domain/techniques/catalog'
import { fingerprintTechnique } from '@/domain/techniques/fingerprint'
import type { TechniqueDefinition } from '@/domain/techniques/types'
import { deleteAccount, expiredAuthCookies, hasMediaAuditRecords, isLockConflict } from '@/server/account-deletion'
import { takeRequestUnit } from '@/server/ai/quota'
import { auth } from '@/server/auth'
import { prisma, type Tx } from '@/server/db'
import { AppError } from '@/server/errors'
import { postRoute, sessionUserDeleted } from '@/server/http'
import { CHECKLISTS } from '@/server/media/gates'
import { ingestBundle } from '@/server/media/ingest'
import { markReviewed, publish, submitReview, suspendTechnique } from '@/server/media/lifecycle'
import { LocalMediaStore } from '@/server/media/store'
import { completeOnboarding, saveOnboardingDraft } from '@/server/onboarding'
import { confirmMastery, recordAttempt } from '@/server/progress'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { validBundleInput } from '../media/fixtures'
import { BASE, cookieFrom, jsonPost } from './mail'
import { FULL_ANSWERS, REAL_POSTGRES, insertJob, key, onboard, planFor, puppyOf, resetDatabase, usageCount } from './helpers'

// Account deletion (Phase 4, slice 4; docs/DECISIONS.md P4-4). Only disposable accounts on the dedicated test database.
// Delivery is mocked: these tests are about accounts, locks and rows (email flows: email-auth.test.ts).
vi.mock('@/server/email/transport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/email/transport')>()),
  deliver: vi.fn(async () => {}),
}))

beforeEach(resetDatabase)
afterEach(() => {
  vi.unstubAllEnvs()
  delete process.env.AI_FAKE_MODE
  delete process.env.MEDIA_REQUIRED
})

const PASSWORD = 'correct horse battery'
const headers = () => new Headers({ origin: BASE })
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function signIn(email: string, instance = auth, origin = BASE) {
  const response = await instance.api.signInEmail({ body: { email, password: PASSWORD }, headers: new Headers({ origin }), asResponse: true })
  return cookieFrom(response)
}

/** A verified owner with a password and two signed-in sessions (two devices). */
async function makeOwner(label = 'owner') {
  const email = `${label}-${randomUUID()}@example.test`
  const signUp = await auth.api.signUpEmail({ body: { email, password: PASSWORD, name: 'בדיקה' } as never, headers: headers(), asResponse: true })
  expect(signUp.status).toBe(200)
  const user = await prisma.user.update({ where: { email }, data: { emailVerified: true } })
  return { id: user.id, email, cookies: [await signIn(email), await signIn(email)] as [string, string] }
}
type Owner = Awaited<ReturnType<typeof makeOwner>>

const sessionFor = (cookie: string) => auth.api.getSession({ headers: new Headers({ cookie }) })

const del = (cookie: string | undefined, body: unknown = { password: PASSWORD }, extra: Record<string, string> = {}) =>
  deletePOST(jsonPost('/api/account/delete', body, { ...(cookie ? { cookie } : {}), ...extra }))

async function draft(userId: string) {
  await saveOnboardingDraft(userId, { step: 4, answers: { ...FULL_ANSWERS, skills: [...FULL_ANSWERS.skills], difficulties: [...FULL_ANSWERS.difficulties] } })
}

/**
 * Fills every owner table for this account: profile, plan with a completed level (mastery), the current level and locked
 * levels, current and review attempts, idempotency keys, a failed job with a stored payload, a real password-reset token,
 * today's request counter (taken by the onboarding itself) and, through makeOwner, two sessions.
 */
async function populate(owner: Owner) {
  await onboard(owner.id)
  const plan = await planFor(owner.id)
  const first = plan.levels[0]!
  const attempt = await recordAttempt(owner.id, { levelId: first.id, outcome: 'INDEPENDENT', idempotencyKey: key() })
  await confirmMastery(owner.id, { levelId: first.id, attemptId: attempt.attemptId, criterionVersion: attempt.criterionVersion, planRevision: plan.revision, idempotencyKey: key() })
  await recordAttempt(owner.id, { levelId: first.id, outcome: 'WITH_HELP', idempotencyKey: key() }) // a REVIEW attempt on the completed level
  const current = (await planFor(owner.id)).levels.find((level) => level.state === 'CURRENT')!
  await recordAttempt(owner.id, { levelId: current.id, outcome: 'STRUGGLING', idempotencyKey: key() })
  const puppy = await puppyOf(owner.id)
  const jobId = await insertJob({ puppyId: puppy.id, ownerId: owner.id, status: 'FAILED' })
  await prisma.generationJob.update({ where: { id: jobId }, data: { payloadJson: { candidate: 'text that can echo owner input' } } })
  const reset = await authPOST(jsonPost('/api/auth/request-password-reset', { email: owner.email, redirectTo: '/reset-password' }))
  expect(reset.status).toBe(200)
  return { puppy, plan }
}

/** Ids that tie an account's rows together; read BEFORE the deletion because the rows that carry them go away. */
async function idsOf(userId: string) {
  const puppy = await prisma.puppy.findUnique({ where: { ownerId: userId } })
  const plans = puppy ? await prisma.plan.findMany({ where: { puppyId: puppy.id }, select: { id: true } }) : []
  const levels = await prisma.level.findMany({ where: { planId: { in: plans.map((p) => p.id) } }, select: { id: true } })
  return { puppyId: puppy?.id ?? null, planIds: plans.map((p) => p.id), levelIds: levels.map((l) => l.id) }
}

/** One scoped count per inventory table (the deleted ones). */
async function ownerCounts(userId: string, ids: Awaited<ReturnType<typeof idsOf>>) {
  const puppyId = ids.puppyId ?? '00000000-0000-0000-0000-000000000000'
  return {
    user: await prisma.user.count({ where: { id: userId } }),
    session: await prisma.session.count({ where: { userId } }),
    account: await prisma.account.count({ where: { userId } }),
    verification: await prisma.verification.count({ where: { value: userId } }),
    Puppy: await prisma.puppy.count({ where: { OR: [{ id: puppyId }, { ownerId: userId }] } }),
    Plan: await prisma.plan.count({ where: { OR: [{ puppyId }, { id: { in: ids.planIds } }] } }),
    Level: await prisma.level.count({ where: { id: { in: ids.levelIds } } }),
    ExerciseVersion: await prisma.exerciseVersion.count({ where: { levelId: { in: ids.levelIds } } }),
    Attempt: await prisma.attempt.count({ where: { puppyId } }),
    MasteryEvent: await prisma.masteryEvent.count({ where: { levelId: { in: ids.levelIds } } }),
    GenerationJob: await prisma.generationJob.count({ where: { OR: [{ puppyId }, { ownerId: userId }] } }),
    IdempotencyKey: await prisma.idempotencyKey.count({ where: { userId } }),
    AiUsageDay: await usageCount('ai-request', userId),
  }
}
const ZERO = { user: 0, session: 0, account: 0, verification: 0, Puppy: 0, Plan: 0, Level: 0, ExerciseVersion: 0, Attempt: 0, MasteryEvent: 0, GenerationJob: 0, IdempotencyKey: 0, AiUsageDay: 0 }

/** Every owner-scoped row of the account as ORDER BY id JSON, for byte-for-byte comparisons. */
async function ownerSnapshot(userId: string) {
  const owned = { puppy: { ownerId: userId } }
  return JSON.stringify({
    user: await prisma.user.findMany({ where: { id: userId } }),
    sessions: await prisma.session.findMany({ where: { userId }, orderBy: { id: 'asc' } }),
    accounts: await prisma.account.findMany({ where: { userId }, orderBy: { id: 'asc' } }),
    verification: await prisma.verification.findMany({ where: { value: userId }, orderBy: { id: 'asc' } }),
    puppy: await prisma.puppy.findMany({ where: { ownerId: userId } }),
    plans: await prisma.plan.findMany({ where: owned, orderBy: { id: 'asc' } }),
    levels: await prisma.level.findMany({ where: { plan: owned }, orderBy: { id: 'asc' } }),
    exercises: await prisma.exerciseVersion.findMany({ where: { level: { plan: owned } }, orderBy: { id: 'asc' } }),
    attempts: await prisma.attempt.findMany({ where: owned, orderBy: { id: 'asc' } }),
    mastery: await prisma.masteryEvent.findMany({ where: { level: { plan: owned } }, orderBy: { id: 'asc' } }),
    jobs: await prisma.generationJob.findMany({ where: owned, orderBy: { id: 'asc' } }),
    idempotency: await prisma.idempotencyKey.findMany({ where: { userId }, orderBy: { id: 'asc' } }),
    usage: await usageCount('ai-request', userId),
  })
}

const sharedSnapshot = async () =>
  JSON.stringify({
    assets: await prisma.mediaAsset.findMany({ orderBy: { id: 'asc' } }),
    versions: await prisma.mediaVersion.findMany({ orderBy: { id: 'asc' } }),
    reviews: await prisma.mediaReview.findMany({ orderBy: { id: 'asc' } }),
    states: await prisma.techniqueVersionState.findMany({ orderBy: [{ techniqueKey: 'asc' }, { techniqueVersion: 'asc' }] }),
    events: await prisma.techniqueSuspensionEvent.findMany({ orderBy: { id: 'asc' } }),
  })

// Shared demonstration media with an administrator's audit trail: the real definitions are DRAFT, so approved COPIES with a
// matching lock are injected (as in media-generation.test.ts) and a SYNTHETIC FIXTURE clip is published. No real content.
const approve = (def: TechniqueDefinition): TechniqueDefinition => ({ ...def, review: { status: 'approved', approvedBy: 'test', approvedOn: '2026-11-03' } })
const techniques = TECHNIQUES.map(approve)
const lock = Object.fromEntries(techniques.map((def) => [`${def.key}@${def.version}`, fingerprintTechnique(def)]))
const deps = { techniques, lock }
const mediaDir = mkdtempSync(join(tmpdir(), 'woffiz-deletion-'))
afterAll(() => rmSync(mediaDir, { recursive: true, force: true }))
const store = new LocalMediaStore(mediaDir, 'integration-secret')

async function publishFixtureClip(adminId: string) {
  const { id } = await ingestBundle(validBundleInput(), { fixture: true, adminId, store })
  const { bundleFingerprint } = await prisma.mediaVersion.findUniqueOrThrow({ where: { id } })
  for (const kind of ['TECHNICAL', 'CONTENT'] as const) {
    await submitReview(adminId, id, { kind, decision: 'APPROVED', checklist: Object.fromEntries(CHECKLISTS[kind].map((c) => [c, true])), fingerprint: bundleFingerprint })
  }
  await markReviewed(adminId, id, deps)
  await publish(adminId, id, deps)
  await suspendTechnique(adminId, 'mouthing-redirect-toy', 1, 'audit trail for the deletion test')
}

const post = (route: (request: Request) => Promise<Response>, path: string, body: unknown, cookie: string, extra: Record<string, string> = {}) =>
  route(jsonPost(path, body, { cookie, ...extra }))

describe('account deletion through the route', () => {
  it('removes every owner row of a fully populated account (the RESTRICT keys included) and nothing else is needed', async () => {
    const a = await makeOwner('a')
    await populate(a)
    const ids = await idsOf(a.id)
    const before = await ownerCounts(a.id, ids)
    // Every table is really populated, so a zero afterwards proves a deletion and not an empty fixture.
    for (const [table, count] of Object.entries(before)) expect(count, table).toBeGreaterThan(0)
    expect(before.session).toBe(2)
    expect(before.MasteryEvent).toBeGreaterThan(0)
    const stored = (await prisma.$queryRaw<{ stored: bigint }[]>`SELECT count(*) AS stored FROM "GenerationJob" WHERE "payloadJson" IS NOT NULL`)[0]!.stored
    expect(Number(stored)).toBe(1) // the failed job's stored payload
    expect(await prisma.verification.count({ where: { value: a.id, identifier: { startsWith: 'reset-password:' } } })).toBe(1)

    const response = await del(a.cookies[0])
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ deleted: true })
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(await ownerCounts(a.id, ids)).toEqual(ZERO)
  })

  it('leaves another populated account and the shared media byte for byte unchanged', async () => {
    const admin = await makeOwner('admin')
    await prisma.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } })
    await publishFixtureClip(admin.id)
    const a = await makeOwner('a')
    const b = await makeOwner('b')
    await populate(a)
    await populate(b)
    const [bBefore, sharedBefore, adminBefore] = [await ownerSnapshot(b.id), await sharedSnapshot(), await ownerSnapshot(admin.id)]
    expect(JSON.parse(sharedBefore).versions.length).toBeGreaterThan(0)
    expect(JSON.parse(sharedBefore).reviews.length).toBeGreaterThan(0)
    expect(JSON.parse(sharedBefore).events.length).toBeGreaterThan(0)

    expect((await del(a.cookies[0])).status).toBe(200)
    expect(await ownerSnapshot(b.id)).toBe(bBefore)
    expect(await ownerSnapshot(admin.id)).toBe(adminBefore)
    expect(await sharedSnapshot()).toBe(sharedBefore)
    expect((await sessionFor(b.cookies[0]))?.user.id).toBe(b.id)
  })

  it('deletes only the authenticated account: a body carrying another account id is ignored', async () => {
    const a = await makeOwner('a')
    const b = await makeOwner('b')
    await populate(a)
    await populate(b)
    const aBefore = await ownerSnapshot(a.id)

    const response = await del(b.cookies[0], { password: PASSWORD, userId: a.id, id: a.id, email: a.email, ownerId: a.id })
    expect(response.status).toBe(200)
    expect(await ownerSnapshot(a.id)).toBe(aBefore)
    expect(await prisma.user.count({ where: { id: b.id } })).toBe(0)
    expect(await prisma.user.count({ where: { id: a.id } })).toBe(1)
  })

  it('deletes nothing for unauthenticated, unverified, cross-origin and non-JSON requests', async () => {
    const a = await makeOwner('a')
    await populate(a)
    const snapshot = await ownerSnapshot(a.id)

    expect((await del(undefined)).status).toBe(401)
    expect((await del(a.cookies[0], { password: PASSWORD }, { origin: 'https://evil.example' })).status).toBe(403)
    const text = new Request(`${BASE}/api/account/delete`, { method: 'POST', headers: { 'content-type': 'text/plain', origin: BASE, cookie: a.cookies[0] }, body: PASSWORD })
    expect((await deletePOST(text)).status).toBe(403)
    const noOrigin = new Request(`${BASE}/api/account/delete`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: a.cookies[0] }, body: JSON.stringify({ password: PASSWORD }) })
    expect((await deletePOST(noOrigin)).status).toBe(403)

    expect(await ownerSnapshot(a.id)).toBe(snapshot)

    // A session whose address is not verified (a session from before verification became mandatory).
    const u = await makeOwner('unverified')
    await prisma.user.update({ where: { id: u.id }, data: { emailVerified: false } })
    const unverified = await del(u.cookies[0])
    expect(unverified.status).toBe(403)
    expect((await unverified.json()).error).toBe('EMAIL_NOT_VERIFIED')
    expect(await prisma.user.count({ where: { id: u.id } })).toBe(1)
  })

  it('a wrong password changes nothing and keeps the session; a missing or oversized password is a 400', async () => {
    const a = await makeOwner('a')
    await populate(a)
    const snapshot = await ownerSnapshot(a.id)

    const wrong = await del(a.cookies[0], { password: 'not the password' })
    expect(wrong.status).toBe(422)
    expect((await wrong.json()).error).toBe('PASSWORD_INCORRECT')
    expect((await sessionFor(a.cookies[0]))?.user.id).toBe(a.id)
    expect((await del(a.cookies[0], {})).status).toBe(400)
    expect((await del(a.cookies[0], { password: '' })).status).toBe(400)
    expect((await del(a.cookies[0], { password: 'x'.repeat(129) })).status).toBe(400)
    expect((await del(a.cookies[0], { password: 12345 })).status).toBe(400)
    expect(await ownerSnapshot(a.id)).toBe(snapshot)
  })

  it('takes the rate-limit unit BEFORE verifying the password and refuses after 5 attempts in the window', async () => {
    const a = await makeOwner('a')
    await populate(a)
    const hashed = createHash('sha256').update(`account-delete\n${a.id}`).digest('hex')
    const used = async () => (await prisma.emailRateLimit.findUnique({ where: { key: hashed } }))?.count ?? 0

    expect(await used()).toBe(0)
    expect((await del(a.cookies[0], { password: 'wrong 1' })).status).toBe(422)
    expect(await used()).toBe(1) // moved on a wrong password: the unit is taken before verification
    for (let i = 2; i <= 5; i++) expect((await del(a.cookies[0], { password: `wrong ${i}` })).status).toBe(422)
    const limited = await del(a.cookies[0], { password: PASSWORD }) // even the right password is refused now
    expect(limited.status).toBe(429)
    expect((await limited.json()).error).toBe('RATE_LIMITED')
    expect(await prisma.user.count({ where: { id: a.id } })).toBe(1)
  })

  it('refuses an account whose current role is ADMIN; after revocation it succeeds and the audit rows stay unchanged', async () => {
    const admin = await makeOwner('admin')
    await prisma.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } })
    await publishFixtureClip(admin.id)
    expect(await hasMediaAuditRecords(admin.id)).toBe(true)
    const auditBefore = await sharedSnapshot()

    const refused = await del(admin.cookies[0])
    expect(refused.status).toBe(403)
    expect((await refused.json()).error).toBe('ADMIN_DELETE_BLOCKED')
    expect(await prisma.user.count({ where: { id: admin.id } })).toBe(1)

    await prisma.user.update({ where: { id: admin.id }, data: { role: 'OWNER' } }) // the effect of scripts/grant-admin.ts --revoke
    expect((await del(admin.cookies[0])).status).toBe(200)
    expect(await prisma.user.count({ where: { id: admin.id } })).toBe(0)
    expect(await sharedSnapshot()).toBe(auditBefore)
    expect(await hasMediaAuditRecords(admin.id)).toBe(true) // an opaque id that no account carries any more
    const rows = JSON.parse(auditBefore)
    expect(rows.versions[0].createdById).toBe(admin.id)
  })

  it('ends every session, and the Set-Cookie headers expire the session cookies exactly as Better Auth does', async () => {
    const a = await makeOwner('a')
    const other = await makeOwner('other')
    const response = await del(a.cookies[0])
    expect(response.status).toBe(200)
    expect(await sessionFor(a.cookies[0])).toBeNull()
    expect(await sessionFor(a.cookies[1])).toBeNull() // the second device is signed out too
    expect((await sessionFor(other.cookies[0]))?.user.id).toBe(other.id)

    const mine = parseSetCookies(response)
    expect([...mine.keys()].sort()).toEqual(['better-auth.dont_remember', 'better-auth.session_data', 'better-auth.session_token'])
    for (const attributes of mine.values()) {
      expect(attributes).toMatchObject({ value: '', 'max-age': '0', path: '/', httponly: true, samesite: 'lax' })
      expect(attributes.secure).toBeUndefined() // http base URL
    }

    // Equivalence test: a REAL Better Auth sign-out on another session sets the same names and attributes.
    const real = parseSetCookies(await auth.api.signOut({ headers: new Headers({ cookie: other.cookies[0], origin: BASE }), asResponse: true }))
    expect(real.size).toBeGreaterThan(0)
    for (const [name, attributes] of real) expect(mine.get(name), name).toEqual(attributes)
  })

  it('with an https base URL the cookie names carry __Secure- and Secure, again equal to a real sign-out', async () => {
    vi.stubEnv('BETTER_AUTH_URL', 'https://woffiz.example')
    vi.resetModules()
    const { auth: secure } = await import('@/server/auth')
    expect(secure).not.toBe(auth)
    const origin = 'https://woffiz.example'
    const { email } = await makeOwner('secure') // registered through the app's own (local) instance; sign-up policy depends on the base URL
    const cookie = await signIn(email, secure, origin)
    expect(cookie).toContain('__Secure-better-auth.session_token=')

    const mine = parseSetCookies(expiredCookiesResponse(expiredAuthCookies(secure.options)))
    expect([...mine.keys()].sort()).toEqual(['__Secure-better-auth.dont_remember', '__Secure-better-auth.session_data', '__Secure-better-auth.session_token'])
    for (const attributes of mine.values()) expect(attributes).toMatchObject({ 'max-age': '0', secure: true, httponly: true, samesite: 'lax', path: '/' })
    const real = parseSetCookies(await secure.api.signOut({ headers: new Headers({ cookie, origin }), asResponse: true }))
    expect(real.size).toBeGreaterThan(0)
    for (const [name, attributes] of real) expect(mine.get(name), name).toEqual(attributes)
  })

  it('rolls everything back when a step fails: every row and both sessions stay, and a normal deletion still works', async () => {
    const a = await makeOwner('a')
    await populate(a)
    const ids = await idsOf(a.id)
    const snapshot = await ownerSnapshot(a.id)
    const before = await ownerCounts(a.id, ids)

    for (const step of ['MasteryEvent', 'Attempt', 'GenerationJob', 'Puppy', 'IdempotencyKey', 'AiUsageDay', 'session', 'account']) {
      await expect(
        deleteAccount(a.id, PASSWORD, {
          afterDelete: async (name) => {
            if (name === step) throw new Error(`injected failure after ${name}`)
          },
        }),
      ).rejects.toThrow('injected failure')
      expect(await ownerSnapshot(a.id), step).toBe(snapshot)
      expect(await ownerCounts(a.id, ids), step).toEqual(before)
      expect((await sessionFor(a.cookies[0]))?.user.id).toBe(a.id)
      await prisma.emailRateLimit.deleteMany() // the five-per-window limit is not what is under test here
    }
    expect((await del(a.cookies[0])).status).toBe(200)
    expect(await ownerCounts(a.id, ids)).toEqual(ZERO)
  })

  it('an account that never started onboarding is deleted as well (no puppy, no plan)', async () => {
    const a = await makeOwner('fresh')
    await takeRequestUnit(a.id, 10)
    expect((await del(a.cookies[0])).status).toBe(200)
    expect(await ownerCounts(a.id, await idsOf(a.id))).toEqual(ZERO)
  })

  it('does not touch another account\'s request counter or the system-wide counter', async () => {
    const a = await makeOwner('a')
    const b = await makeOwner('b')
    await takeRequestUnit(a.id, 10)
    await takeRequestUnit(b.id, 10)
    const calls = await prisma.aiUsageDay.count()
    expect((await del(a.cookies[0])).status).toBe(200)
    expect(await usageCount('ai-request', b.id)).toBe(1)
    expect(await prisma.aiUsageDay.count()).toBe(calls - 1)
  })
})

describe('the deleted-account mapping in postRoute (one choke point)', () => {
  it('decides "deleted" only when the session user row is gone; a failing lookup stays "not deleted"', async () => {
    expect(await sessionUserDeleted(undefined)).toBe(false)
    expect(await sessionUserDeleted('u1', async () => true)).toBe(false)
    expect(await sessionUserDeleted('u1', async () => false)).toBe(true)
    expect(await sessionUserDeleted('u1', async () => Promise.reject(new Error('db down')))).toBe(false)
  })

  const handlerThatFails = (deleteUserFirst: boolean) =>
    postRoute(z.object({}), async ({ user }) => {
      if (deleteUserFirst) await prisma.user.delete({ where: { id: user.id } })
      throw new Error('Foreign key constraint violated: secret query text')
    })

  it('answers 401 when the account was deleted while the request ran, and logs only a code', async () => {
    const a = await makeOwner('a')
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const response = await post(handlerThatFails(true), '/x', {}, a.cookies[0])
    expect(response.status).toBe(401)
    expect((await response.json()).error).toBe('UNAUTHENTICATED')
    expect(response.headers.get('cache-control')).toContain('no-store')
    expect(spy).not.toHaveBeenCalled()
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/secret query text|Foreign key/)
    spy.mockRestore()
    warn.mockRestore()
  })

  it('still answers 500 and logs as before when the user is present', async () => {
    const a = await makeOwner('a')
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const response = await post(handlerThatFails(false), '/x', {}, a.cookies[0])
    expect(response.status).toBe(500)
    expect((await response.json()).error).toBe('INTERNAL')
    expect(spy).toHaveBeenCalledTimes(1)
    spy.mockRestore()
  })

  it('keeps AppError answers untouched (a fence answer stays what it was)', async () => {
    const a = await makeOwner('a')
    const route = postRoute(z.object({}), async () => {
      throw new AppError('GENERATION_PENDING')
    })
    expect((await post(route, '/x', {}, a.cookies[0])).status).toBe(409)
  })

  it('recognises lock conflicts however Prisma wraps them', () => {
    expect(isLockConflict({ code: 'P2034' })).toBe(true)
    expect(isLockConflict({ code: 'P2010', meta: { code: '55P03', message: 'could not obtain lock' } })).toBe(true)
    expect(isLockConflict({ code: 'P2010', meta: { driverAdapterError: { cause: { originalCode: '40P01' } } } })).toBe(true)
    expect(isLockConflict(new Error('Raw query failed. Code: `40001`. Message: `could not serialize access`'))).toBe(true)
    expect(isLockConflict(new AppError('PASSWORD_INCORRECT'))).toBe(false)
    expect(isLockConflict({ code: 'P2025' })).toBe(false)
    expect(isLockConflict(null)).toBe(false)
  })
})

describe('inventory guard', () => {
  // Mirrors the inventory table of the 4.4 contract. A new table fails this test until it is classified there.
  const CLASSIFIED: Record<string, 'deleted for the owner' | 'retained shared' | 'retained pseudonymous'> = {
    user: 'deleted for the owner',
    session: 'deleted for the owner',
    account: 'deleted for the owner',
    verification: 'deleted for the owner',
    Puppy: 'deleted for the owner',
    Plan: 'deleted for the owner',
    Level: 'deleted for the owner',
    ExerciseVersion: 'deleted for the owner',
    Attempt: 'deleted for the owner',
    MasteryEvent: 'deleted for the owner',
    GenerationJob: 'deleted for the owner',
    IdempotencyKey: 'deleted for the owner',
    AiUsageDay: 'deleted for the owner',
    EmailRateLimit: 'retained pseudonymous',
    MediaVersion: 'retained pseudonymous',
    MediaReview: 'retained pseudonymous',
    TechniqueSuspensionEvent: 'retained pseudonymous',
    MediaAsset: 'retained shared',
    TechniqueVersionState: 'retained shared',
  }

  it('classifies every table of the public schema, so a future table cannot silently escape deletion', async () => {
    const rows = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations'`
    const actual = rows.map((row) => row.table_name).sort()
    expect(actual.filter((name) => !(name in CLASSIFIED))).toEqual([]) // an unclassified table fails here
    expect(Object.keys(CLASSIFIED).filter((name) => !actual.includes(name))).toEqual([]) // and a stale entry too
  })
})

// ----- helpers for the cookie comparisons -----

type Parsed = Record<string, string | boolean>
/** Set-Cookie entries as name -> normalized attributes (lower-cased names, Expires ignored: only Max-Age=0 matters). */
function parseSetCookies(response: Response) {
  const parsed = new Map<string, Parsed>()
  for (const entry of response.headers.getSetCookie()) {
    const [pair, ...attributes] = entry.split(';').map((part) => part.trim())
    const eq = pair!.indexOf('=')
    const attrs: Parsed = { value: pair!.slice(eq + 1) }
    for (const attribute of attributes) {
      const [name, value] = attribute.split('=')
      const lower = name!.toLowerCase()
      if (lower === 'expires') continue
      attrs[lower] = value === undefined ? true : lower === 'samesite' ? value.toLowerCase() : value
    }
    parsed.set(pair!.slice(0, eq), attrs)
  }
  return parsed
}

function expiredCookiesResponse(cookies: ReturnType<typeof expiredAuthCookies>) {
  return serialize(cookies)
}

// The same serialization the route performs (NextResponse cookies), for an instance that is not the app's own.
function serialize(cookies: ReturnType<typeof expiredAuthCookies>) {
  const response = NextResponse.json({})
  for (const { name, value, attributes } of cookies) response.cookies.set(name, value, attributes)
  return response
}

// ----- standard PostgreSQL only: lock-order races -----
// Deterministic pattern of media-generation.test.ts: locks held by the test on independent connections, waiting
// backends observed through pg_stat_activity and pg_blocking_pids. No sleep orders anything; sleeps only space the polls.

type Waiting = { pid: number; query: string; blockedBy: number[] }
const waitingBackends = () =>
  prisma.$queryRaw<Waiting[]>`
    SELECT a.pid, a.query, pg_blocking_pids(a.pid) AS "blockedBy"
    FROM pg_stat_activity a
    WHERE a.datname = current_database() AND a.wait_event_type = 'Lock'`

async function observeWaiting(what: string, match: (backend: Waiting) => boolean): Promise<Waiting> {
  for (let i = 0; i < 400; i++) {
    const found = (await waitingBackends()).find(match)
    if (found) return found
    await sleep(25)
  }
  throw new Error(`never observed in the database: ${what}`)
}

const backendPid = async (tx: Tx) => (await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`)[0]!.pid

/** A gate a test opens later. */
function gate() {
  let open!: () => void
  const promise = new Promise<void>((resolve) => (open = resolve))
  return { promise, open }
}

/** Holds a test transaction open until released, and reports its backend pid. `after` runs once released, before the commit. */
async function holdTransaction(body: (tx: Tx) => Promise<void>, after?: (tx: Tx) => Promise<void>) {
  const release = gate()
  let reportPid!: (pid: number) => void
  const pid = new Promise<number>((resolve) => (reportPid = resolve))
  const done = prisma.$transaction(
    async (tx) => {
      await body(tx)
      reportPid(await backendPid(tx))
      await release.promise
      await after?.(tx)
    },
    { timeout: 30_000, maxWait: 30_000 },
  )
  const failed = done.then(() => new Promise<never>(() => {}), (error) => Promise.reject(error))
  failed.catch(() => {})
  return { pid: await Promise.race([pid, failed]), release: release.open, done }
}

/** SHARE lock on "Plan": the generation commit's first plan INSERT waits, after it has taken the job row and the puppy. */
const blockPlanInserts = () => holdTransaction((tx) => tx.$executeRawUnsafe('LOCK TABLE "Plan" IN SHARE MODE').then(() => undefined))

describe.skipIf(!REAL_POSTGRES)('account deletion on standard PostgreSQL', () => {
  async function noOwnerRowsAnywhere() {
    // Only disposable accounts live in this database, so a global zero means the committed rows went too.
    for (const model of ['puppy', 'plan', 'level', 'exerciseVersion', 'attempt', 'masteryEvent', 'generationJob', 'idempotencyKey', 'session', 'account'] as const) {
      expect(await (prisma[model] as unknown as { count: () => Promise<number> }).count(), model).toBe(0)
    }
  }

  it('a deletion waits for a generation commit that holds the job row, then removes the committed plan too', async () => {
    const a = await makeOwner('c1')
    await draft(a.id)
    const settled: string[] = []
    const blocker = await blockPlanInserts()
    let generation: Promise<unknown> | undefined
    let deletion: Promise<unknown> | undefined
    try {
      generation = completeOnboarding(a.id).finally(() => settled.push('generation'))
      generation.catch(() => {})
      const committing = await observeWaiting('the generation commit waiting at its plan INSERT', (b) => b.blockedBy.includes(blocker.pid) && /INSERT INTO\s+("public"\.)?"Plan"/.test(b.query))
      expect(await prisma.plan.count()).toBe(0)

      deletion = deleteAccount(a.id, PASSWORD).finally(() => settled.push('deletion'))
      deletion.catch(() => {})
      await observeWaiting('the deletion waiting for the job row held by the commit', (b) => b.blockedBy.includes(committing.pid) && /"GenerationJob"[\s\S]*FOR UPDATE/.test(b.query))
      expect(settled).toEqual([])
    } finally {
      blocker.release()
      await Promise.allSettled([generation, deletion, blocker.done])
    }
    await expect(generation).resolves.toMatchObject({ created: true })
    await expect(deletion).resolves.toBeUndefined()
    expect(settled).toEqual(['generation', 'deletion']) // the deletion went second and took the committed plan with it
    await noOwnerRowsAnywhere()
    expect(await prisma.user.count()).toBe(0)
  })

  it('a generation and an adaptation whose commit starts after the deletion stop at the fence: no row, no refund, never a 500', async () => {
    // Initial plan: the request passed authentication, the provider call runs (slow mode), the deletion commits meanwhile.
    const a = await makeOwner('c2a')
    await draft(a.id)
    process.env.AI_FAKE_MODE = 'slow'
    const inFlight = post(completePOST, '/api/onboarding/complete', {}, a.cookies[0])
    for (let i = 0; i < 200 && (await prisma.generationJob.count({ where: { status: 'PENDING' } })) === 0; i++) await sleep(25)
    expect(await prisma.generationJob.count({ where: { status: 'PENDING' } })).toBe(1)
    await deleteAccount(a.id, PASSWORD)
    const generation = await inFlight
    expect([401, 409]).toContain(generation.status)
    await noOwnerRowsAnywhere()
    expect(await prisma.user.count()).toBe(0)
    expect(await usageCount('ai-request', a.id)).toBe(0) // nothing refunded into a recreated counter

    // Adaptation of the current exercise, same race.
    delete process.env.AI_FAKE_MODE
    const b = await makeOwner('c2b')
    await onboard(b.id)
    const plan = await planFor(b.id)
    for (let i = 0; i < 2; i++) await recordAttempt(b.id, { levelId: plan.currentLevelId!, outcome: 'STRUGGLING', idempotencyKey: key() })
    process.env.AI_FAKE_MODE = 'slow'
    const adapting = post(adaptPOST, '/api/plan/adapt', { planRevision: plan.revision }, b.cookies[0], { 'idempotency-key': key() })
    for (let i = 0; i < 200 && (await prisma.generationJob.count({ where: { status: 'PENDING', kind: 'ADAPT_CURRENT' } })) === 0; i++) await sleep(25)
    expect(await prisma.generationJob.count({ where: { status: 'PENDING', kind: 'ADAPT_CURRENT' } })).toBe(1)
    await deleteAccount(b.id, PASSWORD)
    const adaptation = await adapting
    expect([401, 404, 409]).toContain(adaptation.status)
    await noOwnerRowsAnywhere()
    expect(await prisma.user.count()).toBe(0)
    expect(await usageCount('ai-request', b.id)).toBe(0)
  })

  it('a deletion queued behind the plan lock holds no puppy lock, so progression and deletion never deadlock (both orders)', async () => {
    // Order 1: a progression transaction holds the plan lock and, once released, inserts an attempt (which needs key-share
    // on the puppy). The deletion queues behind the plan lock first.
    const a = await makeOwner('c3a')
    await onboard(a.id)
    const plan = await planFor(a.id)
    const level = plan.levels[0]!
    const exercise = await prisma.exerciseVersion.findFirstOrThrow({ where: { levelId: level.id } })
    const progression = await holdTransaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Plan" WHERE id = ${plan.id}::uuid FOR UPDATE`
      },
      async (tx) => {
        await tx.attempt.create({ data: { puppyId: plan.puppyId, levelId: level.id, exerciseVersionId: exercise.id, outcome: 'WITH_HELP', mode: 'CURRENT' } })
      },
    )
    let deletion: Promise<unknown> | undefined
    let puppyLockedByDeletion = false
    try {
      // One attempt only, so a deadlock victim would surface here as 40P01 instead of being retried away.
      deletion = deleteAccount(a.id, PASSWORD, { maxAttempts: 1 })
      deletion.catch(() => {})
      await observeWaiting('the deletion waiting for the plan lock', (b) => b.blockedBy.includes(progression.pid) && /FROM "Plan"[\s\S]*FOR UPDATE/.test(b.query))
      // While it waits, the deletion must hold no puppy lock: this probe fails (55P03) exactly when it does.
      await prisma
        .$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM "Puppy" WHERE id = ${plan.puppyId}::uuid FOR NO KEY UPDATE NOWAIT`
        })
        .catch(() => {
          puppyLockedByDeletion = true
        })
    } finally {
      progression.release()
      await Promise.allSettled([progression.done, deletion])
    }
    // The progression's insert needs key-share on the puppy. It succeeds only if the deletion waited without a puppy
    // lock; with the puppy locked first this is a cycle and PostgreSQL aborts one side with 40P01.
    await expect(progression.done).resolves.toBeUndefined()
    await expect(deletion).resolves.toBeUndefined()
    expect(puppyLockedByDeletion).toBe(false)
    await noOwnerRowsAnywhere()

    // Order 2: the deletion is first (paused after its job and plan locks); a progression request after it waits for the
    // plan lock, and once the deletion has committed it fails cleanly (401 through the postRoute mapping).
    const b = await makeOwner('c3b')
    await onboard(b.id)
    const planB = await planFor(b.id)
    const reached = gate()
    const resume = gate()
    const deleting = deleteAccount(b.id, PASSWORD, {
      afterJobLock: async () => {
        reached.open()
        await resume.promise
      },
    })
    deleting.catch(() => {})
    await reached.promise
    const attempt = post(attemptsPOST, '/api/attempts', { levelId: planB.levels[0]!.id, outcome: 'WITH_HELP' }, b.cookies[0], { 'idempotency-key': key() })
    await observeWaiting('the progression request waiting for the plan lock held by the deletion', (backend) => /FROM "Plan" WHERE id =/.test(backend.query))
    resume.open()
    await expect(deleting).resolves.toBeUndefined()
    const answered = await attempt
    expect(answered.status).toBe(401)
    await noOwnerRowsAnywhere()
    expect(await prisma.user.count()).toBe(0)
  })

  it('onboarding racing the deletion never leaves a puppy for the deleted user', async () => {
    // A draft save that already passed authentication lands while the deletion is paused: the deletion removes its puppy.
    const a = await makeOwner('c4a')
    const reached = gate()
    const resume = gate()
    const deleting = deleteAccount(a.id, PASSWORD, {
      afterDelete: async (step) => {
        if (step !== 'IdempotencyKey') return
        reached.open()
        await resume.promise
      },
    })
    deleting.catch(() => {})
    await reached.promise
    const saved = await post(draftPOST, '/api/onboarding/draft', { step: 1, answers: { name: 'לוקה' } }, a.cookies[0])
    expect(saved.status).toBe(200) // the session still existed when this request began
    expect(await prisma.puppy.count({ where: { ownerId: a.id } })).toBe(1)
    resume.open()
    await expect(deleting).resolves.toBeUndefined()
    expect(await prisma.puppy.count({ where: { ownerId: a.id } })).toBe(0)
    expect(await prisma.user.count({ where: { id: a.id } })).toBe(0)

    // A puppy insert that is still uncommitted when the deletion reaches its last statement: the deletion waits for it,
    // then the user cascade removes the puppy.
    const b = await makeOwner('c4b')
    const inserting = await holdTransaction(async (tx) => {
      await tx.$executeRaw`INSERT INTO "Puppy" ("id", "ownerId", "updatedAt") VALUES (${randomUUID()}::uuid, ${b.id}, now())`
    })
    const deletingB = deleteAccount(b.id, PASSWORD)
    deletingB.catch(() => {})
    await observeWaiting('the deletion waiting for the uncommitted puppy insert', (backend) => backend.blockedBy.includes(inserting.pid))
    inserting.release()
    await Promise.all([inserting.done, expect(deletingB).resolves.toBeUndefined()])
    expect(await prisma.puppy.count({ where: { ownerId: b.id } })).toBe(0)
    expect(await prisma.user.count({ where: { id: b.id } })).toBe(0)
  })

  it('two concurrent deletions of the same account: one succeeds, the other answers UNAUTHENTICATED, no deadlock', async () => {
    const a = await makeOwner('c5')
    await populate(a)
    const reached = gate()
    const resume = gate()
    const first = deleteAccount(a.id, PASSWORD, {
      afterJobLock: async () => {
        reached.open()
        await resume.promise
      },
    })
    first.catch(() => {})
    await reached.promise
    const second = deleteAccount(a.id, PASSWORD)
    second.catch(() => {})
    await observeWaiting('the second deletion waiting behind the first', (b) => b.blockedBy.length > 0 && /FOR UPDATE/.test(b.query) && !/NOWAIT/.test(b.query))
    resume.open()
    const results = await Promise.allSettled([first, second])
    expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected'])
    const rejected = results.find((r) => r.status === 'rejected') as PromiseRejectedResult
    expect(rejected.reason).toMatchObject({ code: 'UNAUTHENTICATED' })
    const limit = await prisma.emailRateLimit.findUnique({ where: { key: createHash('sha256').update(`account-delete\n${a.id}`).digest('hex') } })
    expect(limit?.count).toBe(2) // both requests took a unit
    await noOwnerRowsAnywhere()
    expect(await prisma.user.count()).toBe(0)
  })

  it('a job created after the first lock pass cannot deadlock the deletion: the NOWAIT re-lock rolls back and the retry succeeds', async () => {
    const a = await makeOwner('c6')
    await onboard(a.id)
    const puppy = await puppyOf(a.id)
    const retries: string[] = []
    let holder: Awaited<ReturnType<typeof holdTransaction>> | undefined
    let newJobId = ''
    const deletion = deleteAccount(a.id, PASSWORD, {
      jitterMs: () => 10,
      onRetry: (reason, attempt) => retries.push(`${attempt}:${reason}`),
      afterJobLock: async (attempt) => {
        if (attempt !== 1) return
        // A new request passed authentication earlier: its job appears after the first pass, and its worker already holds
        // the job row (the fenceJob position) and is about to ask for the puppy.
        newJobId = await insertJob({ puppyId: puppy.id, ownerId: a.id, status: 'PENDING' })
        holder = await holdTransaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM "GenerationJob" WHERE id = ${newJobId}::uuid FOR UPDATE`
        })
      },
    })
    deletion.catch(() => {})
    for (let i = 0; i < 400 && !holder; i++) await sleep(10) // the hook runs inside the deletion, concurrently with this test
    expect(holder).toBeDefined()
    try {
      // The NOWAIT re-lock found the held row, the attempt rolled back, and the retry now waits at the FIRST pass,
      // which is before the puppy lock, so nothing is held that the worker needs.
      const waiting = await observeWaiting('the retried deletion waiting for the new job row', (b) => b.blockedBy.includes(holder!.pid) && /"GenerationJob"[\s\S]*FOR UPDATE/.test(b.query) && !/NOWAIT/.test(b.query))
      expect(retries).toHaveLength(1)
      expect(retries[0]).toMatch(/^1:/)
      expect(waiting.pid).not.toBe(holder!.pid)
      // The worker's next step succeeds at once: the deletion released the puppy when it rolled back.
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Puppy" WHERE id = ${puppy.id}::uuid FOR NO KEY UPDATE NOWAIT`
      })
    } finally {
      holder?.release()
      await Promise.allSettled([holder?.done, deletion])
    }
    await expect(deletion).resolves.toBeUndefined()
    expect(retries).toHaveLength(1)
    await noOwnerRowsAnywhere()
    expect(await prisma.user.count()).toBe(0)
  })
})
