import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { POST as attemptsPOST } from '@/app/api/attempts/route'
import { POST as draftPOST } from '@/app/api/onboarding/draft/route'
import { auth } from '@/server/auth'
import { prisma } from '@/server/db'
import { createUser, onboard, planFor, resetDatabase } from './helpers'

beforeEach(resetDatabase)
afterEach(() => {
  vi.unstubAllEnvs()
})

const BASE = 'http://localhost:3000'
const PASSWORD = 'correct horse battery'
const headers = () => new Headers({ origin: BASE })

const cookieFrom = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .filter((c) => c && !c.endsWith('='))
    .join('; ')

async function signUp(email: string, extra: Record<string, unknown> = {}, instance = auth) {
  const response = await instance.api.signUpEmail({
    body: { email, password: PASSWORD, name: 'בדיקה', ...extra } as never,
    headers: headers(),
    asResponse: true,
  })
  return { response, cookie: cookieFrom(response) }
}

async function signIn(email: string, password: string, instance = auth) {
  const response = await instance.api.signInEmail({ body: { email, password }, headers: headers(), asResponse: true })
  return { response, cookie: cookieFrom(response) }
}

const sessionFor = (cookie: string) => auth.api.getSession({ headers: new Headers({ cookie }) })

describe('email and password registration', () => {
  it('creates an OWNER account, signs it in, and stores only a hash', async () => {
    const { response, cookie } = await signUp('new@example.test')
    expect(response.status).toBe(200)
    expect((await sessionFor(cookie))?.user.email).toBe('new@example.test')

    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'new@example.test' } })
    expect(user.role).toBe('OWNER')
    const account = await prisma.account.findFirstOrThrow({ where: { userId: user.id, providerId: 'credential' } })
    expect(account.password).toBeTruthy()
    expect(account.password).not.toContain(PASSWORD)
  })

  it('never lets a client choose ADMIN', async () => {
    await signUp('sneaky@example.test', { role: 'ADMIN' })
    const user = await prisma.user.findUnique({ where: { email: 'sneaky@example.test' } })
    expect(user?.role ?? 'OWNER').toBe('OWNER')
  })

  it('rejects a duplicate email and a short password without creating anything', async () => {
    await signUp('dup@example.test')
    expect((await signUp('dup@example.test')).response.status).toBeGreaterThanOrEqual(400)
    expect(await prisma.user.count({ where: { email: 'dup@example.test' } })).toBe(1)

    const short = await auth.api.signUpEmail({
      body: { email: 'short@example.test', password: '1234567', name: 'x' } as never,
      headers: headers(),
      asResponse: true,
    })
    expect(short.status).toBe(400)
    expect(await prisma.user.count({ where: { email: 'short@example.test' } })).toBe(0)
  })
})

describe('email and password sign-in', () => {
  it('accepts the right password and gives a working session', async () => {
    await signUp('me@example.test')
    const { response, cookie } = await signIn('me@example.test', PASSWORD)
    expect(response.status).toBe(200)
    expect((await sessionFor(cookie))?.user.email).toBe('me@example.test')
  })

  it('gives the same answer for a wrong password and an unknown email', async () => {
    await signUp('real@example.test')
    const wrong = await signIn('real@example.test', 'not the password')
    const unknown = await signIn('nobody@example.test', PASSWORD)
    expect(wrong.response.status).toBe(401)
    expect(unknown.response.status).toBe(401)
    expect(await wrong.response.json()).toEqual(await unknown.response.json())
    expect(wrong.cookie).toBe('')
    expect(unknown.cookie).toBe('')
  })

  it('logout ends the session', async () => {
    const { cookie } = await signUp('bye@example.test')
    expect(await sessionFor(cookie)).not.toBeNull()
    await auth.api.signOut({ headers: new Headers({ cookie, origin: BASE }) })
    expect(await sessionFor(cookie)).toBeNull()
    expect(await prisma.session.count()).toBe(0)
  })
})

describe('sign-up is closed outside a local machine', () => {
  it('rejects registration but still lets existing owners in', async () => {
    await signUp('early@example.test')

    vi.stubEnv('LOCAL_SIGNUP', 'false')
    vi.resetModules()
    const { auth: closed } = await import('@/server/auth')

    const attempt = await signUp('late@example.test', {}, closed)
    expect(attempt.response.status).toBeGreaterThanOrEqual(400)
    expect(await prisma.user.count({ where: { email: 'late@example.test' } })).toBe(0)

    const existing = await signIn('early@example.test', PASSWORD, closed)
    expect(existing.response.status).toBe(200)
  })
})

describe('protected server endpoints', () => {
  const jsonRequest = (path: string, body: unknown, extra: Record<string, string> = {}) =>
    new Request(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: BASE, ...extra },
      body: JSON.stringify(body),
    })

  it('rejects requests without a session', async () => {
    const response = await draftPOST(jsonRequest('/api/onboarding/draft', { step: 0, answers: {} }))
    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ error: 'UNAUTHENTICATED' })
  })

  it('rejects other origins and non-JSON bodies even with a valid session', async () => {
    const { cookie } = await signUp('csrf@example.test')
    const wrongOrigin = await draftPOST(jsonRequest('/api/onboarding/draft', { step: 0, answers: {} }, { cookie, origin: 'https://evil.example' }))
    expect(wrongOrigin.status).toBe(403)
    const noOrigin = await draftPOST(
      new Request(`${BASE}/api/onboarding/draft`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: '{}' }),
    )
    expect(noOrigin.status).toBe(403)
    const form = await draftPOST(
      new Request(`${BASE}/api/onboarding/draft`, { method: 'POST', headers: { 'content-type': 'text/plain', origin: BASE, cookie }, body: '{}' }),
    )
    expect(form.status).toBe(403)
  })

  it('accepts a signed-in owner and ignores any owner id in the body', async () => {
    const { cookie } = await signUp('mine@example.test')
    const other = await createUser('victim@example.test')
    const response = await draftPOST(jsonRequest('/api/onboarding/draft', { step: 0, answers: { name: 'לוקה' }, ownerId: other.id }, { cookie }))
    expect(response.status).toBe(400) // strict schema: unknown field
    const ok = await draftPOST(jsonRequest('/api/onboarding/draft', { step: 0, answers: { name: 'לוקה' } }, { cookie }))
    expect(ok.status).toBe(200)
    const me = await prisma.user.findUniqueOrThrow({ where: { email: 'mine@example.test' } })
    expect((await prisma.puppy.findUniqueOrThrow({ where: { ownerId: me.id } })).name).toBe('לוקה')
    expect(await prisma.puppy.count({ where: { ownerId: other.id } })).toBe(0)
  })

  it("requires an idempotency key and hides other owners' levels", async () => {
    const { cookie } = await signUp('third@example.test')
    const victim = await createUser('victim2@example.test')
    await onboard(victim.id)
    const victimLevel = (await planFor(victim.id)).levels[0]!

    const noKey = await attemptsPOST(jsonRequest('/api/attempts', { levelId: victimLevel.id, outcome: 'INDEPENDENT' }, { cookie }))
    expect(noKey.status).toBe(400)
    expect(await noKey.json()).toMatchObject({ error: 'IDEMPOTENCY_REQUIRED' })

    const foreign = await attemptsPOST(
      jsonRequest('/api/attempts', { levelId: victimLevel.id, outcome: 'INDEPENDENT' }, { cookie, 'idempotency-key': 'abcdefgh-1234' }),
    )
    expect(foreign.status).toBe(404)
    expect(await prisma.attempt.count()).toBe(0)
  })
})
