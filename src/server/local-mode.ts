/**
 * Sign-up is open only on a developer's machine until the product can verify email addresses.
 * ALL of these must hold; any deployed environment fails at least one, so nobody can register there:
 *
 *   1. LOCAL_SIGNUP=true
 *   2. APP_ENV=local
 *   3. BETTER_AUTH_URL points at this machine (localhost / 127.0.0.1 / [::1])
 *
 * Opening it elsewhere needs a real email provider with mandatory address verification and
 * password reset first (see docs/DECISIONS.md).
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

export function signUpEnabled(env: Env = process.env): boolean {
  return env.LOCAL_SIGNUP === 'true' && env.APP_ENV === 'local' && isLocalUrl(env.BETTER_AUTH_URL)
}
