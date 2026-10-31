import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from './auth'
import { AppError } from './errors'

export type SessionUser = { id: string; email: string; role: 'OWNER' | 'ADMIN'; emailVerified: boolean }

function toUser(user: { id: string; email: string; role?: unknown; emailVerified?: unknown }): SessionUser {
  return { id: user.id, email: user.email, role: user.role === 'ADMIN' ? 'ADMIN' : 'OWNER', emailVerified: user.emailVerified === true }
}

/** For server components: the signed-in user (verified or not), or null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  return session ? toUser(session.user) : null
}

/**
 * For server components: sends signed-out visitors to the welcome page and unverified ones to the
 * verification screen. Sessions created before verification became mandatory still exist, so the
 * check is here and not only at sign-in.
 */
export async function requireUserOrRedirect(): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) redirect('/')
  if (!user.emailVerified) redirect('/verify-email')
  return user
}

/** For route handlers: the owner always comes from the session cookie, never from the request body. */
export async function requireUserFromRequest(request: Request): Promise<SessionUser> {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) throw new AppError('UNAUTHENTICATED')
  const user = toUser(session.user)
  if (!user.emailVerified) throw new AppError('EMAIL_NOT_VERIFIED')
  return user
}
