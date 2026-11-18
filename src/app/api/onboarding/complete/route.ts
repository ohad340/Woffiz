import { z } from 'zod'
import { postRoute } from '@/server/http'
import { completeOnboarding } from '@/server/onboarding'
import { evaluateAlerts, runAfterResponse } from '@/server/ops'

// Waits for the model (one retry included); see docs/DECISIONS.md.
export const maxDuration = 300

const handle = postRoute(z.object({}).strict(), ({ user }) => completeOnboarding(user.id))

// Generation failures and the AI budget are evaluated after the response (docs/DECISIONS.md P4-6); registered before any work.
export async function POST(request: Request) {
  runAfterResponse(() => evaluateAlerts('generation'))
  return handle(request)
}
