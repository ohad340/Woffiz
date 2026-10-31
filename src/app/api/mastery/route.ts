import { z } from 'zod'
import { idempotencyKeyFrom, postRoute } from '@/server/http'
import { confirmMastery } from '@/server/progress'

const schema = z
  .object({
    levelId: z.uuid(),
    attemptId: z.uuid(),
    criterionVersion: z.number().int().min(1),
    planRevision: z.number().int().min(0),
  })
  .strict()

export const POST = postRoute(schema, ({ user, body, request }) =>
  confirmMastery(user.id, { ...body, idempotencyKey: idempotencyKeyFrom(request) }),
)
