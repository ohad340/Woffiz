import { describe, expect, it } from 'vitest'
import { emailTransport, signUpAllowedFor, signUpPolicy } from './config'

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
