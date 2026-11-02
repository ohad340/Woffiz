import { z } from 'zod'
import { idempotencyKeyFrom, postRoute } from '@/server/http'
import { adaptCurrentExercise } from '@/server/revision'

// Waits for the model (one retry included); see docs/DECISIONS.md.
export const maxDuration = 300

// The Idempotency-Key makes a repeated request return the stored result instead of generating again.
export const POST = postRoute(z.object({ planRevision: z.number().int().min(0) }).strict(), ({ user, body, request }) =>
  adaptCurrentExercise(user.id, body, idempotencyKeyFrom(request)),
)
