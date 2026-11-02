import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GET as authGET, POST as authPOST } from '@/app/api/auth/[...all]/route'
import { POST as draftPOST } from '@/app/api/onboarding/draft/route'
import { prisma } from '@/server/db'
import { takeRateLimit } from '@/server/email/rate-limit'
import { deliver, EmailDeliveryError, type OutgoingEmail } from '@/server/email/transport'
import { createUser, REAL_POSTGRES, resetDatabase } from './helpers'
import { BASE, cookieFrom, jsonPost, lastLink } from './mail'

// Email delivery is MOCKED: messages are captured here, nothing is sent or written.
const sent = vi.hoisted(() => [] as OutgoingEmail[])
vi.mock('@/server/email/transport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/server/email/transport')>()),
  deliver: vi.fn(async (message: OutgoingEmail) => {
    sent.push(message)
  }),
}))

beforeEach(async () => {
  await resetDatabase()
  sent.length = 0
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

const PASSWORD = 'correct horse battery'
const NEW_PASSWORD = 'a brand new passphrase'
const VERIFY_CALLBACK = '/verify-email?verified=1'

type Handlers = { POST: (r: Request) => Promise<Response>; GET: (r: Request) => Promise<Response> }
const app: Handlers = { POST: authPOST, GET: authGET }

const post = (path: string, body: unknown, extra: Record<string, string> = {}, handlers = app) =>
  handlers.POST(jsonPost(`/api/auth${path}`, body, extra))
const open = (url: string, cookie?: string) => app.GET(new Request(url, { headers: cookie ? { cookie } : {} }))

const signUp = (email: string, handlers = app) =>
  post('/sign-up/email', { email, password: PASSWORD, name: 'בדיקה', callbackURL: VERIFY_CALLBACK }, {}, handlers)
const signIn = (email: string, password = PASSWORD) => post('/sign-in/email', { email, password })
const failNextDelivery = () => vi.mocked(deliver).mockRejectedValueOnce(new EmailDeliveryError('Resend rejected the message (500)'))
const user = (email: string) => prisma.user.findUniqueOrThrow({ where: { email } })

async function verifiedOwner(email: string) {
  await signUp(email)
  expect((await open(lastLink(sent, 'verify-email', email))).status).toBe(302)
  const response = await signIn(email)
  expect(response.status).toBe(200)
  return cookieFrom(response)
}

describe('email verification', () => {
  it('sends a link from BETTER_AUTH_URL; the link verifies, signs in once, and cannot be replayed into a session', async () => {
    const response = await signUp('new@example.test')
    expect(response.status).toBe(200)
    expect(cookieFrom(response)).toBe('')
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ kind: 'verify-email', to: 'new@example.test' })
    const link = lastLink(sent, 'verify-email', 'new@example.test')
    expect(link.startsWith(`${BASE}/api/auth/verify-email?token=`)).toBe(true)

    // Not verified yet: sign-in is refused and does not send more mail.
    const early = await signIn('new@example.test')
    expect(early.status).toBe(403)
    expect(await early.json()).toMatchObject({ code: 'EMAIL_NOT_VERIFIED' })
    expect(cookieFrom(early)).toBe('')
    expect(sent).toHaveLength(1)

    const verified = await open(link)
    expect(verified.status).toBe(302)
    expect(verified.headers.get('location')).toBe(VERIFY_CALLBACK)
    const cookie = cookieFrom(verified)
    expect(cookie).toContain('session_token')
    expect((await user('new@example.test')).emailVerified).toBe(true)
    expect(await prisma.session.count()).toBe(1)

    // The verified owner can use protected endpoints.
    const draft = await draftPOST(jsonPost('/api/onboarding/draft', { step: 0, answers: { name: 'לוקה' } }, { cookie }))
    expect(draft.status).toBe(200)

    // Reusing the link changes nothing and creates no session.
    const reused = await open(link)
    expect(reused.status).toBe(302)
    expect(reused.headers.get('location')).toBe(VERIFY_CALLBACK)
    expect(cookieFrom(reused)).toBe('')
    expect(await prisma.session.count()).toBe(1)
  })

  it('rejects an expired link and a tampered one', async () => {
    await signUp('late@example.test')
    const link = lastLink(sent, 'verify-email', 'late@example.test')

    const tampered = await open(link.replace(/token=([^&]+)/, (_m, t: string) => `token=${t.slice(0, -4)}AAAA`))
    expect(tampered.headers.get('location')).toBe(`${VERIFY_CALLBACK}&error=INVALID_TOKEN`)

    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 61 * 60 * 1000)
    const expired = await open(link)
    expect(expired.status).toBe(302)
    expect(expired.headers.get('location')).toBe(`${VERIFY_CALLBACK}&error=TOKEN_EXPIRED`)
    expect(cookieFrom(expired)).toBe('')
    vi.useRealTimers()

    expect((await user('late@example.test')).emailVerified).toBe(false)
    expect(await prisma.session.count()).toBe(0)
  })

  it('resends to an unverified address with the same answer as an unknown or verified one', async () => {
    await signUp('pending@example.test')
    await verifiedOwner('done@example.test')
    sent.length = 0

    const answers = []
    for (const email of ['pending@example.test', 'nobody@example.test', 'done@example.test']) {
      const response = await post('/send-verification-email', { email, callbackURL: VERIFY_CALLBACK })
      answers.push({ status: response.status, body: await response.json() })
    }
    expect(new Set(answers.map((a) => JSON.stringify(a))).size).toBe(1)
    expect(answers[0]!.status).toBe(200)
    expect(sent.map((m) => m.to)).toEqual(['pending@example.test'])

    // The newest link works.
    expect((await open(lastLink(sent, 'verify-email', 'pending@example.test'))).status).toBe(302)
    expect((await user('pending@example.test')).emailVerified).toBe(true)
  })

})

describe('email rate limits are stored in PostgreSQL', () => {
  /** A fresh copy of the auth route, as a second server instance would load it (no shared memory). */
  async function anotherInstance() {
    vi.resetModules()
    const route = await import('@/app/api/auth/[...all]/route')
    return { POST: route.POST, GET: route.GET }
  }

  it('limits each address, whether or not it has an account, across server instances', async () => {
    await signUp('busy@example.test')
    for (const email of ['busy@example.test', 'ghost@example.test']) {
      const statuses = []
      for (let i = 0; i < 3; i++) statuses.push((await post('/send-verification-email', { email })).status)
      // The fourth request goes to a different instance: the count still applies.
      const second = await anotherInstance()
      statuses.push((await post('/send-verification-email', { email }, {}, second)).status)
      expect(statuses).toEqual([200, 200, 200, 429])
    }
    // Only hashes are stored: no address appears in the table.
    const rows = await prisma.emailRateLimit.findMany()
    expect(rows.length).toBeGreaterThan(0)
    expect(JSON.stringify(rows)).not.toMatch(/example\.test/)
  })

  it('limits each IP across addresses, and a new window allows requests again', async () => {
    vi.stubEnv('AUTH_EMAIL_RATE_MAX', '3')
    const instance = await anotherInstance()
    const from = (ip: string, email: string) => post('/request-password-reset', { email }, { 'x-forwarded-for': `${ip}, 10.0.0.1` }, instance)

    const statuses = []
    for (const n of [1, 2, 3, 4]) statuses.push((await from('203.0.113.7', `reader${n}@example.test`)).status)
    expect(statuses).toEqual([200, 200, 200, 429])
    expect((await from('198.51.100.9', 'reader5@example.test')).status).toBe(200)

    await prisma.emailRateLimit.updateMany({ data: { windowStart: new Date(Date.now() - 16 * 60 * 1000) } })
    expect((await from('203.0.113.7', 'reader6@example.test')).status).toBe(200)
  })

  it.runIf(REAL_POSTGRES)('is atomic: of 20 simultaneous requests on separate connections exactly 3 pass', async () => {
    const limit = { scope: 'test-race', max: 3, windowSeconds: 60 }
    const results = await Promise.all(Array.from({ length: 20 }, () => takeRateLimit(limit, 'same-subject')))
    expect(results.filter(Boolean)).toHaveLength(3)
    expect((await prisma.emailRateLimit.findFirstOrThrow()).count).toBe(20)
  })
})

describe('provider failures: the public answer is identical for existing and unknown addresses', () => {
  const comparable = async (response: Response) => {
    const body = (await response.json()) as Record<string, unknown>
    const user = body.user as Record<string, unknown> | undefined
    // Sign-up returns a user object for both (real or synthetic); only its keys and fixed fields are comparable.
    return { status: response.status, token: body.token, status_: body.status, message: body.message, userKeys: user && Object.keys(user).sort(), verified: user?.emailVerified }
  }

  it('resend, reset and sign-up answer the same whether the send failed or there was nothing to send', async () => {
    await signUp('pending@example.test')
    await verifiedOwner('owner@example.test')
    sent.length = 0
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})

    failNextDelivery()
    const resendFailed = await post('/send-verification-email', { email: 'pending@example.test' })
    const resendUnknown = await post('/send-verification-email', { email: 'nobody@example.test' })
    expect(await comparable(resendFailed)).toEqual(await comparable(resendUnknown))
    expect(resendFailed.status).toBe(200)

    failNextDelivery()
    const resetFailed = await post('/request-password-reset', { email: 'owner@example.test', redirectTo: '/reset-password' })
    const resetUnknown = await post('/request-password-reset', { email: 'nobody@example.test', redirectTo: '/reset-password' })
    expect(await comparable(resetFailed)).toEqual(await comparable(resetUnknown))
    expect(resetFailed.status).toBe(200)

    failNextDelivery()
    const signUpFailed = await signUp('unlucky@example.test')
    const signUpExisting = await signUp('owner@example.test')
    expect(await comparable(signUpFailed)).toEqual(await comparable(signUpExisting))
    expect(signUpFailed.status).toBe(200)
    expect(cookieFrom(signUpFailed)).toBe('')

    expect(sent).toHaveLength(0)
    // Failures are logged for operators, without the address or the link.
    const lines = logged.mock.calls.map((c) => c.join(' ')).filter((l) => l.includes('[email]'))
    expect(lines).toHaveLength(3)
    expect(lines.join('\n')).not.toMatch(/example\.test|token=|reset-password\//)
  })

  it('after a failed sign-up email, registering again re-sends the link', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    failNextDelivery()
    expect((await signUp('unlucky@example.test')).status).toBe(200)
    expect(sent).toHaveLength(0)

    expect((await signUp('unlucky@example.test')).status).toBe(200)
    expect(sent.map((m) => m.to)).toEqual(['unlucky@example.test'])
    expect((await open(lastLink(sent, 'verify-email', 'unlucky@example.test'))).status).toBe(302)
    expect((await user('unlucky@example.test')).emailVerified).toBe(true)
  })
})

describe('password reset', () => {
  it('resets once with the emailed link, ends every session, and the link cannot be reused', async () => {
    const oldCookie = await verifiedOwner('forgetful@example.test')
    sent.length = 0

    const known = await post('/request-password-reset', { email: 'forgetful@example.test', redirectTo: '/reset-password' })
    const unknown = await post('/request-password-reset', { email: 'nobody@example.test', redirectTo: '/reset-password' })
    expect(known.status).toBe(200)
    expect(await known.json()).toEqual(await unknown.json())
    expect(sent.map((m) => m.to)).toEqual(['forgetful@example.test'])

    const link = lastLink(sent, 'reset-password', 'forgetful@example.test')
    expect(link.startsWith(`${BASE}/api/auth/reset-password/`)).toBe(true)
    const landing = await open(link)
    expect(landing.status).toBe(302)
    const target = new URL(landing.headers.get('location')!)
    expect(target.origin + target.pathname).toBe(`${BASE}/reset-password`)
    const token = target.searchParams.get('token')!
    expect(token).toBeTruthy()

    const tooShort = await post('/reset-password', { token, newPassword: 'short' })
    expect(tooShort.status).toBe(400)

    const reset = await post('/reset-password', { token, newPassword: NEW_PASSWORD })
    expect(reset.status).toBe(200)
    expect(await prisma.session.count()).toBe(0)
    const old = await draftPOST(jsonPost('/api/onboarding/draft', { step: 0, answers: {} }, { cookie: oldCookie }))
    expect(old.status).toBe(401)

    expect((await signIn('forgetful@example.test')).status).toBe(401)
    expect((await signIn('forgetful@example.test', NEW_PASSWORD)).status).toBe(200)

    // Used: both the link and the token are dead.
    const again = await post('/reset-password', { token, newPassword: 'yet another passphrase' })
    expect(again.status).toBe(400)
    expect(await again.json()).toMatchObject({ code: 'INVALID_TOKEN' })
    const reopened = new URL((await open(link)).headers.get('location')!)
    expect(reopened.searchParams.get('error')).toBe('INVALID_TOKEN')
  })

  it('rejects an expired reset link', async () => {
    await verifiedOwner('slow@example.test')
    await post('/request-password-reset', { email: 'slow@example.test', redirectTo: '/reset-password' })
    const link = lastLink(sent, 'reset-password', 'slow@example.test')
    await prisma.verification.updateMany({ where: { identifier: { startsWith: 'reset-password:' } }, data: { expiresAt: new Date(Date.now() - 1000) } })

    const landing = new URL((await open(link)).headers.get('location')!)
    expect(landing.searchParams.get('error')).toBe('INVALID_TOKEN')
    const token = link.split('/reset-password/')[1]!.split('?')[0]!
    expect((await post('/reset-password', { token, newPassword: NEW_PASSWORD })).status).toBe(400)
    expect((await signIn('slow@example.test')).status).toBe(200)
  })

  it('refuses an off-site redirect', async () => {
    await verifiedOwner('phish@example.test')
    sent.length = 0
    const response = await post('/request-password-reset', { email: 'phish@example.test', redirectTo: 'https://evil.example/reset' })
    expect(response.status).toBe(403)
    expect(sent).toHaveLength(0)
  })
})

describe('unverified accounts cannot reach protected data', () => {
  it('blocks a session created before verification became mandatory, and does not verify the account', async () => {
    // The previous configuration: sign-up signed in immediately, without verification.
    const legacy = betterAuth({
      database: prismaAdapter(prisma, { provider: 'postgresql' }),
      secret: process.env.BETTER_AUTH_SECRET,
      baseURL: BASE,
      emailAndPassword: { enabled: true },
      user: { additionalFields: { role: { type: 'string', defaultValue: 'OWNER', input: false } } },
    })
    const response = await legacy.api.signUpEmail({
      body: { email: 'legacy@example.test', password: PASSWORD, name: 'x' },
      headers: new Headers({ origin: BASE }),
      asResponse: true,
    })
    const cookie = cookieFrom(response)
    expect(cookie).toContain('session_token')

    const draft = await draftPOST(jsonPost('/api/onboarding/draft', { step: 0, answers: { name: 'לוקה' } }, { cookie }))
    expect(draft.status).toBe(403)
    expect(await draft.json()).toMatchObject({ error: 'EMAIL_NOT_VERIFIED' })
    expect(await prisma.puppy.count()).toBe(0)

    expect((await signIn('legacy@example.test')).status).toBe(403)
    expect((await user('legacy@example.test')).emailVerified).toBe(false)
  })
})

describe('test phase: Resend configured, registration and mail limited to TESTER_EMAIL', () => {
  async function deployed(env: Record<string, string>) {
    vi.stubEnv('EMAIL_TRANSPORT', '')
    vi.stubEnv('APP_ENV', 'production')
    vi.stubEnv('LOCAL_SIGNUP', '')
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v)
    vi.resetModules()
    const route = await import('@/app/api/auth/[...all]/route')
    const { auth } = await import('@/server/auth')
    return { handlers: { POST: route.POST, GET: route.GET }, auth }
  }
  const RESEND = { RESEND_API_KEY: 're_test_not_real', EMAIL_FROM: 'Woffiz <onboarding@resend.dev>', TESTER_EMAIL: 'Tester@Example.test' }

  it('rejects any other address, over HTTP and through the server API', async () => {
    const { handlers, auth } = await deployed(RESEND)

    const other = await signUp('stranger@example.test', handlers)
    expect(other.status).toBe(403)
    expect(await other.json()).toMatchObject({ code: 'SIGN_UP_RESTRICTED' })
    const direct = await auth.api
      .signUpEmail({ body: { email: 'direct@example.test', password: PASSWORD, name: 'x' }, headers: new Headers({ origin: BASE }) })
      .catch((e: unknown) => e)
    expect(direct).toMatchObject({ statusCode: 403 })
    expect(await prisma.user.count()).toBe(0)
    expect(sent).toHaveLength(0)

    const tester = await signUp('TESTER@example.test', handlers)
    expect(tester.status).toBe(200)
    expect(sent.map((m) => m.to)).toEqual(['tester@example.test'])
    expect(await prisma.user.count()).toBe(1)
  })

  it('never mails an address other than TESTER_EMAIL, and answers neutrally', async () => {
    const { handlers } = await deployed(RESEND)
    await createUser('existing@example.test')

    const reset = await post('/request-password-reset', { email: 'existing@example.test', redirectTo: '/reset-password' }, {}, handlers)
    const unknown = await post('/request-password-reset', { email: 'nobody@example.test', redirectTo: '/reset-password' }, {}, handlers)
    expect(reset.status).toBe(200)
    expect(await reset.json()).toEqual(await unknown.json())
    expect(sent).toHaveLength(0)
  })

  it('stays closed when the email configuration is incomplete', async () => {
    const { handlers } = await deployed({ ...RESEND, RESEND_API_KEY: '' })
    const response = await signUp('tester@example.test', handlers)
    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(await prisma.user.count()).toBe(0)
    expect(sent).toHaveLength(0)
  })
})
