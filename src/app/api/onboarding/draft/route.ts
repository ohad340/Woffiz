import { z } from 'zod'
import { onboardingAnswersSchema } from '@/server/content'
import { postRoute } from '@/server/http'
import { saveOnboardingDraft } from '@/server/onboarding'

const schema = z
  .object({ step: z.number().int().min(0).max(4), answers: onboardingAnswersSchema.partial() })
  .strict()

export const POST = postRoute(schema, ({ user, body }) => saveOnboardingDraft(user.id, body))
