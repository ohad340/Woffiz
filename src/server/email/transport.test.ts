import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderAuthEmail } from './templates'
import { deliver, EmailDeliveryError, type OutgoingEmail } from './transport'

const RESEND = { kind: 'resend', apiKey: 're_test_key', from: 'Woffiz <onboarding@resend.dev>', tester: 'tester@example.test' } as const
const URL = 'http://localhost:3000/api/auth/verify-email?token=abc&callbackURL=%2Fverify-email'
const message: OutgoingEmail = { kind: 'verify-email', to: 'tester@example.test', url: URL, ...renderAuthEmail('verify-email', URL) }

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Resend delivery (fetch mocked: nothing is sent)', () => {
  it('posts one message with the key in the header only', async () => {
    const fetchMock = vi.fn(async () => Response.json({ id: 'email-id' }))
    vi.stubGlobal('fetch', fetchMock)
    await deliver(message, RESEND)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [endpoint, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(endpoint).toBe('https://api.resend.com/emails')
    const headers = init.headers as Record<string, string>
    expect(headers.authorization).toBe('Bearer re_test_key')
    expect(headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/)
    const body = JSON.parse(init.body as string)
    expect(body).toMatchObject({ from: RESEND.from, to: ['tester@example.test'], subject: message.subject })
    expect(JSON.stringify(body)).not.toContain('re_test_key')
  })

  it.each([
    ['a rejection', async () => Response.json({ name: 'validation_error', message: 'tester@example.test is invalid' }, { status: 422 })],
    ['a server error', async () => new Response('oops', { status: 500 })],
    ['a network failure', async () => Promise.reject(new TypeError('fetch failed'))],
  ])('reports %s as a failure without the address, link or key', async (_name, impl) => {
    vi.stubGlobal('fetch', vi.fn(impl))
    const error = await deliver(message, RESEND).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(EmailDeliveryError)
    const text = String((error as Error).message)
    expect(text).not.toContain('tester@example.test')
    expect(text).not.toContain('token=')
    expect(text).not.toContain('re_test_key')
  })

  it('refuses to send without a configured transport', async () => {
    await expect(deliver(message, { kind: 'none' })).rejects.toBeInstanceOf(EmailDeliveryError)
  })
})

describe('auth email templates', () => {
  it('are Hebrew, right-to-left, with the link escaped in HTML and plain in text', () => {
    const url = 'http://localhost:3000/x?a=1&b="2"'
    const email = renderAuthEmail('reset-password', url)
    expect(email.html).toContain('<html lang="he" dir="rtl">')
    expect(email.html).toContain('href="http://localhost:3000/x?a=1&amp;b=&quot;2&quot;"')
    expect(email.html).not.toContain('b="2"')
    expect(email.text).toContain(url)
    expect(email.subject).toContain('איפוס הסיסמה')
  })
})
