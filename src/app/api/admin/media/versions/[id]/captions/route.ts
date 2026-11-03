import { prisma } from '@/server/db'
import { AppError } from '@/server/errors'
import { requireAdminFromRequest } from '@/server/session'

// Admin preview of a version's Hebrew captions (any status). Owners get captions in slice 3D, for published versions only.
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    await requireAdminFromRequest(request)
    const { id } = await context.params
    if (!/^[0-9a-f-]{36}$/.test(id)) throw new AppError('NOT_FOUND')
    const version = await prisma.mediaVersion.findUnique({ where: { id }, select: { captionsVtt: true } })
    if (!version) throw new AppError('NOT_FOUND')
    return new Response(version.captionsVtt, { headers: { 'Content-Type': 'text/vtt; charset=utf-8', 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    if (error instanceof AppError) return new Response(null, { status: error.status, headers: { 'Cache-Control': 'private, no-store' } })
    throw error
  }
}
