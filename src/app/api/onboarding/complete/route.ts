import { z } from 'zod'
import { postRoute } from '@/server/http'
import { completeOnboarding } from '@/server/onboarding'

export const POST = postRoute(z.object({}).strict(), ({ user }) => completeOnboarding(user.id))
