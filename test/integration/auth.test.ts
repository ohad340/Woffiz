import { beforeEach, describe, expect, it } from 'vitest'
import { POST as attemptsPOST } from '@/app/api/attempts/route'
import { POST as draftPOST } from '@/app/api/onboarding/draft/route'
import { GET as inboxGET } from '@/app/api/dev/inbox/route'
import { auth } from '@/server/auth'
import { prisma } from '@/server/db'
import { clearDevInbox, latestDevMessage } from '@/server/dev-inbox'
import { createUser, onboard, planFor, resetDatabase } from './helpers'

beforeEach(async () => {
  await resetDatabase()
  clearDevInbox()
})

const BASE = 'http://localhost:3000'

async function requestLink(email: string, extraBody: Record<string, unknown> = {}) {
  await auth.api.signInMagicLink({
    body: { email, name: 'בדיקה', callbackURL: '/home', ...extraBody } as never,
    headers: new Headers({ origin: BASE }),
  })
  const message = latestDevMessage(email)
  if (!message) throw new Error('no dev message')
  return new URL(message.url).searchParams.get('token')!
}

async function verify(token: string) {
  const response = await auth.api.magicLinkVerify({
    query: { token, callbackURL: '/home' },
    headers: new Headers({ origin: BASE }),
    asResponse: true,
  })
  const cookie = response.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .filter((c) => c && !c.endsWith('='))
    .join('; ')
  return { response, cookie }
}

const sessionFor = (cookie: string) => auth.api.getSession({ headers: new Headers({ cookie }) })

describe('magic link sign-in', () => {
  it('signs a new owner in once and creates an OWNER account', async () => {
    const token = await requestLink('new@example.test')
    const { cookie } = await verify(token)
    const session = await sessionFor(cookie)
    expect(session?.user.email).toBe('new@example.test')
    expect(await prisma.user.findUniqueOrThrow({ where: { email: 'new@example.test' } })).toMatchObject({ role: 'OWNER' })
  })

  it('cannot be used twice', async () => {
    const token = await requestLink('single@example.test')
    const first = await verify(token)
    expect(await sessionFor(first.cookie)).not.toBeNull()
    expect(await prisma.session.count()).toBe(1)

    const second = await verify(token)
    expect(second.cookie).toBe('')
    expect(await prisma.session.count()).toBe(1)
  })

  it('stops working after it expires', async () => {
    const token = await requestLink('late@example.test')
    await prisma.verification.updateMany({ data: { expiresAt: new Date(Date.now() - 60_000) } })
    const { cookie } = await verify(token)
    expect(cookie).toBe('')
    expect(await prisma.session.count()).toBe(0)
    expect(await prisma.user.count()).toBe(0)
  })

  it('does not accept a made-up token', async () => {
    await requestLink('real@example.test')
    const { cookie } = await verify('not-a-real-token')
    expect(cookie).toBe('')
    expect(await prisma.session.count()).toBe(0)
  })

  it('never lets a client choose ADMIN', async () => {
    const token = await requestLink('sneaky@example.test', { role: 'ADMIN' })
    await verify(token)
    expect(await prisma.user.findUniqueOrThrow({ where: { email: 'sneaky@example.test' } })).toMatchObject({ role: 'OWNER' })
  })

  it('logout ends the session', async () => {
    const token = await requestLink('bye@example.test')
    const { cookie } = await verify(token)
    expect(await sessionFor(cookie)).not.toBeNull()
    await auth.api.signOut({ headers: new Headers({ cookie, origin: BASE }) })
    expect(await sessionFor(cookie)).toBeNull()
    expect(await prisma.session.count()).toBe(0)
  })
})

describe('protected server endpoints', () => {
  const jsonRequest = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    new Request(`${BASE}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: BASE, ...headers },
      body: JSON.stringify(body),
    })

  it('rejects requests without a session', async () => {
    const response = await draftPOST(jsonRequest('/api/onboarding/draft', { step: 0, answers: {} }))
    expect(response.status).toBe(401)
    expect(await response.json()).toMatchObject({ error: 'UNAUTHENTICATED' })
  })

  it('rejects other origins and non-JSON bodies even with a valid session', async () => {
    const token = await requestLink('csrf@example.test')
    const { cookie } = await verify(token)
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
    const token = await requestLink('me@example.test')
    const { cookie } = await verify(token)
    const other = await createUser('victim@example.test')
    const response = await draftPOST(
      jsonRequest('/api/onboarding/draft', { step: 0, answers: { name: 'לוקה' }, ownerId: other.id }, { cookie }),
    )
    expect(response.status).toBe(400) // strict schema: unknown field
    const ok = await draftPOST(jsonRequest('/api/onboarding/draft', { step: 0, answers: { name: 'לוקה' } }, { cookie }))
    expect(ok.status).toBe(200)
    const me = await prisma.user.findUniqueOrThrow({ where: { email: 'me@example.test' } })
    expect((await prisma.puppy.findUniqueOrThrow({ where: { ownerId: me.id } })).name).toBe('לוקה')
    expect(await prisma.puppy.count({ where: { ownerId: other.id } })).toBe(0)
  })

  it('requires an idempotency key and hides other owners\' levels', async () => {
    const token = await requestLink('mine@example.test')
    const { cookie } = await verify(token)
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

  it('the development inbox answers 404 unless explicitly enabled and local', async () => {
    const saved = { ...process.env }
    try {
      await requestLink('inbox@example.test')
      const url = `${BASE}/api/dev/inbox?email=inbox@example.test`
      expect((await inboxGET(new Request(url))).status).toBe(200)

      process.env.DEV_EMAIL_INBOX = 'false'
      expect((await inboxGET(new Request(url))).status).toBe(404)
      process.env.DEV_EMAIL_INBOX = 'true'
      process.env.APP_ENV = 'production'
      expect((await inboxGET(new Request(url))).status).toBe(404)
      process.env.APP_ENV = 'local'
      process.env.BETTER_AUTH_URL = 'https://woffiz.example'
      expect((await inboxGET(new Request(url))).status).toBe(404)
    } finally {
      Object.assign(process.env, saved)
    }
  })
})
