import { NextResponse } from 'next/server'
import { z } from 'zod'
import { AppError } from './errors'
import { requireUserFromRequest, type SessionUser } from './session'

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

type Handler<T> = (ctx: { user: SessionUser; body: T; request: Request }) => Promise<unknown>

/** Auth + CSRF + validation + uniform error mapping for POST endpoints. */
export function postRoute<S extends z.ZodType>(schema: S, handler: Handler<z.infer<S>>) {
  return async function POST(request: Request) {
    try {
      assertSameOrigin(request)
      const user = await requireUserFromRequest(request)
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
      console.error('[api] unexpected error', error)
      return NextResponse.json(
        { error: 'INTERNAL', message: 'משהו השתבש. נסו שוב בעוד רגע.' },
        { status: 500, headers: { 'Cache-Control': 'private, no-store' } },
      )
    }
  }
}
