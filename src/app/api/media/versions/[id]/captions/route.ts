import { prisma } from '@/server/db'
import { AppError } from '@/server/errors'
import { publishedCaptions } from '@/server/media/resolve'
import { requireUserFromRequest } from '@/server/session'

// Hebrew captions of a PUBLISHED demonstration, served from our own origin for the <track> element. Drafts,
// reviewed-but-unpublished and withdrawn versions answer 404 (administrators preview those through /api/admin/...).
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireUserFromRequest(request)
    const { id } = await context.params
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new AppError('NOT_FOUND')
    const captions = await publishedCaptions(prisma, id)
    if (captions === null) throw new AppError('NOT_FOUND')
    return new Response(captions, { headers: { 'Content-Type': 'text/vtt; charset=utf-8', 'Cache-Control': 'private, max-age=300' } })
  } catch (error) {
    if (error instanceof AppError) return new Response(null, { status: error.status, headers: { 'Cache-Control': 'private, no-store' } })
    throw error
  }
}
