import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { auth } from './auth'
import { AppError } from './errors'

export type SessionUser = { id: string; email: string; role: 'OWNER' | 'ADMIN' }

function toUser(user: { id: string; email: string; role?: unknown }): SessionUser {
  return { id: user.id, email: user.email, role: user.role === 'ADMIN' ? 'ADMIN' : 'OWNER' }
}

/** For server components: the signed-in user, or null. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  return session ? toUser(session.user) : null
}

/** For server components: sends signed-out visitors to the welcome page. */
export async function requireUserOrRedirect(): Promise<SessionUser> {
  const user = await getSessionUser()
  if (!user) redirect('/')
  return user
}

/** For route handlers: the owner always comes from the session cookie, never from the request body. */
export async function requireUserFromRequest(request: Request): Promise<SessionUser> {
  const session = await auth.api.getSession({ headers: request.headers })
  if (!session) throw new AppError('UNAUTHENTICATED')
  return toUser(session.user)
}
