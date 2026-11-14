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
 *   pilot   TESTER_EMAIL (when set) and the addresses of PILOT_EMAILS, only while that list is ACTIVE (see below)
 *   open    any address (local machine + outbox + LOCAL_SIGNUP=true)
 */
export type SignUpPolicy =
  | { kind: 'closed' }
  | { kind: 'tester'; email: string }
  | { kind: 'pilot'; tester: string | null; emails: ReadonlySet<string> }
  | { kind: 'open' }

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

// ----- Pilot allowlist (Phase 4, slice 5; docs/DECISIONS.md P4-5) -----
//
// PILOT_EMAILS is a server-only list of addresses admitted to REGISTRATION next to TESTER_EMAIL. It is inert unless the
// owner has confirmed a verified sending domain: on Resend it counts only when EMAIL_SENDER_VERIFIED is exactly "true" AND
// EMAIL_FROM is outside the shared resend.dev domain (which delivers only to the Resend account owner). On the local outbox
// (a local machine, nothing leaves it) it counts without the flag, so the policy can be tested. The list is never logged,
// never rendered and never sent to the client; a bad list is ignored as a whole (fail closed).

/** Longest raw PILOT_EMAILS, in characters, checked before anything is split. */
export const PILOT_MAX_RAW = 16_384
/** The pilot targets 20-30 owners; more distinct entries than this is treated as a mistake. */
export const PILOT_MAX_ENTRIES = 200
const PRINTABLE_ASCII = /^[\x21-\x7E]+$/

export type PilotList =
  | { kind: 'none' }
  | { kind: 'valid'; emails: ReadonlySet<string> }
  | { kind: 'invalid'; reason: 'too-large' | 'malformed' | 'too-many'; count: number }

/**
 * Parses PILOT_EMAILS. Separators are commas, semicolons and any whitespace; empty items are dropped. Every entry must be
 * printable ASCII AS TYPED (checked before lower-casing, so a look-alike such as the Kelvin sign cannot become a plain
 * letter), at most 254 characters, and match the shared email shape. No provider folding: a +tag address is listed exactly
 * as typed, lower-cased. Any bad entry, or more than PILOT_MAX_ENTRIES distinct entries, invalidates the WHOLE list.
 * The result carries an address only inside the valid set; reasons and counts never do.
 */
export function parsePilotEmails(raw: string | undefined): PilotList {
  if (raw === undefined) return { kind: 'none' }
  if (raw.length > PILOT_MAX_RAW) return { kind: 'invalid', reason: 'too-large', count: 0 }
  const items = raw.split(/[,;\s]+/).filter((item) => item.length > 0)
  if (items.length === 0) return { kind: 'none' }
  const seen = new Set<string>()
  const emails = new Set<string>()
  let malformed = false
  for (const item of items) {
    const email = normalizeEmail(item)
    seen.add(email)
    if (!PRINTABLE_ASCII.test(item) || email.length > 254 || !EMAIL_SHAPE.test(email)) malformed = true
    else emails.add(email)
  }
  if (malformed) return { kind: 'invalid', reason: 'malformed', count: seen.size }
  if (emails.size > PILOT_MAX_ENTRIES) return { kind: 'invalid', reason: 'too-many', count: emails.size }
  return { kind: 'valid', emails }
}

/** The domain of a sender such as "Woffiz <hello@mail.example.test>" or "hello@mail.example.test", or null if unparsable. */
export function senderDomain(from: string): string | null {
  const trimmed = from.trim()
  const angle = /<([^<>]*)>/.exec(trimmed)
  const address = (angle ? angle[1]! : trimmed).trim()
  const at = address.lastIndexOf('@')
  if (at < 1) return null
  const domain = address.slice(at + 1).trim().toLowerCase()
  return domain.length > 0 && !/\s/.test(domain) ? domain : null
}

/** The shared Resend domain (resend.dev and its subdomains) or a sender that cannot be parsed: fail closed. */
export function isSharedSender(from: string): boolean {
  const domain = senderDomain(from)
  return domain === null || domain === 'resend.dev' || domain.endsWith('.resend.dev')
}

/** The owner's explicit confirmation that the sending domain is verified and a delivery test succeeded. */
const senderVerified = (env: Env) => env.EMAIL_SENDER_VERIFIED?.trim().toLowerCase() === 'true'

/** One line per reason per process, so the per-request calls (welcome page, every send) do not flood the log. */
const warned = new Set<string>()
export type Warn = (reason: string, message: string) => void
const warnOnce: Warn = (reason, message) => {
  if (warned.has(reason)) return
  warned.add(reason)
  console.warn(message)
}

/** The honored pilot list, or null. Warns (fixed text, counts only) when PILOT_EMAILS is set but not honored. */
function activePilotList(env: Env, transport: EmailTransport, warn: Warn): ReadonlySet<string> | null {
  if (transport.kind === 'none' || !env.PILOT_EMAILS?.trim()) return null
  const parsed = parsePilotEmails(env.PILOT_EMAILS)
  if (parsed.kind === 'none') return null
  if (parsed.kind === 'invalid') {
    warn(`invalid-${parsed.reason}`, `[email] PILOT_EMAILS ignored: the list is invalid (${parsed.reason}, ${parsed.count} entries). Registration stays tester-only.`)
    return null
  }
  if (transport.kind === 'resend') {
    let honored = true
    if (!senderVerified(env)) {
      warn('flag', '[email] PILOT_EMAILS ignored: EMAIL_SENDER_VERIFIED is not true. Registration stays tester-only.')
      honored = false
    }
    if (isSharedSender(transport.from)) {
      warn('shared-sender', '[email] PILOT_EMAILS ignored: EMAIL_FROM is on the shared resend.dev domain (or cannot be parsed). Registration stays tester-only.')
      honored = false
    }
    if (!honored) return null
  }
  return parsed.emails
}

/** Priority: local open sign-up, then an ACTIVE pilot list, then tester-only on Resend, otherwise closed. */
export function signUpPolicy(env: Env = process.env, warn: Warn = warnOnce): SignUpPolicy {
  const transport = emailTransport(env)
  if (transport.kind === 'outbox' && signUpEnabled(env)) return { kind: 'open' }
  const emails = activePilotList(env, transport, warn)
  if (transport.kind === 'resend') return emails ? { kind: 'pilot', tester: transport.tester, emails } : { kind: 'tester', email: transport.tester }
  if (transport.kind === 'outbox' && emails) return { kind: 'pilot', tester: null, emails }
  return { kind: 'closed' }
}

export function signUpAllowedFor(policy: SignUpPolicy, email: unknown): boolean {
  if (policy.kind === 'open') return true
  if (typeof email !== 'string') return false
  if (policy.kind === 'tester') return normalizeEmail(email) === policy.email
  if (policy.kind === 'pilot') {
    const normalized = normalizeEmail(email)
    return (policy.tester !== null && normalized === policy.tester) || policy.emails.has(normalized)
  }
  return false
}
