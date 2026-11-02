import { z } from 'zod'
import { exerciseContentSchema, type OnboardingAnswers } from '../content'

export const TOPICS = ['TOILET', 'BITING', 'SLEEP', 'ALONE', 'COMMANDS'] as const
export type TopicName = (typeof TOPICS)[number]

/** One generated level. Position is the array index, so positions are always contiguous. */
export const generatedLevelSchema = exerciseContentSchema.extend({
  stableKey: z.string().regex(/^[a-z0-9-]{3,40}$/),
  topic: z.enum(TOPICS),
  /** stableKeys of earlier levels this level builds on. */
  prerequisites: z.array(z.string().min(3).max(40)).max(4),
  /** Id from the offered media catalog, or null when none is offered/compatible. */
  mediaId: z.string().min(1).max(60).nullable(),
})
export type GeneratedLevel = z.infer<typeof generatedLevelSchema>

export const planOutputSchema = z.object({
  /** Short Hebrew explanation for the owner of why the path looks like this. */
  rationale: z.string().min(1).max(500),
  levels: z.array(generatedLevelSchema).min(12).max(16),
})
export type PlanOutput = z.infer<typeof planOutputSchema>

export const adaptOutputSchema = z.object({
  explanation: z.string().min(1).max(300),
  exercise: exerciseContentSchema.extend({ mediaId: z.string().min(1).max(60).nullable() }),
})
export type AdaptOutput = z.infer<typeof adaptOutputSchema>

export const reviseOutputSchema = z.object({
  rationale: z.string().min(1).max(500),
  levels: z.array(generatedLevelSchema).min(1).max(15),
})
export type ReviseOutput = z.infer<typeof reviseOutputSchema>

export function jsonSchemaOf(schema: z.ZodType): unknown {
  return z.toJSONSchema(schema)
}

// ----- Inputs handed to the generator (also read by the local fake) -----

export type CatalogEntry = { id: string; family: string; variant: 'STANDARD' | 'EASIER' }

export type ProfileInput = Pick<OnboardingAnswers, 'name' | 'age' | 'skills' | 'difficulties' | 'limitations' | 'time'>

export type PlanInputBase = {
  profile: ProfileInput
  mediaCatalog: CatalogEntry[]
  policyVersion: string
}

export type InitialPlanInput = PlanInputBase & { task: 'initial_plan'; levelCount: { min: number; max: number } }

export type AttemptSummary = { outcome: 'INDEPENDENT' | 'WITH_HELP' | 'STRUGGLING'; mode: 'CURRENT' | 'REVIEW' }

export type AdaptCurrentInput = PlanInputBase & {
  task: 'adapt_current'
  currentLevel: { stableKey: string | null; topic: TopicName; position: number }
  currentExercise: z.infer<typeof exerciseContentSchema>
  recentAttempts: AttemptSummary[]
}

export type ReviseFutureInput = PlanInputBase & {
  task: 'revise_future'
  completedSummaries: { stableKey: string | null; topic: TopicName; title: string }[]
  currentLevel: { stableKey: string | null; topic: TopicName; position: number }
  lockedLevels: GeneratedLevel[]
  recentAttempts: AttemptSummary[]
  totalLevelBounds: { min: number; max: number }
}
