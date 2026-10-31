import { z } from 'zod'
import { idempotencyKeyFrom, postRoute } from '@/server/http'
import { recordAttempt } from '@/server/progress'

const schema = z
  .object({ levelId: z.uuid(), outcome: z.enum(['INDEPENDENT', 'WITH_HELP', 'STRUGGLING']) })
  .strict()

export const POST = postRoute(schema, ({ user, body, request }) =>
  recordAttempt(user.id, { ...body, idempotencyKey: idempotencyKeyFrom(request) }),
)
