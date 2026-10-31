/**
 * Open sign-up (any address) exists only on a developer's machine, and only together with the local
 * email outbox (see email/config.ts). ALL of these must hold; any deployed environment fails at least one:
 *
 *   1. LOCAL_SIGNUP=true
 *   2. APP_ENV=local
 *   3. BETTER_AUTH_URL points at this machine (localhost / 127.0.0.1 / [::1])
 *
 * Elsewhere registration is closed or limited to TESTER_EMAIL (see docs/DECISIONS.md).
 */

export type Env = Record<string, string | undefined>

function isLocalUrl(value: string | undefined) {
  if (!value) return false
  try {
    const { hostname } = new URL(value)
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname.endsWith('.localhost')
  } catch {
    return false
  }
}

/** APP_ENV=local and BETTER_AUTH_URL on this machine. */
export function isLocalMachine(env: Env = process.env): boolean {
  return env.APP_ENV === 'local' && isLocalUrl(env.BETTER_AUTH_URL)
}

export function signUpEnabled(env: Env = process.env): boolean {
  return env.LOCAL_SIGNUP === 'true' && isLocalMachine(env)
}
