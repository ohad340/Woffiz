import { isLocalMachine, signUpEnabled, type Env } from '../local-mode'

/**
 * How authentication email leaves the server, read only from server environment variables.
 *
 *   resend  RESEND_API_KEY + EMAIL_FROM + TESTER_EMAIL + BETTER_AUTH_URL are all set. During the test
 *           phase mail is delivered ONLY to TESTER_EMAIL.
 *   outbox  EMAIL_TRANSPORT=outbox on a local machine: messages are written as JSON files to
 *           EMAIL_OUTBOX_DIR instead of being sent (automated tests and offline development).
 *   none    anything else. Nothing is sent and registration is closed.
 */
export type EmailTransport =
  | { kind: 'resend'; apiKey: string; from: string; tester: string }
  | { kind: 'outbox'; dir: string }
  | { kind: 'none' }

/**
 * Who may register:
 *   closed  nobody (no working email, or local open sign-up not enabled)
 *   tester  only TESTER_EMAIL (Resend configured, any environment)
 *   open    any address (local machine + outbox + LOCAL_SIGNUP=true)
 */
export type SignUpPolicy = { kind: 'closed' } | { kind: 'tester'; email: string } | { kind: 'open' }

export const normalizeEmail = (value: string) => value.trim().toLowerCase()

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function emailTransport(env: Env = process.env): EmailTransport {
  if (env.EMAIL_TRANSPORT === 'outbox') {
    return isLocalMachine(env) ? { kind: 'outbox', dir: env.EMAIL_OUTBOX_DIR?.trim() || '.email-outbox' } : { kind: 'none' }
  }
  const apiKey = env.RESEND_API_KEY?.trim()
  const from = env.EMAIL_FROM?.trim()
  const tester = env.TESTER_EMAIL ? normalizeEmail(env.TESTER_EMAIL) : ''
  if (apiKey && from && EMAIL_SHAPE.test(tester) && env.BETTER_AUTH_URL) return { kind: 'resend', apiKey, from, tester }
  return { kind: 'none' }
}

export function signUpPolicy(env: Env = process.env): SignUpPolicy {
  const transport = emailTransport(env)
  if (transport.kind === 'resend') return { kind: 'tester', email: transport.tester }
  if (transport.kind === 'outbox' && signUpEnabled(env)) return { kind: 'open' }
  return { kind: 'closed' }
}

export function signUpAllowedFor(policy: SignUpPolicy, email: unknown): boolean {
  if (policy.kind === 'open') return true
  if (policy.kind === 'tester') return typeof email === 'string' && normalizeEmail(email) === policy.email
  return false
}
