import { z } from 'zod'
import { idempotencyKeyFrom, postRoute } from '@/server/http'
import { evaluateAlerts, runAfterResponse } from '@/server/ops'
import { reviseFuturePlan } from '@/server/revision'

// Waits for the model (one retry included); see docs/DECISIONS.md.
export const maxDuration = 300

// The Idempotency-Key makes a repeated request return the stored result instead of generating again.
const handle = postRoute(z.object({ planRevision: z.number().int().min(0) }).strict(), ({ user, body, request }) =>
  reviseFuturePlan(user.id, body, idempotencyKeyFrom(request)),
)

// Generation failures and the AI budget are evaluated after the response (docs/DECISIONS.md P4-6); registered before any work.
export async function POST(request: Request) {
  runAfterResponse(() => evaluateAlerts('generation'))
  return handle(request)
}
