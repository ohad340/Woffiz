import { NextResponse } from 'next/server'
import { prisma } from '@/server/db'
import { AppError } from '@/server/errors'
import { playbackFor } from '@/server/media/resolve'
import { requireUserFromRequest } from '@/server/session'

// Owner playback and URL refresh: fresh short-lived URLs for the demonstration of one exercise version the owner can
// open. A GET that only reads: no attempt, mastery, plan or AI code is reachable from here.
export async function GET(request: Request) {
  const headers = { 'Cache-Control': 'private, no-store' }
  try {
    const user = await requireUserFromRequest(request)
    const url = new URL(request.url)
    const id = url.searchParams.get('exerciseVersionId') ?? ''
    const variant = url.searchParams.get('variant') ?? 'STANDARD'
    if (!/^[0-9a-f-]{36}$/.test(id) || (variant !== 'STANDARD' && variant !== 'EASIER')) throw new AppError('NOT_FOUND')
    return NextResponse.json(await playbackFor(prisma, user.id, id, variant), { headers })
  } catch (error) {
    if (error instanceof AppError) return NextResponse.json({ error: error.code, message: error.hebrew }, { status: error.status, headers })
    throw error
  }
}
