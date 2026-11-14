import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '@/server/db'
import { createUser, resetDatabase } from './helpers'
import { cookieFrom, jsonPost, lastLink } from './mail'
import type { OutgoingEmail } from '@/server/email/transport'

// Pilot access allowlist (Phase 4, slice 5; docs/DECISIONS.md P4-5). Reserved *.test / example.test addresses only, a
// placeholder key, and delivery is MOCKED: messages are captured here, nothing is sent or written anywhere.
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
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

const PASSWORD = 'correct horse battery'
const VERIFY_CALLBACK = '/verify-email?verified=1'
const SENDER = 'Woffiz <hello@pilot.example.test>'
const SHARED_SENDER = 'Woffiz <onboarding@resend.dev>'
const RESEND = {
  RESEND_API_KEY: 're_test_not_real',
  EMAIL_FROM: SENDER,
  TESTER_EMAIL: 'Tester@Example.test',
  EMAIL_SENDER_VERIFIED: 'true',
  PILOT_EMAILS: 'Pilot1@Example.test, pilot2@example.test',
}

type Handlers = { POST: (r: Request) => Promise<Response>; GET: (r: Request) => Promise<Response> }

/** A server instance under the given environment: the existing `deployed(env)` pattern of email-auth.test.ts (auth.ts is untouched). */
async function deployed(env: Record<string, string>) {
  vi.stubEnv('EMAIL_TRANSPORT', '')
  vi.stubEnv('APP_ENV', 'production')
  vi.stubEnv('LOCAL_SIGNUP', '')
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value)
  vi.resetModules()
  const route = await import('@/app/api/auth/[...all]/route')
  const { auth } = await import('@/server/auth')
  return { handlers: { POST: route.POST, GET: route.GET } as Handlers, auth }
}

/** A local machine with the file outbox and NO open sign-up: the pilot list is honored without the flag. */
async function localOutbox(env: Record<string, string>) {
  vi.stubEnv('EMAIL_TRANSPORT', 'outbox')
  vi.stubEnv('APP_ENV', 'local')
  vi.stubEnv('LOCAL_SIGNUP', '')
  vi.stubEnv('RESEND_API_KEY', '')
  vi.stubEnv('TESTER_EMAIL', '')
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value)
  vi.resetModules()
  const route = await import('@/app/api/auth/[...all]/route')
  const { auth } = await import('@/server/auth')
  return { handlers: { POST: route.POST, GET: route.GET } as Handlers, auth }
}

const post = (handlers: Handlers, path: string, body: unknown) => handlers.POST(jsonPost(`/api/auth${path}`, body))
const signUp = (handlers: Handlers, email: string) => post(handlers, '/sign-up/email', { email, password: PASSWORD, name: 'בדיקה', callbackURL: VERIFY_CALLBACK })
const signIn = (handlers: Handlers, email: string) => post(handlers, '/sign-in/email', { email, password: PASSWORD })
const reset = (handlers: Handlers, email: string) => post(handlers, '/request-password-reset', { email, redirectTo: '/reset-password' })
const resend = (handlers: Handlers, email: string) => post(handlers, '/send-verification-email', { email, callbackURL: VERIFY_CALLBACK })
const answer = async (response: Response) => ({ status: response.status, body: await response.json().catch(() => null) })
const accounts = (email: string) => prisma.user.count({ where: { email } })

describe('pilot policy with a verified sender', () => {
  it('admits the tester and the listed addresses (any casing) and refuses everyone else with today\'s answer', async () => {
    const { handlers } = await deployed(RESEND)

    const listed = await signUp(handlers, 'PILOT1@example.test')
    expect(listed.status).toBe(200)
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ kind: 'verify-email', to: 'pilot1@example.test' }) // exactly one message, to the normalized address
    expect(await accounts('pilot1@example.test')).toBe(1)

    expect((await signUp(handlers, 'pilot2@EXAMPLE.test')).status).toBe(200) // listed with different casing (surrounding whitespace is covered by the unit tests)
    expect((await signUp(handlers, 'TESTER@example.test')).status).toBe(200) // the tester stays admitted
    expect(sent.map((m) => m.to)).toEqual(['pilot1@example.test', 'pilot2@example.test', 'tester@example.test'])

    const before = await prisma.user.count()
    sent.length = 0
    const stranger = await signUp(handlers, 'stranger@example.test')
    expect(stranger.status).toBe(403)
    const body = await stranger.json()
    expect(body).toMatchObject({ code: 'SIGN_UP_RESTRICTED' })
    expect(JSON.stringify(body)).not.toMatch(/pilot|tester/i) // the answer never carries the list
    expect(await prisma.user.count()).toBe(before)
    expect(sent).toHaveLength(0)
    expect(await accounts('stranger@example.test')).toBe(0)
  })

  it('a +tag variant of a listed address is NOT listed (no provider folding)', async () => {
    const { handlers } = await deployed(RESEND)
    expect((await signUp(handlers, 'pilot1+tag@example.test')).status).toBe(403)
    expect(await prisma.user.count()).toBe(0)
  })
})

describe('the list is inert unless the sender is verified', () => {
  it('on the shared resend.dev sender, even with the flag true, only the tester is admitted', async () => {
    const { handlers } = await deployed({ ...RESEND, EMAIL_FROM: SHARED_SENDER })
    const listed = await signUp(handlers, 'pilot1@example.test')
    expect(listed.status).toBe(403)
    expect(await listed.json()).toMatchObject({ code: 'SIGN_UP_RESTRICTED' })
    expect(await accounts('pilot1@example.test')).toBe(0)
    expect(sent).toHaveLength(0)
    expect((await signUp(handlers, 'tester@example.test')).status).toBe(200)
    expect(sent.map((m) => m.to)).toEqual(['tester@example.test'])
  })

  it.each([undefined, 'false', '1', 'yes'])('on a verified-looking sender with the flag %j only the tester is admitted', async (flag) => {
    const { handlers } = await deployed({ ...RESEND, EMAIL_SENDER_VERIFIED: flag ?? '' })
    expect((await signUp(handlers, 'pilot2@example.test')).status).toBe(403)
    expect(await accounts('pilot2@example.test')).toBe(0)
    expect(sent).toHaveLength(0)
    expect((await signUp(handlers, 'tester@example.test')).status).toBe(200)
  })

  it('a malformed list is ignored as a whole: even its good entries are refused', async () => {
    const { handlers } = await deployed({ ...RESEND, PILOT_EMAILS: 'pilot1@example.test, not-an-address' })
    expect((await signUp(handlers, 'pilot1@example.test')).status).toBe(403)
    expect(await prisma.user.count()).toBe(0)
  })

  it('logs one fixed warning per reason, never an address', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { handlers } = await deployed({ ...RESEND, EMAIL_FROM: SHARED_SENDER, EMAIL_SENDER_VERIFIED: 'false' })
    await signUp(handlers, 'pilot1@example.test')
    await signUp(handlers, 'pilot2@example.test')
    const lines = warn.mock.calls.map((call) => String(call[0])).filter((line) => line.includes('PILOT_EMAILS'))
    expect(lines.length).toBe(2) // the flag and the shared sender, once each however many requests read the policy
    expect(lines.join('\n')).not.toMatch(/@|example\.test|pilot1|pilot2/)
  })
})

describe('the database hook is a second line of defense', () => {
  it('refuses an unlisted address created without going through the sign-up route, and creates a listed one', async () => {
    const { auth } = await deployed(RESEND)
    const context = await auth.$context
    let refused: unknown
    try {
      await context.internalAdapter.createUser({ email: 'direct@example.test', name: 'x', emailVerified: false }, undefined as never) // the source is read only with validateUserInfo, which this app does not use
    } catch (error) {
      refused = error
    }
    expect(refused).toMatchObject({ statusCode: 400 })
    expect(await accounts('direct@example.test')).toBe(0)

    const created = await context.internalAdapter.createUser({ email: 'Pilot2@Example.test', name: 'x', emailVerified: false }, undefined as never)
    expect(created.email).toBe('pilot2@example.test')
    expect(await accounts('pilot2@example.test')).toBe(1)
  })
})

describe('removal from the list blocks only a new registration', () => {
  it('a removed account still signs in, gets reset and verification mail, and its new sign-up looks like any unlisted address', async () => {
    const first = await deployed({ ...RESEND, PILOT_EMAILS: 'removed@example.test, pending@example.test' })
    expect((await signUp(first.handlers, 'removed@example.test')).status).toBe(200)
    expect((await first.handlers.GET(new Request(lastLink(sent, 'verify-email', 'removed@example.test')))).status).toBe(302)
    expect((await signUp(first.handlers, 'pending@example.test')).status).toBe(200) // stays unverified

    // The owner removes both addresses from the list and redeploys.
    const later = await deployed({ ...RESEND, PILOT_EMAILS: 'someone-else@example.test' })
    sent.length = 0

    const signedIn = await signIn(later.handlers, 'removed@example.test')
    expect(signedIn.status).toBe(200)
    expect(cookieFrom(signedIn)).toContain('session_token')

    expect((await reset(later.handlers, 'removed@example.test')).status).toBe(200)
    expect(sent.map((m) => `${m.kind}:${m.to}`)).toEqual(['reset-password:removed@example.test'])

    expect((await resend(later.handlers, 'pending@example.test')).status).toBe(200)
    expect(sent.map((m) => `${m.kind}:${m.to}`)).toEqual(['reset-password:removed@example.test', 'verify-email:pending@example.test'])

    // A new sign-up of the removed address is refused exactly like a never-seen unlisted one: no enumeration.
    sent.length = 0
    const removed = await answer(await signUp(later.handlers, 'removed@example.test'))
    const neverSeen = await answer(await signUp(later.handlers, 'never-seen@example.test'))
    expect(removed.status).toBe(403)
    expect(removed).toEqual(neverSeen)
    expect(sent).toHaveLength(0)
    expect(await accounts('never-seen@example.test')).toBe(0)
    expect(await accounts('removed@example.test')).toBe(1) // the account itself is untouched
  })
})

describe('delivery on the verified sender', () => {
  it('sends nothing to an address with no account that is not allowed, and answers exactly as for a delivered one', async () => {
    const { handlers } = await deployed(RESEND)
    expect((await signUp(handlers, 'pilot2@example.test')).status).toBe(200) // an unverified, allowed account
    sent.length = 0

    const delivered = { reset: await answer(await reset(handlers, 'pilot2@example.test')), resend: await answer(await resend(handlers, 'pilot2@example.test')) }
    expect(sent.map((m) => `${m.kind}:${m.to}`)).toEqual(['reset-password:pilot2@example.test', 'verify-email:pilot2@example.test'])

    sent.length = 0
    const skipped = { reset: await answer(await reset(handlers, 'ghost@example.test')), resend: await answer(await resend(handlers, 'ghost@example.test')) }
    expect(sent).toHaveLength(0) // no account, not on the list: nothing is sent
    expect(skipped).toEqual(delivered) // identical answers: nothing to tell the two cases apart
    expect(await accounts('ghost@example.test')).toBe(0)
  })

  it('an existing account that is not on the list receives mail (recovery), unlike an arbitrary address', async () => {
    const { handlers } = await deployed(RESEND)
    await createUser('existing@example.test')
    expect((await reset(handlers, 'existing@example.test')).status).toBe(200)
    expect((await reset(handlers, 'arbitrary@example.test')).status).toBe(200)
    expect(sent.map((m) => m.to)).toEqual(['existing@example.test'])
  })

  it('a failing account lookup counts as "no account": fail closed, still a neutral answer', async () => {
    const { handlers } = await deployed(RESEND)
    await createUser('existing@example.test')
    vi.spyOn(prisma.user, 'findUnique').mockRejectedValue(new Error('database unavailable'))
    const response = await reset(handlers, 'existing@example.test')
    expect(response.status).toBe(200)
    expect(sent).toHaveLength(0)
  })
})

describe('the shared sender and tester mode are unchanged', () => {
  it('only the tester receives mail; an existing non-tester account gets nothing and the answer is neutral', async () => {
    const { handlers } = await deployed({ ...RESEND, EMAIL_FROM: SHARED_SENDER })
    await createUser('existing@example.test')
    await createUser('tester@example.test')

    const other = await answer(await reset(handlers, 'existing@example.test'))
    const unknown = await answer(await reset(handlers, 'nobody@example.test'))
    expect(other.status).toBe(200)
    expect(other).toEqual(unknown)
    expect(sent).toHaveLength(0)

    expect((await reset(handlers, 'tester@example.test')).status).toBe(200)
    expect(sent.map((m) => m.to)).toEqual(['tester@example.test'])
  })

  it('without a list, the tester-only behavior is exactly as before', async () => {
    const { handlers } = await deployed({ ...RESEND, PILOT_EMAILS: '' })
    expect((await signUp(handlers, 'pilot1@example.test')).status).toBe(403)
    expect((await signUp(handlers, 'tester@example.test')).status).toBe(200)
  })
})

describe('the local outbox', () => {
  it('honors the list without the flag: a listed address registers and its message is captured, an unlisted one is refused', async () => {
    const { handlers } = await localOutbox({ PILOT_EMAILS: 'pilot1@example.test' })
    const listed = await signUp(handlers, 'Pilot1@Example.test')
    expect(listed.status).toBe(200)
    expect(sent.map((m) => `${m.kind}:${m.to}`)).toEqual(['verify-email:pilot1@example.test'])

    sent.length = 0
    const unlisted = await signUp(handlers, 'other@example.test')
    expect(unlisted.status).toBe(403)
    expect(await unlisted.json()).toMatchObject({ code: 'SIGN_UP_RESTRICTED' })
    expect(await accounts('other@example.test')).toBe(0)
    expect(sent).toHaveLength(0)
  })

  it('stays closed off a local machine, even with a list', async () => {
    const { handlers } = await localOutbox({ PILOT_EMAILS: 'pilot1@example.test', APP_ENV: 'production' })
    expect((await signUp(handlers, 'pilot1@example.test')).status).toBeGreaterThanOrEqual(400)
    expect(await prisma.user.count()).toBe(0)
  })
})

describe('timing and limits are unchanged', () => {
  it('a restricted and an admitted pilot sign-up both take at least the response floor (real time)', async () => {
    const { handlers } = await deployed(RESEND)
    const timed = async (email: string) => {
      const started = Date.now()
      const response = await signUp(handlers, email)
      return { status: response.status, ms: Date.now() - started }
    }
    const admitted = await timed('pilot1@example.test')
    const restricted = await timed('stranger@example.test')
    expect(admitted.status).toBe(200)
    expect(restricted.status).toBe(403)
    expect(admitted.ms).toBeGreaterThanOrEqual(900)
    expect(restricted.ms).toBeGreaterThanOrEqual(900)
  })

  it('the per-address limit still applies to a pilot address (a fourth request is 429)', async () => {
    const { handlers } = await deployed(RESEND)
    const statuses: number[] = []
    for (let i = 0; i < 4; i++) statuses.push((await reset(handlers, 'pilot1@example.test')).status)
    expect(statuses).toEqual([200, 200, 200, 429])
  })
})
