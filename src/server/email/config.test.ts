import { describe, expect, it, vi } from 'vitest'
import {
  emailTransport,
  isSharedSender,
  parsePilotEmails,
  PILOT_MAX_ENTRIES,
  PILOT_MAX_RAW,
  senderDomain,
  signUpAllowedFor,
  signUpPolicy,
  type SignUpPolicy,
} from './config'

const RESEND = {
  RESEND_API_KEY: 're_test_key',
  EMAIL_FROM: 'Woffiz <onboarding@resend.dev>',
  TESTER_EMAIL: ' Tester@Example.test ',
  BETTER_AUTH_URL: 'https://woffiz.example',
  APP_ENV: 'production',
}
const LOCAL_OUTBOX = { EMAIL_TRANSPORT: 'outbox', APP_ENV: 'local', BETTER_AUTH_URL: 'http://localhost:3000', LOCAL_SIGNUP: 'true' }

describe('emailTransport', () => {
  it('uses Resend only when key, sender, tester address and base URL are all set', () => {
    expect(emailTransport(RESEND)).toEqual({ kind: 'resend', apiKey: 're_test_key', from: RESEND.EMAIL_FROM, tester: 'tester@example.test' })
  })

  it.each([
    ['no key', { ...RESEND, RESEND_API_KEY: '' }],
    ['no sender', { ...RESEND, EMAIL_FROM: undefined }],
    ['no tester', { ...RESEND, TESTER_EMAIL: undefined }],
    ['malformed tester', { ...RESEND, TESTER_EMAIL: 'not-an-address' }],
    ['no base URL', { ...RESEND, BETTER_AUTH_URL: undefined }],
  ])('sends nothing with %s', (_name, env) => {
    expect(emailTransport(env).kind).toBe('none')
  })

  it('allows the file outbox only on a local machine', () => {
    expect(emailTransport(LOCAL_OUTBOX)).toEqual({ kind: 'outbox', dir: '.email-outbox' })
    expect(emailTransport({ ...LOCAL_OUTBOX, APP_ENV: 'production' }).kind).toBe('none')
    expect(emailTransport({ ...LOCAL_OUTBOX, BETTER_AUTH_URL: 'https://woffiz.example' }).kind).toBe('none')
    // Asking for the outbox in a deployed environment never falls back to real sending either.
    expect(emailTransport({ ...RESEND, EMAIL_TRANSPORT: 'outbox' }).kind).toBe('none')
  })
})

describe('signUpPolicy', () => {
  it('limits registration to TESTER_EMAIL when Resend is configured', () => {
    const policy = signUpPolicy(RESEND)
    expect(policy).toEqual({ kind: 'tester', email: 'tester@example.test' })
    expect(signUpAllowedFor(policy, 'TESTER@example.test ')).toBe(true)
    expect(signUpAllowedFor(policy, 'someone@example.test')).toBe(false)
    expect(signUpAllowedFor(policy, undefined)).toBe(false)
    expect(signUpAllowedFor(policy, ['tester@example.test'])).toBe(false)
  })

  it('is closed when email is not configured, in any environment', () => {
    expect(signUpPolicy({ APP_ENV: 'production', BETTER_AUTH_URL: 'https://woffiz.example' }).kind).toBe('closed')
    // The old local flags alone no longer open registration: there would be no way to verify.
    expect(signUpPolicy({ APP_ENV: 'local', LOCAL_SIGNUP: 'true', BETTER_AUTH_URL: 'http://localhost:3000' }).kind).toBe('closed')
    expect(signUpAllowedFor({ kind: 'closed' }, 'tester@example.test')).toBe(false)
  })

  it('is open for any address only with the local outbox and LOCAL_SIGNUP=true', () => {
    expect(signUpPolicy(LOCAL_OUTBOX).kind).toBe('open')
    expect(signUpPolicy({ ...LOCAL_OUTBOX, LOCAL_SIGNUP: undefined }).kind).toBe('closed')
  })
})

// ----- Pilot allowlist (slice 4.5; docs/DECISIONS.md P4-5). Reserved example.test addresses only. -----

const list = (...emails: string[]) => emails.join(',')
const valid = (emails: string[]) => ({ kind: 'valid', emails: new Set(emails) })

describe('parsePilotEmails', () => {
  it('accepts commas, semicolons, spaces, tabs and newlines as separators and drops empty items', () => {
    expect(parsePilotEmails('a@example.test,b@example.test;c@example.test d@example.test\te@example.test\nf@example.test\r\n,,; ;g@example.test')).toEqual(
      valid(['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((x) => `${x}@example.test`)),
    )
  })

  it('normalizes case and surrounding whitespace, and collapses duplicates', () => {
    expect(parsePilotEmails('  Pilot1@Example.TEST ; pilot1@example.test ,PILOT1@EXAMPLE.TEST')).toEqual(valid(['pilot1@example.test']))
  })

  it('keeps a +tag address exactly as typed: no provider-specific folding', () => {
    expect(parsePilotEmails('first.last+tag@example.test, first.last@example.test')).toEqual(valid(['first.last+tag@example.test', 'first.last@example.test']))
  })

  it.each([
    ['an item without an @', 'a@example.test, nobody'],
    ['an item without a dot in the domain', 'a@example.test, b@localhost'],
    ['a non-ASCII item (Hebrew)', 'a@example.test, שלום@example.test'],
    ['a non-ASCII look-alike domain', 'a@eхample.test'], // Cyrillic "х"
    ['a Kelvin sign that would lower-case to an ASCII letter', 'a@Kexample.test'],
    ['an item over 254 characters', `${'a'.repeat(250)}@example.test`],
    ['a control character inside an item', 'a@example.test, b\u0001@example.test'],
  ])('ignores the WHOLE list for %s', (_name, raw) => {
    const result = parsePilotEmails(raw)
    expect(result).toMatchObject({ kind: 'invalid', reason: 'malformed' })
    expect(Number.isInteger((result as { count: number }).count)).toBe(true)
  })

  it('accepts exactly 200 distinct entries and ignores the whole list at 201', () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => `p${i}@example.test`).join(',')
    expect(parsePilotEmails(many(PILOT_MAX_ENTRIES))).toMatchObject({ kind: 'valid' })
    expect(parsePilotEmails(many(PILOT_MAX_ENTRIES + 1))).toEqual({ kind: 'invalid', reason: 'too-many', count: PILOT_MAX_ENTRIES + 1 })
    // Duplicates do not count twice.
    expect(parsePilotEmails(`${many(PILOT_MAX_ENTRIES)},p0@example.test,P1@EXAMPLE.test`)).toMatchObject({ kind: 'valid' })
  })

  it('rejects more than 16 384 characters before splitting anything', () => {
    expect(parsePilotEmails(`a@example.test${' '.repeat(PILOT_MAX_RAW)}`)).toEqual({ kind: 'invalid', reason: 'too-large', count: 0 })
    expect(parsePilotEmails(`a@example.test${' '.repeat(PILOT_MAX_RAW - 'a@example.test'.length)}`)).toMatchObject({ kind: 'valid' }) // exactly at the limit
  })

  it.each([undefined, '', '   ', ' , ;\n\t; '])('gives no list for %j', (raw) => {
    expect(parsePilotEmails(raw)).toEqual({ kind: 'none' })
  })

  it('never puts an address into a reason or a count', () => {
    const results = [
      parsePilotEmails('secret1@example.test, broken'),
      parsePilotEmails('x'.repeat(PILOT_MAX_RAW + 1)),
      parsePilotEmails(Array.from({ length: 201 }, (_, i) => `leak${i}@example.test`).join(',')),
    ]
    for (const result of results) {
      expect(result.kind).toBe('invalid')
      expect(JSON.stringify(result)).not.toMatch(/@|example|secret|leak/)
    }
  })
})

describe('the sender rule', () => {
  it.each([
    ['Woffiz <onboarding@resend.dev>'],
    ['onboarding@RESEND.DEV'],
    ['  Woffiz <Onboarding@Resend.Dev>  '],
    ['x@mail.resend.dev'],
    ['Woffiz'], // unparsable: fail closed
    [''],
    ['Woffiz <>'],
    ['@resend.dev'],
  ])('%j is the shared sender (or unparsable)', (from) => {
    expect(isSharedSender(from)).toBe(true)
  })

  it.each([['Woffiz <hello@pilot.example.test>'], ['hello@pilot.example.test'], ['a@notresend.dev'], ['a@resend.dev.example.test'], ['a@xresend.dev']])('%j is not shared', (from) => {
    expect(isSharedSender(from)).toBe(false)
  })

  it('reads the domain after the last @ inside the angle brackets', () => {
    expect(senderDomain('Woffiz <hello@Pilot.Example.test>')).toBe('pilot.example.test')
    expect(senderDomain('"a@b" <hello@pilot.example.test>')).toBe('pilot.example.test')
    expect(senderDomain('nothing')).toBeNull()
  })
})

describe('the pilot policy', () => {
  const PILOT = list('Pilot1@Example.test', 'pilot2@example.test')
  const SENDER = 'Woffiz <hello@pilot.example.test>'
  const verified = (extra: Record<string, string | undefined> = {}) => ({ ...RESEND, EMAIL_FROM: SENDER, EMAIL_SENDER_VERIFIED: 'true', PILOT_EMAILS: PILOT, ...extra })
  const quiet = () => {}
  const both = new Set(['pilot1@example.test', 'pilot2@example.test'])

  it('is tester-only on the shared sender, with the flag false or true', () => {
    for (const flag of [undefined, 'false', 'true']) {
      expect(signUpPolicy({ ...RESEND, PILOT_EMAILS: PILOT, EMAIL_SENDER_VERIFIED: flag }, quiet)).toEqual({ kind: 'tester', email: 'tester@example.test' })
    }
  })

  it.each([undefined, '', 'false', 'FALSE', '1', 'yes', 'on', 'truee', 'ture'])('is tester-only on a verified-looking sender with the flag %j', (flag) => {
    expect(signUpPolicy(verified({ EMAIL_SENDER_VERIFIED: flag }), quiet)).toEqual({ kind: 'tester', email: 'tester@example.test' })
  })

  it.each(['true', ' TRUE ', 'True'])('is pilot on a non-resend.dev sender with the flag %j', (flag) => {
    expect(signUpPolicy(verified({ EMAIL_SENDER_VERIFIED: flag }), quiet)).toEqual({ kind: 'pilot', tester: 'tester@example.test', emails: both })
  })

  it('is tester-only with an invalid list, even with a verified sender and the flag', () => {
    expect(signUpPolicy(verified({ PILOT_EMAILS: 'pilot1@example.test, broken' }), quiet)).toEqual({ kind: 'tester', email: 'tester@example.test' })
  })

  it('is tester-only when the sender cannot be parsed', () => {
    expect(signUpPolicy(verified({ EMAIL_FROM: 'Woffiz' }), quiet).kind).toBe('tester')
  })

  it("keeps today's behavior without a list, with an empty list, or without TESTER_EMAIL", () => {
    expect(signUpPolicy(verified({ PILOT_EMAILS: undefined }), quiet).kind).toBe('tester')
    expect(signUpPolicy(verified({ PILOT_EMAILS: ' , ; ' }), quiet).kind).toBe('tester')
    expect(signUpPolicy(verified({ TESTER_EMAIL: undefined }), quiet).kind).toBe('closed') // the pilot does not remove the TESTER_EMAIL requirement
  })

  it('open local sign-up still wins; the outbox honors the list without the flag; never off a local machine', () => {
    expect(signUpPolicy({ ...LOCAL_OUTBOX, PILOT_EMAILS: PILOT }, quiet).kind).toBe('open')
    const local = { ...LOCAL_OUTBOX, LOCAL_SIGNUP: undefined, PILOT_EMAILS: PILOT }
    expect(signUpPolicy(local, quiet)).toEqual({ kind: 'pilot', tester: null, emails: both })
    expect(signUpPolicy({ ...local, PILOT_EMAILS: undefined }, quiet).kind).toBe('closed')
    expect(signUpPolicy({ ...local, PILOT_EMAILS: 'broken' }, quiet).kind).toBe('closed')
    expect(signUpPolicy({ ...local, APP_ENV: 'production' }, quiet).kind).toBe('closed')
    expect(signUpPolicy({ ...local, BETTER_AUTH_URL: 'https://woffiz.example' }, quiet).kind).toBe('closed')
  })

  describe('signUpAllowedFor', () => {
    const policy = signUpPolicy(verified(), quiet)
    const local = signUpPolicy({ ...LOCAL_OUTBOX, LOCAL_SIGNUP: undefined, PILOT_EMAILS: PILOT }, quiet)

    it('admits the tester and the listed addresses, case-insensitively and with surrounding whitespace', () => {
      expect(signUpAllowedFor(policy, 'tester@example.test')).toBe(true)
      expect(signUpAllowedFor(policy, ' TESTER@Example.test ')).toBe(true)
      expect(signUpAllowedFor(policy, 'PILOT1@example.test')).toBe(true)
      expect(signUpAllowedFor(policy, '  pilot2@EXAMPLE.test\n')).toBe(true)
    })

    it('refuses everything else, including a +tag variant and non-strings', () => {
      expect(signUpAllowedFor(policy, 'stranger@example.test')).toBe(false)
      expect(signUpAllowedFor(policy, 'pilot1+tag@example.test')).toBe(false)
      expect(signUpAllowedFor(policy, undefined)).toBe(false)
      expect(signUpAllowedFor(policy, null)).toBe(false)
      expect(signUpAllowedFor(policy, ['pilot1@example.test'])).toBe(false)
      expect(signUpAllowedFor(policy, 42)).toBe(false)
    })

    it('has no tester on the local outbox (tester null), only the list', () => {
      expect(signUpAllowedFor(local, 'pilot1@example.test')).toBe(true)
      expect(signUpAllowedFor(local, 'tester@example.test')).toBe(false)
    })

    it('keeps closed and open as they were', () => {
      expect(signUpAllowedFor({ kind: 'closed' }, 'pilot1@example.test')).toBe(false)
      expect(signUpAllowedFor({ kind: 'open' }, 'anyone@example.test')).toBe(true)
      const empty: SignUpPolicy = { kind: 'pilot', tester: null, emails: new Set() }
      expect(signUpAllowedFor(empty, '')).toBe(false)
    })
  })

  describe('warnings', () => {
    it('are fixed text and counts only, never an address or the list, one per reason', () => {
      const messages: string[] = []
      const warn = (reason: string, message: string) => messages.push(`${reason}|${message}`)
      signUpPolicy({ ...RESEND, PILOT_EMAILS: PILOT }, warn) // flag false AND shared sender
      signUpPolicy(verified({ EMAIL_SENDER_VERIFIED: undefined }), warn) // flag only
      signUpPolicy(verified({ PILOT_EMAILS: 'secret@example.test, broken' }), warn) // invalid
      signUpPolicy(verified({ PILOT_EMAILS: Array.from({ length: 201 }, (_, i) => `leak${i}@example.test`).join(',') }), warn) // too many
      signUpPolicy(verified({ PILOT_EMAILS: 'x'.repeat(PILOT_MAX_RAW + 1) }), warn) // too large
      const reasons = messages.map((m) => m.split('|')[0])
      expect(reasons).toEqual(['flag', 'shared-sender', 'flag', 'invalid-malformed', 'invalid-too-many', 'invalid-too-large'])
      for (const message of messages) expect(message).not.toMatch(/@|example\.test|secret|leak|pilot1|pilot2|tester@/i)
      expect(messages.find((m) => m.startsWith('invalid-too-many'))).toContain('201 entries')
    })

    it('are not issued when the list is honored, unset, empty, or the transport is not configured', () => {
      const warn = vi.fn()
      signUpPolicy(verified(), warn)
      signUpPolicy({ ...RESEND, EMAIL_FROM: undefined, PILOT_EMAILS: PILOT }, warn)
      signUpPolicy({ ...RESEND, PILOT_EMAILS: undefined }, warn)
      signUpPolicy({ ...RESEND, PILOT_EMAILS: '  ' }, warn)
      signUpPolicy({ ...LOCAL_OUTBOX, LOCAL_SIGNUP: undefined, PILOT_EMAILS: PILOT }, warn)
      expect(warn).not.toHaveBeenCalled()
    })

    it('go to the console once per reason per process with the default reporter', async () => {
      vi.resetModules()
      const fresh = await import('./config')
      const spy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        for (let i = 0; i < 5; i++) fresh.signUpPolicy({ ...RESEND, PILOT_EMAILS: PILOT })
        expect(spy).toHaveBeenCalledTimes(2) // flag, shared sender: once each, however often the policy is read
        for (let i = 0; i < 5; i++) fresh.signUpPolicy(verified({ PILOT_EMAILS: 'broken' }))
        expect(spy).toHaveBeenCalledTimes(3)
        expect(JSON.stringify(spy.mock.calls)).not.toMatch(/@|example\.test|pilot1/i)
      } finally {
        spy.mockRestore()
      }
    })
  })
})
