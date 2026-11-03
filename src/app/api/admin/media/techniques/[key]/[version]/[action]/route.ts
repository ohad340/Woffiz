import { z } from 'zod'
import { AppError } from '@/server/errors'
import { adminRoute } from '@/server/http'
import { liftSuspension, suspendTechnique } from '@/server/media/lifecycle'

const body = z.object({ note: z.string().max(1000) }).strict()

export async function POST(request: Request, context: { params: Promise<{ key: string; version: string; action: string }> }) {
  return adminRoute(request, async ({ user, body: raw }) => {
    const { key, version, action } = await context.params
    const number = Number(version)
    if (!/^[a-z0-9-]{3,60}$/.test(key) || !Number.isInteger(number) || number < 1) throw new AppError('NOT_FOUND')
    const parsed = body.safeParse(raw)
    if (!parsed.success) throw new AppError('VALIDATION', 'a note is required')
    if (action === 'suspend') return suspendTechnique(user.id, key, number, parsed.data.note)
    if (action === 'lift') return liftSuspension(user.id, key, number, parsed.data.note)
    throw new AppError('NOT_FOUND')
  })
}
