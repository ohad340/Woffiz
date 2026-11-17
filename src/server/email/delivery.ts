import { prisma } from '../db'
import { emailTransport, normalizeEmail, signUpAllowedFor, signUpPolicy } from './config'
import { pruneRateLimits, takeRateLimit, type Limit } from './rate-limit'
import { renderAuthEmail, type AuthEmailKind } from './templates'
import { deliver, EmailDeliveryError } from './transport'

/** Better Auth stores the lower-cased address, which is also how `recipient` is normalized. A failing lookup is "no account". */
async function accountExists(recipient: string): Promise<boolean> {
  try {
    return (await prisma.user.findUnique({ where: { email: recipient }, select: { id: true } })) !== null
  } catch {
    return false
  }
}

/**
 * Sends one authentication email. It never throws: a failure is logged (without the address, link or
 * key) and the caller answers exactly as for an unknown address. A failed send therefore cannot reveal
 * that an account exists, and the screens use wording that never claims delivery.
 */
export async function sendAuthEmail(kind: AuthEmailKind, to: string, url: string): Promise<void> {
  const transport = emailTransport()
  const recipient = normalizeEmail(to)

  if (transport.kind === 'resend') {
    const policy = signUpPolicy()
    if (policy.kind === 'pilot') {
      // Verified sender (docs/DECISIONS.md P4-5): the registration gate decides who gets an account, delivery decides who
      // gets mail. An allowed address, or an address that already has an account (so removing someone from the list never
      // locks an existing owner out of recovery), receives mail; anyone else is skipped, fail closed. The answer to the
      // caller is unchanged, so a response never reveals which accounts exist.
      if (!signUpAllowedFor(policy, recipient) &&!(await accountExists(recipient))) {
        console.warn(`[email] ${kind} not sent: recipient is not allowed and has no account (pilot)`)
        return
      }
    } else if (recipient !== transport.tester) {
      // Test phase: real mail goes only to TESTER_EMAIL. Other addresses get the same neutral answer as an
      // unknown address, so a response never reveals which accounts exist.
      console.warn(`[email] ${kind} not sent: recipient is not TESTER_EMAIL (test phase)`)
      return
    }
  }

  try {
    await deliver({ kind, to: recipient, url, ...renderAuthEmail(kind, url) }, transport)
  } catch (error) {
    console.error(`[email] ${kind} delivery failed: ${error instanceof EmailDeliveryError ? error.message : 'unexpected error'}`)
  }
}

// ----- Request guard for the endpoints that can send mail -----

const EMAIL_PATHS = new Set(['/sign-up/email', '/send-verification-email', '/request-password-reset'])

/** Every answer takes at least this long, so a real send cannot be told apart from an unknown address by timing. */
export const MIN_EMAIL_RESPONSE_MS = 1_000

const ipMax = Number(process.env.AUTH_EMAIL_RATE_MAX ?? 3)

/**
 * Stored in PostgreSQL and shared by every server instance (see rate-limit.ts). Both are counted for
 * every request, whether or not the address has an account, so a 429 reveals nothing.
 */
export const EMAIL_LIMITS = {
  perIp: { scope: 'email-ip', max: Number.isFinite(ipMax) && ipMax > 0 ? ipMax : 3, windowSeconds: 60 },
  perAddress: { scope: 'email-address', max: 3, windowSeconds: 15 * 60 },
} satisfies Record<string, Limit>

/** First hop of x-forwarded-for (set by the hosting proxy), as Better Auth does. */
function clientIp(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return forwarded || request.headers.get('x-real-ip')?.trim() || 'unknown'
}

function rateLimited() {
  return new Response(JSON.stringify({ code: 'EMAIL_RATE_LIMITED', message: 'Too many email requests' }), {
    status: 429,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  })
}

export async function guardEmailRequest(request: Request, handle: (request: Request) => Promise<Response>): Promise<Response> {
  const path = new URL(request.url).pathname.replace(/^\/api\/auth/, '')
  if (request.method !== 'POST' || !EMAIL_PATHS.has(path)) return handle(request)

  const started = Date.now()
  const email = await request
    .clone()
    .json()
    .then((body: { email?: unknown }) => (typeof body?.email === 'string' ? normalizeEmail(body.email) : null))
    .catch(() => null)

  // Both counters always advance, so an address cannot be probed by spreading requests over IPs or the reverse.
  const [ipOk, addressOk] = await Promise.all([
    takeRateLimit(EMAIL_LIMITS.perIp, `${path}\n${clientIp(request)}`),
    email ? takeRateLimit(EMAIL_LIMITS.perAddress, `${path}\n${email}`) : true,
  ])
  const response = ipOk && addressOk ? await handle(request) : rateLimited()

  if (Math.random() < 0.01) void pruneRateLimits().catch(() => {})
  const remaining = MIN_EMAIL_RESPONSE_MS - (Date.now() - started)
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining))
  return response
}
