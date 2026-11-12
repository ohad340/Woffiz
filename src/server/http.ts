import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from './db'
import { AppError } from './errors'
import { requireAdminFromRequest, requireUserFromRequest, type SessionUser } from './session'

/**
 * CSRF defence for cookie-authenticated JSON endpoints: state-changing requests must be JSON
 * and must come from this site's own origin. Better Auth enforces the same for its routes.
 */
export function assertSameOrigin(request: Request) {
  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.toLowerCase().startsWith('application/json')) throw new AppError('FORBIDDEN_ORIGIN')

  const origin = request.headers.get('origin')
  if (!origin) throw new AppError('FORBIDDEN_ORIGIN')
  const allowed = new Set([new URL(request.url).origin])
  if (process.env.BETTER_AUTH_URL) allowed.add(new URL(process.env.BETTER_AUTH_URL).origin)
  if (!allowed.has(origin)) throw new AppError('FORBIDDEN_ORIGIN')
}

export function idempotencyKeyFrom(request: Request): string {
  const key = request.headers.get('idempotency-key')?.trim()
  if (!key || key.length < 8 || key.length > 100) throw new AppError('IDEMPOTENCY_REQUIRED')
  return key
}

/**
 * Admin POST endpoints: same CSRF defence, but the caller must be an ADMIN in the database right now (anyone else
 * gets 404). Errors also carry `detail`, the English reason an administrator needs (e.g. which publication gate failed).
 */
export async function adminRoute(request: Request, handler: (ctx: { user: SessionUser; body: unknown }) => Promise<unknown>) {
  const headers = { 'Cache-Control': 'private, no-store' }
  try {
    assertSameOrigin(request)
    const user = await requireAdminFromRequest(request)
    const result = await handler({ user, body: await request.json().catch(() => undefined) })
    return NextResponse.json(result, { headers })
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ error: error.code, message: error.hebrew, detail: error.message }, { status: error.status, headers })
    }
    console.error('[api] unexpected error', error)
    return NextResponse.json({ error: 'INTERNAL', message: 'משהו השתבש. נסו שוב בעוד רגע.' }, { status: 500, headers })
  }
}

/**
 * A request can be past authentication when its account is deleted (docs/DECISIONS.md P4-4). Its domain write then
 * fails with a Prisma or foreign-key error that would surface as a 500. True only when the session user's row is gone;
 * any failure of the lookup itself counts as "not deleted", so an unexpected error stays a 500.
 */
export async function sessionUserDeleted(
  userId: string | undefined,
  rowExists: (id: string) => Promise<boolean> = async (id) => (await prisma.user.count({ where: { id } })) > 0,
): Promise<boolean> {
  if (!userId) return false
  try {
    return !(await rowExists(userId))
  } catch {
    return false
  }
}

type Handler<T> =(ctx: { user: SessionUser; body: T; request: Request }) => Promise<unknown>

/** Auth + CSRF + validation + uniform error mapping for POST endpoints. */
export function postRoute<S extends z.ZodType>(schema: S, handler: Handler<z.infer<S>>) {
  return async function POST(request: Request) {
    let user: SessionUser | undefined
    try {
      assertSameOrigin(request)
      user = await requireUserFromRequest(request)
      const parsed = schema.safeParse(await request.json().catch(() => undefined))
      if (!parsed.success) throw new AppError('VALIDATION')
      const result = await handler({ user, body: parsed.data, request })
      return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store' } })
    } catch (error) {
      if (error instanceof AppError) {
        return NextResponse.json(
          { error: error.code, message: error.hebrew },
          { status: error.status, headers: { 'Cache-Control': 'private, no-store' } },
        )
      }
      if (await sessionUserDeleted(user?.id)) {
        // The account was deleted while this request ran: the failure is a consequence of that, not a fault.
        // Only the code is logged (an error object can carry query text).
        console.warn('[api] request of a deleted account: UNAUTHENTICATED')
        const gone = new AppError('UNAUTHENTICATED')
        return NextResponse.json({ error: gone.code, message: gone.hebrew }, { status: gone.status, headers: { 'Cache-Control': 'private, no-store' } })
      }
      console.error('[api] unexpected error', error)
      return NextResponse.json(
        { error: 'INTERNAL', message: 'משהו השתבש. נסו שוב בעוד רגע.' },
        { status: 500, headers: { 'Cache-Control': 'private, no-store' } },
      )
    }
  }
}
