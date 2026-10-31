import { AsyncLocalStorage } from 'node:async_hooks'
import { emailTransport, normalizeEmail } from './config'
import { renderAuthEmail, type AuthEmailKind } from './templates'
import { deliver, EmailDeliveryError } from './transport'

/**
 * Better Auth swallows errors thrown by its email callbacks on sign-up and password reset and still
 * answers 200. To never report a send that failed, each email-sending request runs inside a scope;
 * the sender marks a failure there and guardEmailRequest replaces the response with a 503.
 */
type Outcome = { failed: boolean }
const scope = new AsyncLocalStorage<Outcome>()

export async function sendAuthEmail(kind: AuthEmailKind, to: string, url: string): Promise<void> {
  const transport = emailTransport()
  const recipient = normalizeEmail(to)

  // Test phase: real mail goes only to TESTER_EMAIL. Other addresses get the same neutral answer as an
  // unknown address, so a response never reveals which accounts exist.
  if (transport.kind === 'resend' && recipient !== transport.tester) {
    console.warn(`[email] ${kind} not sent: recipient is not TESTER_EMAIL (test phase)`)
    return
  }

  try {
    await deliver({ kind, to: recipient, url, ...renderAuthEmail(kind, url) }, transport)
  } catch (error) {
    const outcome = scope.getStore()
    if (outcome) outcome.failed = true
    console.error(`[email] ${kind} delivery failed: ${error instanceof EmailDeliveryError ? error.message : 'unexpected error'}`)
    throw error instanceof EmailDeliveryError ? error : new EmailDeliveryError('Unexpected delivery error')
  }
}

// ----- Request guard for the endpoints that can send mail -----

const EMAIL_PATHS = new Set(['/sign-up/email', '/send-verification-email', '/request-password-reset'])

/** Every answer takes at least this long, so a real send cannot be told apart from an unknown address by timing. */
export const MIN_EMAIL_RESPONSE_MS = 1_000

/** Per address and endpoint, whether or not the address has an account (so a 429 reveals nothing). In memory, per instance. */
const RECIPIENT_WINDOW_MS = 15 * 60_000
const RECIPIENT_MAX = 3
const recent = new Map<string, number[]>()

function takeRecipientQuota(path: string, email: string, now = Date.now()) {
  const key = `${path}:${normalizeEmail(email)}`
  const hits = (recent.get(key) ?? []).filter((t) => now - t < RECIPIENT_WINDOW_MS)
  if (hits.length >= RECIPIENT_MAX) {
    recent.set(key, hits)
    return false
  }
  hits.push(now)
  recent.set(key, hits)
  if (recent.size > 10_000) recent.delete(recent.keys().next().value!)
  return true
}

/** Tests only. */
export function resetRecipientQuotas() {
  recent.clear()
}

const noStore = { 'content-type': 'application/json', 'cache-control': 'no-store' }

const FAILURES = {
  EMAIL_RATE_LIMITED: { status: 429, message: 'Too many email requests for this address' },
  EMAIL_SEND_FAILED: { status: 503, message: 'The email could not be sent' },
} as const

function failure(code: keyof typeof FAILURES) {
  return new Response(JSON.stringify({ code, message: FAILURES[code].message }), { status: FAILURES[code].status, headers: noStore })
}

export async function guardEmailRequest(request: Request, handle: (request: Request) => Promise<Response>): Promise<Response> {
  const path = new URL(request.url).pathname.replace(/^\/api\/auth/, '')
  if (request.method !== 'POST' || !EMAIL_PATHS.has(path)) return handle(request)

  const started = Date.now()
  const email = await request
    .clone()
    .json()
    .then((body: { email?: unknown }) => (typeof body?.email === 'string' ? body.email : null))
    .catch(() => null)

  let response: Response
  if (email && !takeRecipientQuota(path, email)) {
    response = failure('EMAIL_RATE_LIMITED')
  } else {
    const outcome: Outcome = { failed: false }
    const inner = await scope.run(outcome, () => handle(request))
    response = outcome.failed ? failure('EMAIL_SEND_FAILED') : inner
  }

  const remaining = MIN_EMAIL_RESPONSE_MS - (Date.now() - started)
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining))
  return response
}
