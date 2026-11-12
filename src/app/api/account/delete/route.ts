import { NextResponse } from 'next/server'
import { z } from 'zod'
import { deleteAccount, expiredAuthCookies } from '@/server/account-deletion'
import { AppError } from '@/server/errors'
import { assertSameOrigin } from '@/server/http'
import { requireUserFromRequest } from '@/server/session'

// Not strict on purpose: the body is read for `password` only, so any other field (including another account's id) is
// never looked at. The account to delete is always the session's.
const schema = z.object({ password: z.string().min(1).max(128) })

const HEADERS = { 'Cache-Control': 'private, no-store' }

/** Permanent deletion of the signed-in owner's account (docs/DECISIONS.md P4-4). */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request)
    const user = await requireUserFromRequest(request)
    const parsed = schema.safeParse(await request.json().catch(() => undefined))
    if (!parsed.success) throw new AppError('VALIDATION')

    await deleteAccount(user.id, parsed.data.password)

    // Every session is already gone (database rows); this also clears the cookie on the device that asked.
    const response = NextResponse.json({ deleted: true }, { headers: HEADERS })
    for (const { name, value, attributes } of expiredAuthCookies()) response.cookies.set(name, value, attributes)
    return response
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ error: error.code, message: error.hebrew }, { status: error.status, headers: HEADERS })
    }
    // Only a code is logged: the error object could carry query text, and the request carried a password.
    console.error('[api] account deletion failed: INTERNAL')
    return NextResponse.json({ error: 'INTERNAL', message: 'משהו השתבש. נסו שוב בעוד רגע.' }, { status: 500, headers: HEADERS })
  }
}
