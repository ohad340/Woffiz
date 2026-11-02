import { z } from 'zod'
import { postRoute } from '@/server/http'
import { completeOnboarding } from '@/server/onboarding'

// Waits for the model (one retry included); see docs/DECISIONS.md.
export const maxDuration = 300

export const POST = postRoute(z.object({}).strict(), ({ user }) => completeOnboarding(user.id))
