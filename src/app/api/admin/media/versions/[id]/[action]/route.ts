import { z } from 'zod'
import { AppError } from '@/server/errors'
import { adminRoute } from '@/server/http'
import { markReviewed, publish, submitReview, withdraw } from '@/server/media/lifecycle'

const uuid = z.string().uuid()

const reviewBody = z
  .object({
    kind: z.enum(['TECHNICAL', 'CONTENT']),
    decision: z.enum(['APPROVED', 'CHANGES_REQUESTED']),
    checklist: z.record(z.string().max(80), z.boolean()),
    notes: z.string().max(1000).optional(),
    fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict()
const withdrawBody = z.object({ reason: z.enum(['TECHNICAL', 'SAFETY']), note: z.string().max(1000) }).strict()
const empty = z.object({}).strict()

export async function POST(request: Request, context: { params: Promise<{ id: string; action: string }> }) {
  return adminRoute(request, async ({ user, body }) => {
    const { id, action } = await context.params
    if (!uuid.safeParse(id).success) throw new AppError('NOT_FOUND')
    const parse = <S extends z.ZodType>(schema: S) => {
      const parsed = schema.safeParse(body)
      if (!parsed.success) throw new AppError('VALIDATION', parsed.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join('; '))
      return parsed.data as z.infer<S>
    }
    switch (action) {
      case 'review':
        return submitReview(user.id, id, parse(reviewBody))
      case 'mark-reviewed':
        parse(empty)
        return markReviewed(user.id, id)
      case 'publish':
        parse(empty)
        return publish(user.id, id)
      case 'withdraw':
        return withdraw(user.id, id, parse(withdrawBody))
      default:
        throw new AppError('NOT_FOUND')
    }
  })
}
