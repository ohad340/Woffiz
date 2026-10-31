/**
 * Development email stand-in. Phase 1 has no email provider, so sign-in links go to the server
 * log and a tiny in-memory inbox. It is strictly local and explicitly enabled: ALL of these must hold.
 *
 *   1. DEV_EMAIL_INBOX=true
 *   2. APP_ENV=local
 *   3. BETTER_AUTH_URL points at this machine (localhost / 127.0.0.1 / [::1])
 *
 * Any deployed environment fails at least one, so both the log line and /api/dev/inbox stay off there.
 */

type Env = Record<string, string | undefined>

function isLocalUrl(value: string | undefined) {
  if (!value) return false
  try {
    const { hostname } = new URL(value)
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname.endsWith('.localhost')
  } catch {
    return false
  }
}

export function devInboxEnabled(env: Env = process.env): boolean {
  return env.DEV_EMAIL_INBOX === 'true' && env.APP_ENV === 'local' && isLocalUrl(env.BETTER_AUTH_URL)
}

type Message = { email: string; url: string; at: number }

const globalStore = globalThis as unknown as { __woffizDevInbox?: Map<string, Message> }
const inbox = (globalStore.__woffizDevInbox ??= new Map<string, Message>())

/** The auth plugin's `sendMagicLink`. Without a configured provider, nothing is ever sent. */
export async function deliverMagicLink({ email, url }: { email: string; url: string }) {
  if (!devInboxEnabled()) {
    throw new Error('No email provider is configured for this environment.')
  }
  inbox.set(email.toLowerCase(), { email, url, at: Date.now() })
  console.info(`[dev-inbox] Development mode - no email was sent. Sign-in link for ${email}: ${url}`)
}

export function latestDevMessage(email: string): Message | undefined {
  if (!devInboxEnabled()) return undefined
  return inbox.get(email.toLowerCase())
}

export function clearDevInbox() {
  inbox.clear()
}
